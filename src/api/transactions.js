import { request } from './client.js';

export function listTransactions({ status, type, customer_id, page, page_size } = {}, { signal } = {}) {
  return request('/transactions', { query: { status, type, customer_id, page, page_size }, signal });
}

export function getTransaction(id, { signal } = {}) {
  return request(`/transactions/${id}`, { signal });
}

export function createTransaction({ transaction_id, customer_id, type, amount }) {
  return request('/transactions', { method: 'POST', body: { transaction_id, customer_id, type, amount } });
}

export function retryTransaction(id) {
  return request(`/transactions/${id}/retry`, { method: 'POST' });
}

export function getStats({ signal } = {}) {
  return request('/stats', { signal });
}
