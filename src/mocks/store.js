import { toCents, fromCents } from './money.js';

const STATUSES = ['PENDING', 'PROCESSING', 'RETRY', 'SUCCESS', 'FAILED'];
const TICK_MS = 1500;

function makeEvent(from, to, attempt, worker, message, now) {
  return {
    from_status: from,
    to_status: to,
    attempt,
    worker_id: worker,
    message,
    created_at: new Date(now).toISOString(),
  };
}

function makeTxn({ id, customer_id, type, amount, status, attempts = 1, max_attempts = 3, manual_retries = 0, retry_eligible = false, failure_code = null, failure_reason = null, ageMs = 0 }, now) {
  const createdAt = now - ageMs;
  const txn = {
    transaction_id: id,
    customer_id,
    type,
    amount,
    status,
    attempts,
    max_attempts,
    manual_retries,
    failure_code,
    failure_reason,
    next_run_at: null,
    created_at: new Date(createdAt).toISOString(),
    updated_at: new Date(createdAt).toISOString(),
    processed_at: status === 'SUCCESS' || status === 'FAILED' ? new Date(createdAt).toISOString() : null,
    retry_eligible,
    events: [makeEvent(null, status, attempts, 'worker-1', 'Created', createdAt)],
    _nextAt: ['PENDING', 'PROCESSING', 'RETRY'].includes(status) ? now + TICK_MS : null,
  };
  return txn;
}

export function createInitialState() {
  const now = Date.now();
  const customers = [
    { customer_id: 'cust_1', name: 'Alice Anderson', _balanceCents: toCents('1500.00') },
    { customer_id: 'cust_2', name: 'Bob Brown', _balanceCents: toCents('800.00') },
    { customer_id: 'cust_3', name: 'Carol Chen', _balanceCents: toCents('2300.00') },
  ];

  const specs = [
    { id: 'txn_1', customer_id: 'cust_1', type: 'CREDIT', amount: '100.00', status: 'SUCCESS', ageMs: 3600000 },
    { id: 'txn_2', customer_id: 'cust_1', type: 'DEBIT', amount: '50.00', status: 'SUCCESS', ageMs: 3500000 },
    { id: 'txn_3', customer_id: 'cust_2', type: 'CREDIT', amount: '200.00', status: 'PENDING', ageMs: 60000 },
    { id: 'txn_4', customer_id: 'cust_2', type: 'DEBIT', amount: '75.00', status: 'PROCESSING', ageMs: 30000 },
    { id: 'txn_5', customer_id: 'cust_3', type: 'CREDIT', amount: '300.00', status: 'RETRY', attempts: 2, manual_retries: 1, ageMs: 45000 },
    { id: 'txn_6', customer_id: 'cust_3', type: 'DEBIT', amount: '9999.00', status: 'FAILED', attempts: 3, retry_eligible: true, failure_code: 'INSUFFICIENT_FUNDS', failure_reason: 'Balance too low', ageMs: 120000 },
    { id: 'txn_7', customer_id: 'cust_1', type: 'CREDIT', amount: '40.00', status: 'FAILED', attempts: 3, retry_eligible: false, failure_code: 'INSUFFICIENT_FUNDS', failure_reason: 'Balance too low', manual_retries: 3, ageMs: 200000 },
    { id: 'txn_8', customer_id: 'cust_2', type: 'CREDIT', amount: '60.00', status: 'SUCCESS', ageMs: 400000 },
    { id: 'txn_9', customer_id: 'cust_3', type: 'DEBIT', amount: '15.00', status: 'SUCCESS', ageMs: 500000 },
    { id: 'txn_10', customer_id: 'cust_1', type: 'DEBIT', amount: '20.00', status: 'PENDING', ageMs: 5000 },
    { id: 'txn_11', customer_id: 'cust_2', type: 'CREDIT', amount: '500.00', status: 'SUCCESS', ageMs: 600000 },
    { id: 'txn_12', customer_id: 'cust_3', type: 'DEBIT', amount: '10.00', status: 'FAILED', attempts: 3, retry_eligible: true, failure_code: 'INSUFFICIENT_FUNDS', failure_reason: 'Balance too low', ageMs: 90000 },
  ];

  const transactions = specs.map((s) => makeTxn(s, now));

  return { customers, transactions, autoProgress: true };
}

let state = createInitialState();

function stripPrivate(txn) {
  const { _nextAt, ...rest } = txn;
  return rest;
}

function findTxn(id) {
  return state.transactions.find((t) => t.transaction_id === id);
}

function findCustomer(id) {
  return state.customers.find((c) => c.customer_id === id);
}

function applyBalance(txn) {
  const customer = findCustomer(txn.customer_id);
  if (!customer) return;
  const cents = toCents(txn.amount);
  if (txn.type === 'CREDIT') {
    customer._balanceCents += cents;
  } else {
    customer._balanceCents -= cents;
  }
}

