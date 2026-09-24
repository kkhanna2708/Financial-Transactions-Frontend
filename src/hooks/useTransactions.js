import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listTransactions } from '../api/transactions.js';
import { qk } from './queryKeys.js';

export function useTransactions(filters) {
  return useQuery({
    queryKey: qk.transactionList(filters),
    queryFn: ({ signal }) => listTransactions(filters, { signal }),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}
