import { request } from './client.js';

export function listCustomers({ signal } = {}) {
  return request('/customers', { signal });
}

export function getBalance(id, { signal } = {}) {
  return request(`/customers/${id}/balance`, { signal });
}

export function getCustomerTransactions(id, { page, page_size } = {}, { signal } = {}) {
  return request(`/customers/${id}/transactions`, { query: { page, page_size }, signal });
}