function tick(now = Date.now()) {
  if (!state.autoProgress) return;
  for (const txn of state.transactions) {
    if (!txn._nextAt || now < txn._nextAt) continue;
    const customer = findCustomer(txn.customer_id);

    if (txn.status === 'PENDING') {
      txn.status = 'PROCESSING';
      txn.events.push(makeEvent('PENDING', 'PROCESSING', txn.attempts, 'worker-1', 'Processing started', now));
      txn.updated_at = new Date(now).toISOString();
      txn._nextAt = now + TICK_MS;
    } else if (txn.status === 'RETRY') {
      txn.status = 'PROCESSING';
      txn.events.push(makeEvent('RETRY', 'PROCESSING', txn.attempts, 'worker-1', 'Processing started', now));
      txn.updated_at = new Date(now).toISOString();
      txn._nextAt = now + TICK_MS;
    } else if (txn.status === 'PROCESSING') {
      const wouldOverdraw = txn.type === 'DEBIT' && customer && toCents(txn.amount) > customer._balanceCents;
      if (wouldOverdraw) {
        txn.status = 'FAILED';
        txn.failure_code = 'INSUFFICIENT_FUNDS';
        txn.failure_reason = 'Balance too low';
        txn.retry_eligible = txn.manual_retries < 3;
        txn.events.push(makeEvent('PROCESSING', 'FAILED', txn.attempts, 'worker-1', 'Insufficient funds', now));
      } else {
        txn.status = 'SUCCESS';
        applyBalance(txn);
        txn.events.push(makeEvent('PROCESSING', 'SUCCESS', txn.attempts, 'worker-1', 'Completed', now));
      }
      txn.processed_at = new Date(now).toISOString();
      txn.updated_at = new Date(now).toISOString();
      txn._nextAt = null;
    }
  }
}

function list({ status, type, customer_id, page = 1, page_size = 20 } = {}) {
  tick();
  let items = state.transactions;
  if (status) items = items.filter((t) => t.status === status);
  if (type) items = items.filter((t) => t.type === type);
  if (customer_id) items = items.filter((t) => t.customer_id === customer_id);
  items = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const total = items.length;
  const start = (page - 1) * page_size;
  const pageItems = items.slice(start, start + page_size).map(stripPrivate);
  return { items: pageItems, page, page_size, total };
}

function get(id) {
  tick();
  const txn = findTxn(id);
  return txn ? stripPrivate(txn) : null;
}

function create({ transaction_id, customer_id, type, amount }) {
  tick();
  const existing = findTxn(transaction_id);
  if (existing) {
    const same = existing.customer_id === customer_id && existing.type === type && existing.amount === amount;
    if (same) {
      return { status: 200, body: { ...stripPrivate(existing), created: false } };
    }
    return {
      status: 409,
      body: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'transaction_id already used with different details', details: null } },
    };
  }

  const errors = {};
  if (!customer_id) errors.customer_id = 'Select a customer';
  if (!type) errors.type = 'Select a type';
  const trimmedAmount = amount == null ? '' : String(amount).trim();
  if (!trimmedAmount) {
    errors.amount = 'Amount is required';
  } else if (!/^-?\d+(\.\d+)?$/.test(trimmedAmount)) {
    errors.amount = 'Enter a valid amount';
  } else if (trimmedAmount.startsWith('-') || !/[1-9]/.test(trimmedAmount)) {
    errors.amount = 'Amount must be greater than 0';
  } else if (/\.\d{3,}$/.test(trimmedAmount)) {
    errors.amount = 'Amount can have at most 2 decimal places';
  }
  if (!errors.customer_id && !findCustomer(customer_id)) {
    errors.customer_id = 'Unknown customer';
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: 422,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { fields: errors } } },
    };
  }

  const now = Date.now();
  const txn = makeTxn({ id: transaction_id, customer_id, type, amount, status: 'PENDING' }, now);
  state.transactions.push(txn);
  return { status: 202, body: { ...stripPrivate(txn), created: true } };
}

function retry(id) {
  tick();
  const txn = findTxn(id);
  if (!txn) {
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Transaction not found', details: null } } };
  }
  if (!(txn.status === 'FAILED' && txn.retry_eligible)) {
    return { status: 409, body: { error: { code: 'NOT_RETRYABLE', message: "This transaction's status changed", details: null } } };
  }
  const now = Date.now();
  txn.status = 'PENDING';
  txn.manual_retries += 1;
  txn.retry_eligible = false;
  txn.failure_code = null;
  txn.failure_reason = null;
  txn.events.push(makeEvent('FAILED', 'PENDING', txn.attempts, 'worker-1', 'Manual retry', now));
  txn.updated_at = new Date(now).toISOString();
  txn._nextAt = now + TICK_MS;
  return { status: 202, body: stripPrivate(txn) };
}

function update(id, patch) {
  const txn = findTxn(id);
  if (!txn) return null;
  Object.assign(txn, patch);
  return stripPrivate(txn);
}

function stats() {
  tick();
  const counts = { PENDING: 0, PROCESSING: 0, RETRY: 0, SUCCESS: 0, FAILED: 0 };
  for (const t of state.transactions) counts[t.status] = (counts[t.status] || 0) + 1;
  return counts;
}

function reset({ autoProgress = true } = {}) {
  state = createInitialState();
  state.autoProgress = autoProgress;
}

function isAutoProgress() {
  return state.autoProgress;
}

function listCustomers() {
  return state.customers.map((c) => ({ customer_id: c.customer_id, name: c.name, balance: fromCents(c._balanceCents) }));
}

function getCustomer(id) {
  return findCustomer(id) || null;
}

function getBalance(id) {
  const c = findCustomer(id);
  if (!c) return null;
  return { customer_id: c.customer_id, balance: fromCents(c._balanceCents), updated_at: new Date().toISOString() };
}

function customerTransactions(id, { page = 1, page_size = 20 } = {}) {
  tick();
  let items = state.transactions.filter((t) => t.customer_id === id);
  items = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const total = items.length;
  const start = (page - 1) * page_size;
  const pageItems = items.slice(start, start + page_size).map(stripPrivate);
  return { items: pageItems, page, page_size, total };
}

export const store = {
  list,
  get,
  create,
  retry,
  update,
  stats,
  tick,
  reset,
  isAutoProgress,
  listCustomers,
  getCustomer,
  getBalance,
  customerTransactions,
};
