function cleanFilters(filters = {}) {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export const qk = {
  transactionsAll: ['transactions'],
  transactionLists: ['transactions', 'list'],
  transactionList: (filters) => ['transactions', 'list', cleanFilters(filters)],
  transaction: (id) => ['transactions', 'detail', id],
  stats: ['stats'],
  health: ['health'],
  customers: ['customers', 'list'],
  customerBalance: (id) => ['customers', id, 'balance'],
  customerTransactions: (id, params) => ['customers', id, 'transactions', params],
  customerTransactionsAll: (id) => ['customers', id, 'transactions'],
};
