import { describe, it, expect } from 'vitest';
import { qk } from '../../hooks/queryKeys.js';

describe('T-1 hooks/queryKeys.js', () => {
  it('omits empty filter values from transactionList so keys stay stable', () => {
    expect(qk.transactionList({ status: '', type: undefined, customer_id: null, page: 1 })).toEqual([
      'transactions',
      'list',
      { page: 1 },
    ]);
    expect(qk.transactionList({ status: 'FAILED', page: 2, page_size: 20 })).toEqual([
      'transactions',
      'list',
      { status: 'FAILED', page: 2, page_size: 20 },
    ]);
  });

  it('builds stable per-id keys for transaction detail and customer balance', () => {
    expect(qk.transaction('txn_1')).toEqual(['transactions', 'detail', 'txn_1']);
    expect(qk.customerBalance('cust_1')).toEqual(['customers', 'cust_1', 'balance']);
  });
});
