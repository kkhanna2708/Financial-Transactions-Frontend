import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { store } from '../mocks/store.js';
import { API_BASE } from '../api/config.js';
import TransactionDetailPage from '../pages/TransactionDetailPage.jsx';
import { renderWithProviders } from '../test/test-utils.jsx';

describe('retry (FR-7)', () => {
  it('clicking Retry on a seeded FAILED txn updates the badge to PENDING (real handler mutates the store)', async () => {
    const { user } = renderWithProviders(<TransactionDetailPage />, {
      route: '/transactions/txn_6',
      path: '/transactions/:id',
    });
    await screen.findByText('Transaction txn_6');
    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    await user.click(retryBtn);

    await waitFor(() => expect(screen.getByText('PENDING')).toBeInTheDocument());
  });

  it('a 409 override that also flips the store to SUCCESS shows the stale-state message and the badge updates to SUCCESS', async () => {
    server.use(
      http.post(`${API_BASE}/transactions/:id/retry`, ({ params }) => {
        store.update(params.id, { status: 'SUCCESS', retry_eligible: false });
        return HttpResponse.json(
          { error: { code: 'NOT_RETRYABLE', message: "This transaction's status changed", details: null } },
          { status: 409 }
        );
      })
    );
    const { user } = renderWithProviders(<TransactionDetailPage />, {
      route: '/transactions/txn_12',
      path: '/transactions/:id',
    });
    await screen.findByText('Transaction txn_12');
    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    await user.click(retryBtn);

    expect(await screen.findByText("This transaction's status changed")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('SUCCESS')).toBeInTheDocument());
  });
});
