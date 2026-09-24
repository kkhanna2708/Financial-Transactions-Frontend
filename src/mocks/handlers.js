import { http, HttpResponse, delay } from 'msw';
import { API_BASE } from '../api/config.js';
import { store } from './store.js';

async function maybeDelay() {
  if (store.isAutoProgress()) {
    await delay(150);
  }
}

export const handlers = [
  http.get(`${API_BASE}/transactions`, async ({ request }) => {
    await maybeDelay();
    const url = new URL(request.url);
    const query = {
      status: url.searchParams.get('status') || undefined,
      type: url.searchParams.get('type') || undefined,
      customer_id: url.searchParams.get('customer_id') || undefined,
      page: Number(url.searchParams.get('page')) || 1,
      page_size: Number(url.searchParams.get('page_size')) || 20,
    };
    return HttpResponse.json(store.list(query));
  }),

  http.get(`${API_BASE}/transactions/:id`, async ({ params }) => {
    await maybeDelay();
    const txn = store.get(params.id);
    if (!txn) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found', details: null } }, { status: 404 });
    }
    return HttpResponse.json(txn);
  }),

  http.post(`${API_BASE}/transactions`, async ({ request }) => {
    await maybeDelay();
    const body = await request.json();
    const result = store.create(body);
    return HttpResponse.json(result.body, { status: result.status });
  }),

  http.post(`${API_BASE}/transactions/:id/retry`, async ({ params }) => {
    await maybeDelay();
    const result = store.retry(params.id);
    return HttpResponse.json(result.body, { status: result.status });
  }),

  http.get(`${API_BASE}/stats`, async () => {
    await maybeDelay();
    return HttpResponse.json(store.stats());
  }),

  http.get(`${API_BASE}/customers`, async () => {
    await maybeDelay();
    return HttpResponse.json(store.listCustomers());
  }),

  http.get(`${API_BASE}/customers/:id/balance`, async ({ params }) => {
    await maybeDelay();
    const balance = store.getBalance(params.id);
    if (!balance) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Customer not found', details: null } }, { status: 404 });
    }
    return HttpResponse.json(balance);
  }),

  http.get(`${API_BASE}/customers/:id/transactions`, async ({ params, request }) => {
    await maybeDelay();
    const customer = store.getCustomer(params.id);
    if (!customer) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Customer not found', details: null } }, { status: 404 });
    }
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;
    const page_size = Number(url.searchParams.get('page_size')) || 20;
    return HttpResponse.json(store.customerTransactions(params.id, { page, page_size }));
  }),

  http.get(`${API_BASE}/health`, async () => {
    await maybeDelay();
    return HttpResponse.json({
      status: 'ok',
      db: 'ok',
      queue_depth: 3,
      oldest_pending_age_seconds: 5,
      stale_processing: false,
    });
  }),
];
