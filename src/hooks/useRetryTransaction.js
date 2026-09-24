import { useMutation, useQueryClient } from '@tanstack/react-query';
import { retryTransaction } from '../api/transactions.js';
import { qk } from './queryKeys.js';

export function useRetryTransaction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (txn) => retryTransaction(txn.transaction_id),
    onSuccess: (data, txn) => {
      const id = txn.transaction_id;
      queryClient.setQueryData(qk.transaction(id), (old) => (old ? { ...old, ...data } : data));
      queryClient.invalidateQueries({ queryKey: qk.transaction(id) });
      queryClient.invalidateQueries({ queryKey: qk.transactionLists });
      queryClient.invalidateQueries({ queryKey: qk.stats });
      queryClient.invalidateQueries({ queryKey: qk.customerBalance(txn.customer_id) });
      queryClient.invalidateQueries({ queryKey: qk.customerTransactionsAll(txn.customer_id) });
      queryClient.invalidateQueries({ queryKey: qk.customers });
    },
    onError: (err, txn) => {
      if (err?.code === 'NOT_RETRYABLE') {
        const id = txn.transaction_id;
        queryClient.invalidateQueries({ queryKey: qk.transaction(id) });
        queryClient.invalidateQueries({ queryKey: qk.transactionLists });
        queryClient.invalidateQueries({ queryKey: qk.stats });
      }
    },
  });

  let message = null;
  if (mutation.isError) {
    const err = mutation.error;
    if (err?.code === 'NOT_RETRYABLE') {
      message = "This transaction's status changed";
    } else if (err?.status === 404) {
      message = 'Transaction not found';
    } else if (err?.status === 0) {
      message =
        err?.code === 'TIMEOUT'
          ? 'The API did not respond in time.'
          : 'Cannot reach the API — you may be offline or the server is down.';
    } else {
      message = err?.message;
    }
  }

  return { ...mutation, message };
}
