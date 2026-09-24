import { describe, it, expect } from 'vitest';
import { screen, within, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server.js';
import { store } from '../../mocks/store.js';
import { API_BASE } from '../../api/config.js';
import App from '../../App.jsx';
import CustomersPage from '../../pages/CustomersPage.jsx';
import CustomerDetailPage from '../../pages/CustomerDetailPage.jsx';
import NotFound from '../../pages/NotFound.jsx';

function renderApp(route = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, queryClient, user: userEvent.setup() };
}

function renderRouted(ui, route, path) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, queryClient, user: userEvent.setup() };
}

describe('T-4 CustomersPage (FR-8, FR-10)', () => {
  it('renders rows with formatted balance and a working link to the detail page', async () => {
    renderRouted(<CustomersPage />, '/', '/');
    const rows = await screen.findAllByRole('row');
    const row = rows.find((r) => within(r).queryByText('cust_1'));
    expect(row).toBeTruthy();
    expect(within(row).getByText('Alice Anderson')).toBeInTheDocument();
    // Money formatted with grouping + 2 decimals, never a raw float.
    expect(within(row).getByText('1,500.00')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'cust_1' })).toHaveAttribute('href', '/customers/cust_1');
  });

  it('shows an error state with a working Retry button on a 500, and an offline message on a network error', async () => {
    server.use(
      http.get(`${API_BASE}/customers`, () => HttpResponse.json({ error: { code: 'INTERNAL', message: 'customers boom', details: null } }, { status: 500 }))
    );
    const { user } = renderRouted(<CustomersPage />, '/', '/');
    await screen.findByRole('alert');
    expect(screen.getByText('customers boom')).toBeInTheDocument();

    server.use(http.get(`${API_BASE}/customers`, () => HttpResponse.error()));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('Cannot reach the API — you may be offline or the server is down.')
    ).toBeInTheDocument();
  });
});

describe('T-4 CustomerDetailPage (FR-8, FR-10)', () => {
  it('renders balance + updated_at and paginates history with page tracked in the URL', async () => {
    // Seed enough transactions for cust_1 to have a second page (page_size 20; cust_1 has 4 seeded txns,
    // so add a couple more to force pagination deterministically).
    for (let i = 0; i < 20; i++) {
      store.create({
        transaction_id: `extra_${i}`,
        customer_id: 'cust_1',
        type: 'CREDIT',
        amount: '1.00',
      });
    }

    const { user } = renderRouted(<CustomerDetailPage />, '/customers/cust_1', '/customers/:id');

    expect(await screen.findByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    // updated_at should be rendered as a locale string, not the raw ISO string.
    expect(screen.queryByText(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/)).not.toBeInTheDocument();

    expect(await screen.findByText(/Page 1 of/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByText(/Page 2 of/)).toBeInTheDocument());
  });

  it('renders NotFound for an unknown customer id (404 from balance)', async () => {
    renderRouted(<CustomerDetailPage />, '/customers/nope', '/customers/:id');
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('shows an error state with Retry on a 500 fetching balance', async () => {
    server.use(
      http.get(`${API_BASE}/customers/:id/balance`, ({ params }) => {
        if (params.id !== 'cust_2') return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Customer not found', details: null } }, { status: 404 });
        return HttpResponse.json({ error: { code: 'INTERNAL', message: 'balance boom', details: null } }, { status: 500 });
      })
    );
    renderRouted(<CustomerDetailPage />, '/customers/cust_2', '/customers/:id');
    await screen.findByText('balance boom');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('T-4 NotFound page + routing (FR-10)', () => {
  it('renders the default message + home link bare, and via the app router for unknown transaction/customer/unmatched routes', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    unmount();

    const txnApp = renderApp('/transactions/nope');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    txnApp.unmount();

    const custApp = renderApp('/customers/nope');
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
    custApp.unmount();

    renderApp('/does/not/exist');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
