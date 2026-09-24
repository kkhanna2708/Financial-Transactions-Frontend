import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server.js';
import { store } from '../../mocks/store.js';
import { API_BASE } from '../../api/config.js';
import TransactionDetailPage from '../../pages/TransactionDetailPage.jsx';

function renderDetail(id) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/transactions/${id}`]}>
        <Routes>
          <Route path="/transactions/:id" element={<TransactionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, queryClient, user: userEvent.setup() };
}

describe('T-3 TransactionDetailPage fields (FR-6)', () => {
  it('renders fields, attempts x/max, failure code/reason, next retry, and event timeline', async () => {
    renderDetail('txn_6'); // FAILED, retry_eligible, attempts:3, failure_code INSUFFICIENT_FUNDS
    await screen.findByText('Transaction txn_6');

    expect(screen.getByText('3 / 3')).toBeInTheDocument(); // attempts / max_attempts
    expect(screen.getByText('INSUFFICIENT_FUNDS')).toBeInTheDocument();
    expect(screen.getByText('Balance too low')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Event timeline' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('unknown transaction id renders NotFound', async () => {
    renderDetail('nope-does-not-exist');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});

describe('T-3 TransactionDetailPage retry (FR-7)', () => {
  it('retry success updates the displayed status', async () => {
    const { user } = renderDetail('txn_6');
    await screen.findByText('Transaction txn_6');
    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('PENDING')).toBeInTheDocument();
    });
  });

  it('409 NOT_RETRYABLE shows the stale-state message and refetches new data', async () => {
    server.use(
      http.post(`${API_BASE}/transactions/:id/retry`, ({ params }) => {
        store.update(params.id, { status: 'SUCCESS', retry_eligible: false });
        return HttpResponse.json(
          { error: { code: 'NOT_RETRYABLE', message: 'Not retryable', details: null } },
          { status: 409 }
        );
      })
    );
    const { user } = renderDetail('txn_12'); // FAILED, retry_eligible
    await screen.findByText('Transaction txn_12');
    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    await user.click(retryBtn);

    expect(await screen.findByText("This transaction's status changed")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('SUCCESS')).toBeInTheDocument());
  });
});

describe('T-3 TransactionDetailPage polling (FR-6)', () => {
  it('polls PROCESSING -> SUCCESS without user action and stops polling at terminal status', async () => {
    let call = 0;
    const base = store.get('txn_4'); // seeded PROCESSING
    server.use(
      http.get(`${API_BASE}/transactions/:id`, () => {
        call += 1;
        if (call === 1) {
          return HttpResponse.json({ ...base, status: 'PROCESSING' });
        }
        return HttpResponse.json({ ...base, status: 'SUCCESS', attempts: 1 });
      })
    );
    renderDetail('txn_4');
    await screen.findByText('PROCESSING');

    await waitFor(() => expect(screen.getByText('SUCCESS')).toBeInTheDocument(), { timeout: 4000 });

    const callsAtSuccess = call;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(call).toBe(callsAtSuccess); // no further GETs once terminal
  });
});
