import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, render, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server.js';
import { store } from '../../mocks/store.js';
import { API_BASE } from '../../api/config.js';
import { qk } from '../../hooks/queryKeys.js';
import { detailRefetchInterval } from '../../hooks/useTransaction.js';
import { useRetryTransaction } from '../../hooks/useRetryTransaction.js';
import { getTransaction } from '../../api/transactions.js';
import DashboardPage from '../../pages/DashboardPage.jsx';

function renderDashboard(route = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, queryClient, user: userEvent.setup() };
}

describe('T-2 detailRefetchInterval (FR-6 polling contract)', () => {
  it('polls every 2s for active statuses and stops for terminal statuses', () => {
    const q = (status) => ({ state: { data: status ? { status } : undefined } });
    expect(detailRefetchInterval(q('PENDING'))).toBe(2000);
    expect(detailRefetchInterval(q('PROCESSING'))).toBe(2000);
    expect(detailRefetchInterval(q('RETRY'))).toBe(2000);
    expect(detailRefetchInterval(q('SUCCESS'))).toBe(false);
    expect(detailRefetchInterval(q('FAILED'))).toBe(false);
  });
});

describe('T-2 query options (FR-9)', () => {
  it('stats and transaction-list queries use refetchInterval 3000, no background refetch, focus refetch on; table uses keepPreviousData', async () => {
    const { queryClient } = renderDashboard('/');
    await screen.findAllByText(/txn_/);

    const statsQuery = queryClient.getQueryCache().find({ queryKey: qk.stats });
    expect(statsQuery.options.refetchInterval).toBe(3000);
    expect(statsQuery.options.refetchIntervalInBackground).toBe(false);
    expect(statsQuery.options.refetchOnWindowFocus).toBe(true);

    const listQuery = queryClient.getQueryCache().find({ queryKey: qk.transactionList({ page: 1, page_size: 20 }) });
    expect(listQuery).toBeTruthy();
    expect(listQuery.options.refetchInterval).toBe(3000);
    expect(listQuery.options.refetchIntervalInBackground).toBe(false);
    expect(listQuery.options.refetchOnWindowFocus).toBe(true);
    expect(listQuery.options.placeholderData).toBeTypeOf('function');
  });
});

describe('T-2 DashboardPage filters (FR-2, FR-10)', () => {
  it('changing the status filter sends status= to the API and resets page to 1', async () => {
    const seen = [];
    server.use(
      http.get(`${API_BASE}/transactions`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(Object.fromEntries(url.searchParams));
        return HttpResponse.json(store.list({ status: url.searchParams.get('status') || undefined, page: Number(url.searchParams.get('page')) || 1 }));
      })
    );
    // Start on page=2 (URL) so we can prove the filter change resets it to 1.
    const { user } = renderDashboard('/?page=2');
    await screen.findByLabelText('Status');
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0].page).toBe('2');

    await user.selectOptions(screen.getByLabelText('Status'), 'FAILED');

    await waitFor(() => {
      const last = seen[seen.length - 1];
      expect(last.status).toBe('FAILED');
      expect(last.page).toBe('1');
    });
  });

  it('renders empty state with a working clear-filters button when no rows match', async () => {
    const { user } = renderDashboard('/?status=SUCCESS&customer_id=cust_2&type=DEBIT');
    expect(await screen.findByText('No transactions match these filters')).toBeInTheDocument();

    const clearButtons = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clearButtons[clearButtons.length - 1]);
    await screen.findAllByText(/txn_/);
    expect(screen.queryByText('No transactions match these filters')).not.toBeInTheDocument();
  });
});

describe('T-2 DashboardPage error / offline states (FR-10)', () => {
  it('shows an ErrorState with a working Retry button on a 500', async () => {
    let calls = 0;
    server.use(
      http.get(`${API_BASE}/transactions`, () => {
        calls += 1;
        return HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom', details: null } }, { status: 500 });
      })
    );
    const { user } = renderDashboard('/');
    await screen.findByRole('alert');
    expect(screen.getByText('boom')).toBeInTheDocument();
    const callsBeforeRetry = calls;

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(calls).toBeGreaterThan(callsBeforeRetry));
  });

  it('shows an offline message on a status-0 network error', async () => {
    server.use(http.get(`${API_BASE}/transactions`, () => HttpResponse.error()));
    renderDashboard('/');
    expect(
      await screen.findByText('Cannot reach the API — you may be offline or the server is down.')
    ).toBeInTheDocument();
  });

  it('keeps old rows and shows a warning banner when a background refetch fails', async () => {
    let n = 0;
    server.use(
      http.get(`${API_BASE}/transactions`, () => {
        n += 1;
        if (n === 1) return HttpResponse.json(store.list({}));
        return HttpResponse.json({ error: { code: 'INTERNAL', message: 'refresh boom', details: null } }, { status: 500 });
      })
    );
    renderDashboard('/');
    await screen.findAllByText(/txn_/);

    await waitFor(() => expect(n).toBeGreaterThanOrEqual(2), { timeout: 6000 });

    await waitFor(() => expect(screen.getByText(/Showing last known data/)).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.getByText(/refresh boom/)).toBeInTheDocument();
    expect(screen.getAllByText(/txn_/).length).toBeGreaterThan(0);
  }, 10000);
});

