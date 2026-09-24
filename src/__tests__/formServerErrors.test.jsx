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

async function fillValidForm(user, form) {
  await user.selectOptions(form.getByLabelText('Customer'), 'cust_1');
  await user.selectOptions(form.getByLabelText('Type'), 'CREDIT');
  await user.type(form.getByLabelText('Amount'), '25.50');
}

describe('formServerErrors (FR-5)', () => {
  it('422 with details.fields.amount is shown next to Amount; a following 409 shows the conflict text', async () => {
    server.use(
      http.post(`${API_BASE}/transactions`, async () => {
        return HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { fields: { amount: 'Exceeds limit' } } } },
          { status: 422 }
        );
      })
    );

    const { user } = renderWithProviders(<DashboardPage />);
    const form = await getForm();
    await fillValidForm(user, form);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));

    const amountInput = form.getByLabelText('Amount');
    expect(await form.findByRole('alert')).toHaveTextContent('Exceeds limit');
    expect(amountInput).toHaveAttribute('aria-invalid', 'true');
    expect(amountInput).toHaveAttribute('aria-describedby', 'amount-error');

    server.use(
      http.post(`${API_BASE}/transactions`, async () => {
        return HttpResponse.json(
          { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Conflict', details: null } },
          { status: 409 }
        );
      })
    );
    await user.click(form.getByRole('button', { name: 'Create transaction' }));
    expect(await form.findByRole('alert')).toHaveTextContent('Conflict: this transaction ID was already used with different details. Please submit again.');
  });
});
