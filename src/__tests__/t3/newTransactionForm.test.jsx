import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server.js';
import { API_BASE } from '../../api/config.js';
import DashboardPage from '../../pages/DashboardPage.jsx';

// DashboardPage hosts NewTransactionForm, but FiltersBar on the same page has
// identical "Customer"/"Type" labels — always scope queries to the form via within().
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

async function getForm() {
  const heading = await screen.findByRole('heading', { name: 'New transaction' });
  const form = within(heading.closest('form'));
  // wait for the customer dropdown to be populated from useCustomers() before interacting
  await waitFor(() => expect(form.getAllByRole('option').length).toBeGreaterThan(1));
  return form;
}

async function fillValidForm(user, form) {
  await user.selectOptions(form.getByLabelText('Customer'), 'cust_1');
  await user.selectOptions(form.getByLabelText('Type'), 'CREDIT');
  await user.type(form.getByLabelText('Amount'), '25.50');
}

describe('T-3 NewTransactionForm validation (FR-3)', () => {
  it.each([
    ['0', 'Amount must be greater than 0'],
    ['-5', 'Amount must be greater than 0'],
    ['1.234', 'Amount can have at most 2 decimal places'],
  ])('amount=%s shows "%s" and does not call the API', async (amount, expectedMessage) => {
    let postCount = 0;
    server.use(
      http.post(`${API_BASE}/transactions`, async () => {
        postCount += 1;
        return HttpResponse.json({ transaction_id: 'x', status: 'PENDING', created: true }, { status: 202 });
      })
    );
    const { user } = renderDashboard('/');
    const form = await getForm();
    await user.selectOptions(form.getByLabelText('Customer'), 'cust_1');
    await user.selectOptions(form.getByLabelText('Type'), 'CREDIT');
    await user.type(form.getByLabelText('Amount'), amount);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));

    expect(await form.findByRole('alert')).toHaveTextContent(expectedMessage);
    expect(postCount).toBe(0);
  });
});

describe('T-3 NewTransactionForm success flow (FR-3, FR-5)', () => {
  it('success shows id link, resets form, generates fresh idempotency key', async () => {
    const bodies = [];
    server.use(
      http.post(`${API_BASE}/transactions`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        return HttpResponse.json({ transaction_id: body.transaction_id, status: 'PENDING', created: true }, { status: 202 });
      })
    );
    const { user } = renderDashboard('/');
    const form = await getForm();
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));

    const link = await form.findByRole('link', { name: bodies[0]?.transaction_id || /.+/ });
    expect(link).toHaveAttribute('href', `/transactions/${bodies[0].transaction_id}`);

    // form reset
    expect(form.getByLabelText('Amount')).toHaveValue('');
    expect(form.getByLabelText('Customer')).toHaveValue('');

    // fresh key on next submission
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await waitFor(() => expect(bodies.length).toBe(2));
    expect(bodies[1].transaction_id).not.toBe(bodies[0].transaction_id);
  });

  it('double-click submit sends exactly one request and disables the button while pending', async () => {
    const bodies = [];
    server.use(
      http.post(`${API_BASE}/transactions`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        await delay(200);
        return HttpResponse.json({ transaction_id: body.transaction_id, status: 'PENDING', created: true }, { status: 202 });
      })
    );
    const { user } = renderDashboard('/');
    const form = await getForm();
    await fillValidForm(user, form);
    const btn = form.getByRole('button', { name: 'Create transaction' });

    await user.dblClick(btn);
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Submitting…');

    await waitFor(() => expect(bodies.length).toBe(1));
    await form.findByRole('link', { name: bodies[0].transaction_id });
    expect(bodies.length).toBe(1);
  });

  it('200 created:false shows "already submitted" info message with link', async () => {
    server.use(
      http.post(`${API_BASE}/transactions`, async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ transaction_id: body.transaction_id, status: 'PENDING', created: false }, { status: 200 });
      })
    );
    const { user } = renderDashboard('/');
    const form = await getForm();
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));

    const status = await form.findByRole('status');
    expect(status).toHaveTextContent('already submitted');
    expect(within(status).getByRole('link')).toBeInTheDocument();
  });
});

describe('T-3 NewTransactionForm idempotency & error mapping (FR-4, FR-5)', () => {
  it('network error then resubmit sends the same transaction_id (asserted on request bodies)', async () => {
    const bodies = [];
    let call = 0;
    server.use(
      http.post(`${API_BASE}/transactions`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        call += 1;
        if (call === 1) return HttpResponse.error();
        return HttpResponse.json({ transaction_id: body.transaction_id, status: 'PENDING', created: true }, { status: 202 });
      })
    );
    const { user } = renderDashboard('/');
    const form = await getForm();
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await form.findByRole('alert');
    expect(bodies.length).toBe(1);

    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await form.findByRole('link', { name: bodies[0].transaction_id });
    expect(bodies.length).toBe(2);
    expect(bodies[1].transaction_id).toBe(bodies[0].transaction_id);
  });

  it('422 maps details to the Amount field; 409 shows the conflict message', async () => {
    server.use(
      http.post(`${API_BASE}/transactions`, async () => {
        return HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { fields: { amount: 'Exceeds limit' } } } },
          { status: 422 }
        );
      })
    );
    const { user } = renderDashboard('/');
    const form = await getForm();
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));

    const amountInput = form.getByLabelText('Amount');
    expect(await form.findByRole('alert')).toHaveTextContent('Exceeds limit');
    expect(amountInput).toHaveAttribute('aria-invalid', 'true');

    server.use(
      http.post(`${API_BASE}/transactions`, async () => {
        return HttpResponse.json(
          { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Conflict', details: null } },
          { status: 409 }
        );
      })
    );
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    expect(await form.findByRole('alert')).toHaveTextContent('Conflict: this transaction ID was already used');
  });
});
