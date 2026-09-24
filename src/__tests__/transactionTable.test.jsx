import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { store } from '../mocks/store.js';
import { API_BASE } from '../api/config.js';
import DashboardPage from '../pages/DashboardPage.jsx';
import { renderWithProviders } from '../test/test-utils.jsx';

describe('transactionTable (FR-2, FR-9, FR-10)', () => {
  it('renders rows and the pagination control', async () => {
    renderWithProviders(<DashboardPage />, { route: '/' });
    await screen.findAllByText(/txn_/);
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });

  it('empty list shows "No transactions match these filters" with a working Clear filters button', async () => {
    const { user } = renderWithProviders(<DashboardPage />, {
      route: '/?status=SUCCESS&customer_id=cust_2&type=DEBIT',
    });
    expect(await screen.findByText('No transactions match these filters')).toBeInTheDocument();

    const clearButtons = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clearButtons[clearButtons.length - 1]);
    await screen.findAllByText(/txn_/);
    expect(screen.queryByText('No transactions match these filters')).not.toBeInTheDocument();
  });

  it('a 500 on the list shows ErrorState with a working Retry button', async () => {
    let calls = 0;
    server.use(
      http.get(`${API_BASE}/transactions`, () => {
        calls += 1;
        return HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom', details: null } }, { status: 500 });
      })
    );
    const { user } = renderWithProviders(<DashboardPage />);
    await screen.findByRole('alert');
    expect(screen.getByText('boom')).toBeInTheDocument();
    const callsBeforeRetry = calls;

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(calls).toBeGreaterThan(callsBeforeRetry));
  });

  it('selecting Status = FAILED sends status=FAILED&page=1 to the API and the URL has no page param', async () => {
    const seen = [];
    server.use(
      http.get(`${API_BASE}/transactions`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(Object.fromEntries(url.searchParams));
        return HttpResponse.json(
          store.list({ status: url.searchParams.get('status') || undefined, page: Number(url.searchParams.get('page')) || 1 })
        );
      })
    );
    const { user } = renderWithProviders(<DashboardPage />, { route: '/?page=2' });
    await screen.findByLabelText('Status');
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText('Status'), 'FAILED');

    await waitFor(() => {
      const last = seen[seen.length - 1];
      expect(last.status).toBe('FAILED');
      expect(last.page).toBe('1');
    });
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=');
  });

  // FR-9 "background refetch failure keeps rows + warning banner" is already covered by
  // src/__tests__/t2/dashboard.test.jsx ("keeps old rows and shows a warning banner when a
  // background refetch fails") — not duplicated here.
});
