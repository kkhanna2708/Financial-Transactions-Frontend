import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { API_BASE } from '../api/config.js';
import DashboardPage from '../pages/DashboardPage.jsx';
import { renderWithProviders } from '../test/test-utils.jsx';

// DashboardPage hosts NewTransactionForm, but FiltersBar on the same page has
// identical "Customer"/"Type" labels — scope queries to the form via within().
async function getForm() {
  const heading = await screen.findByRole('heading', { name: 'New transaction' });
  const form = within(heading.closest('form'));
  // wait for the customer <select> options to load before interacting
  await waitFor(() => expect(form.getAllByRole('option').length).toBeGreaterThan(1));
  return form;
}

describe('formValidation (FR-3)', () => {
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

    const { user } = renderWithProviders(<DashboardPage />);
    const form = await getForm();
    await user.selectOptions(form.getByLabelText('Customer'), 'cust_1');
    await user.selectOptions(form.getByLabelText('Type'), 'CREDIT');
    await user.type(form.getByLabelText('Amount'), amount);
    await user.click(form.getByRole('button', { name: 'Create transaction' }));

    expect(await form.findByRole('alert')).toHaveTextContent(expectedMessage);
    expect(postCount).toBe(0);
  });
});