describe('T-2 StatusBadge (FR-11)', () => {
  it('renders visible status text in addition to the glyph', async () => {
    renderDashboard('/?status=FAILED');
    const rows = await screen.findAllByRole('row');
    const dataRow = rows.find((r) => within(r).queryByText('txn_6'));
    expect(within(dataRow).getByText('FAILED')).toBeInTheDocument();
  });
});

describe('T-2 useRetryTransaction (FR-7)', () => {
  function renderRetryHook() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useRetryTransaction(), { wrapper });
    return { result, queryClient };
  }

  it('on success: merges the response into the detail cache and invalidates the full invalidation set', async () => {
    const { result, queryClient } = renderRetryHook();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const txn = { transaction_id: 'txn_6', customer_id: 'cust_3' };

    act(() => {
      result.current.mutate(txn);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(qk.transaction('txn_6'))).toMatchObject({ status: 'PENDING' });
    const invalidatedKeys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        JSON.stringify(qk.transaction('txn_6')),
        JSON.stringify(qk.transactionLists),
        JSON.stringify(qk.stats),
        JSON.stringify(qk.customerBalance('cust_3')),
        JSON.stringify(qk.customerTransactionsAll('cust_3')),
        JSON.stringify(qk.customers),
      ])
    );
  });

  it('on 409 NOT_RETRYABLE: shows the stale-state message and invalidates transaction/list/stats to force a refetch', async () => {
    server.use(
      http.post(`${API_BASE}/transactions/:id/retry`, ({ params }) => {
        store.update(params.id, { status: 'SUCCESS', retry_eligible: false });
        return HttpResponse.json(
          { error: { code: 'NOT_RETRYABLE', message: "This transaction's status changed", details: null } },
          { status: 409 }
        );
      })
    );
    const { result, queryClient } = renderRetryHook();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const txn = { transaction_id: 'txn_12', customer_id: 'cust_3' };

    act(() => {
      result.current.mutate(txn);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.message).toBe("This transaction's status changed");
    const invalidatedKeys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        JSON.stringify(qk.transaction('txn_12')),
        JSON.stringify(qk.transactionLists),
        JSON.stringify(qk.stats),
      ])
    );

    // The refetch the invalidation triggers reflects the mutated store (status changed underneath us).
    const refetched = await getTransaction('txn_12');
    expect(refetched.status).toBe('SUCCESS');
  });
});

describe('T-2 TransactionTable row retry (FR-7 row case, review fix)', () => {
  it('shows the stale-state message in the table row after a 409 flips retry_eligible to false on refetch', async () => {
    server.use(
      http.post(`${API_BASE}/transactions/:id/retry`, ({ params }) => {
        // Simulate another actor having already retried it: store now reports not-eligible.
        store.update(params.id, { retry_eligible: false });
        return HttpResponse.json(
          { error: { code: 'NOT_RETRYABLE', message: "This transaction's status changed", details: null } },
          { status: 409 }
        );
      })
    );

    const { user } = renderDashboard('/?status=FAILED');
    const rows = await screen.findAllByRole('row');
    const row = rows.find((r) => within(r).queryByText('txn_6'));
    expect(row).toBeTruthy();

    await user.click(within(row).getByRole('button', { name: 'Retry' }));

    // The row's Retry button disappears once the refetch reports retry_eligible: false...
    await waitFor(() => expect(within(row).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument());
    // ...but the hook instance survives the eligibility flip, so the message is still visible.
    expect(within(row).getByText("This transaction's status changed")).toBeInTheDocument();
    expect(within(row).getByRole('alert')).toHaveTextContent("This transaction's status changed");
  });

  it('renders no button and no alert in the actions cell for a non-eligible row that was never retried (txn_7)', async () => {
    const { } = renderDashboard('/?status=FAILED');
    const rows = await screen.findAllByRole('row');
    const row = rows.find((r) => within(r).queryByText('txn_7'));
    expect(row).toBeTruthy();

    // txn_7 is FAILED + retry_eligible: false and no mutation has been triggered on it.
    expect(within(row).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('alert')).not.toBeInTheDocument();
    const actionsCell = row.querySelectorAll('td')[7];
    expect(actionsCell.textContent).toBe('');
  });
});
