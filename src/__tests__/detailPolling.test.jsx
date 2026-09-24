import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { store } from '../mocks/store.js';
import { API_BASE } from '../api/config.js';
import { detailRefetchInterval } from '../hooks/useTransaction.js';
import TransactionDetailPage from '../pages/TransactionDetailPage.jsx';
import { renderWithProviders } from '../test/test-utils.jsx';

describe('detailPolling (FR-6)', () => {
  it('polls PROCESSING -> SUCCESS with no user interaction', async () => {
    let call = 0;
    const base = store.get('txn_4'); // seeded PROCESSING
    server.use(
      http.get(`${API_BASE}/transactions/:id`, () => {
        call += 1;
        if (call === 1) return HttpResponse.json({ ...base, status: 'PROCESSING' });
        return HttpResponse.json({ ...base, status: 'SUCCESS', attempts: 1 });
      })
    );

    renderWithProviders(<TransactionDetailPage />, { route: '/transactions/txn_4', path: '/transactions/:id' });
    await screen.findByText('PROCESSING');

    await waitFor(() => expect(screen.getByText('SUCCESS')).toBeInTheDocument(), { timeout: 4000 });
  });

  it('detailRefetchInterval returns 2000 for active statuses and false for terminal statuses (polling stops)', () => {
    const q = (status) => ({ state: { data: status ? { status } : undefined } });
    expect(detailRefetchInterval(q('PENDING'))).toBe(2000);
    expect(detailRefetchInterval(q('PROCESSING'))).toBe(2000);
    expect(detailRefetchInterval(q('RETRY'))).toBe(2000);
    expect(detailRefetchInterval(q('SUCCESS'))).toBe(false);
    expect(detailRefetchInterval(q('FAILED'))).toBe(false);
  });
});
