import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { API_BASE } from '../api/config.js';
import DashboardPage from '../pages/DashboardPage.jsx';
import { renderWithProviders } from '../test/test-utils.jsx';

async function getForm() {
  const heading = await screen.findByRole('heading', { name: 'New transaction' });
  const form = within(heading.closest('form'));
  await waitFor(() => expect(form.getAllByRole('option').length).toBeGreaterThan(1));
  return form;
}

async function fillValidForm(user, form, amount = '25.50') {
  await user.selectOptions(form.getByLabelText('Customer'), 'cust_1');
  await user.selectOptions(form.getByLabelText('Type'), 'CREDIT');
  await user.type(form.getByLabelText('Amount'), amount);
}

describe('formIdempotency (FR-4)', () => {
  it('network error then resubmit reuses the same transaction_id; a later submission uses a different id', async () => {
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

    const { user } = renderWithProviders(<DashboardPage />);
    const form = await getForm();
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await form.findByRole('alert');
    expect(bodies.length).toBe(1);

    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await form.findByRole('link', { name: bodies[0].transaction_id });
    expect(bodies.length).toBe(2);
    expect(bodies[1].transaction_id).toBe(bodies[0].transaction_id);

    // A following, separate submission (post-success, form reset) generates a fresh id.
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await waitFor(() => expect(bodies.length).toBe(3));
    expect(bodies[2].transaction_id).not.toBe(bodies[1].transaction_id);
  });

  it('network error -> user edits amount -> resubmit gets 409 IDEMPOTENCY_CONFLICT (same id) -> next resubmit uses a fresh id and succeeds', async () => {
    const bodies = [];
    let call = 0;
    server.use(
      http.post(`${API_BASE}/transactions`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        call += 1;
        if (call === 1) return HttpResponse.error();
        if (call === 2) {
          return HttpResponse.json(
            { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Conflict', details: null } },
            { status: 409 }
          );
        }
        return HttpResponse.json({ transaction_id: body.transaction_id, status: 'PENDING', created: true }, { status: 202 });
      })
    );

    const { user } = renderWithProviders(<DashboardPage />);
    const form = await getForm();
    await fillValidForm(user, form, '25.50');
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await form.findByRole('alert');
    expect(bodies.length).toBe(1);

    // user edits the amount before resubmitting — same id is still used (key kept on network error)
    await user.clear(form.getByLabelText('Amount'));
    await user.type(form.getByLabelText('Amount'), '30.00');
    await user.click(form.getByRole('button', { name: 'Create transaction' }));

    expect(await form.findByRole('alert')).toHaveTextContent('Conflict: this transaction ID was already used');
    expect(bodies.length).toBe(2);
    expect(bodies[1].transaction_id).toBe(bodies[0].transaction_id);
    expect(bodies[1].amount).not.toBe(bodies[0].amount);

    // resubmit after the 409 rotates the key and succeeds
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    await form.findByRole('link', { name: bodies[2]?.transaction_id });
    expect(bodies.length).toBe(3);
    expect(bodies[2].transaction_id).not.toBe(bodies[1].transaction_id);
  });
});
