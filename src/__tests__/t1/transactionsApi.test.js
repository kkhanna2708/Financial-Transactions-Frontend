import { describe, it, expect } from 'vitest';
import { createTransaction, retryTransaction } from '../../api/transactions.js';
import { ApiError } from '../../api/client.js';

describe('T-1 mocks: exact API contract for create/retry', () => {
  it('POST /transactions returns 200 created:false on identical resubmission, 409 on conflicting resubmission', async () => {
    const payload = { transaction_id: 'dup-1', customer_id: 'cust_1', type: 'CREDIT', amount: '10.00' };
    const first = await createTransaction(payload);
    expect(first.created).toBe(true);

    const same = await createTransaction(payload);
    expect(same.created).toBe(false);
    expect(same.transaction_id).toBe('dup-1');

    const conflicting = await createTransaction({ ...payload, amount: '20.00' }).catch((e) => e);
    expect(conflicting).toBeInstanceOf(ApiError);
    expect(conflicting.status).toBe(409);
    expect(conflicting.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('POST /transactions returns 422 with details.fields.amount for an invalid amount', async () => {
    const err = await createTransaction({
      transaction_id: 'bad-amount-1',
      customer_id: 'cust_1',
      type: 'CREDIT',
      amount: '-5.00',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.details).toBeTruthy();
    expect(err.details.fields).toHaveProperty('amount');
  });

  it('POST /transactions/{id}/retry returns 409 NOT_RETRYABLE for a non-retryable transaction, 404 for unknown id', async () => {
    const notRetryable = await retryTransaction('txn_7').catch((e) => e); // seeded FAILED, retry_eligible:false
    expect(notRetryable).toBeInstanceOf(ApiError);
    expect(notRetryable.status).toBe(409);
    expect(notRetryable.code).toBe('NOT_RETRYABLE');

    const missing = await retryTransaction('nope').catch((e) => e);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing.status).toBe(404);
  });

  it('POST /transactions/{id}/retry returns 202 with updated status for a retry-eligible FAILED transaction', async () => {
    const result = await retryTransaction('txn_6'); // seeded FAILED, retry_eligible:true
    expect(result.status).toBe('PENDING');
    expect(result.retry_eligible).toBe(false);
  });
});
