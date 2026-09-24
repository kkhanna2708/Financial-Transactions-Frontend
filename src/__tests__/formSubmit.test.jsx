import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
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

async function fillValidForm(user, form) {
  await user.selectOptions(form.getByLabelText('Customer'), 'cust_1');
  await user.selectOptions(form.getByLabelText('Type'), 'CREDIT');
  await user.type(form.getByLabelText('Amount'), '25.50');
}

describe('formSubmit (FR-3, FR-5)', () => {
  it('double-click while a slow request is in flight disables the button, sends exactly one request, then shows the created link', async () => {
    const bodies = [];
    server.use(
      http.post(`${API_BASE}/transactions`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        await delay(300);
        return HttpResponse.json({ transaction_id: body.transaction_id, status: 'PENDING', created: true }, { status: 202 });
      })
    );

    const { user } = renderWithProviders(<DashboardPage />);
    const form = await getForm();
    await fillValidForm(user, form);
    const btn = form.getByRole('button', { name: 'Create transaction' });

    await user.dblClick(btn);
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Submitting…');

    const link = await form.findByRole('link', { name: bodies[0]?.transaction_id }, { timeout: 4000 });
    expect(link).toHaveAttribute('href', `/transactions/${bodies[0].transaction_id}`);
    expect(bodies.length).toBe(1);
  });
});
