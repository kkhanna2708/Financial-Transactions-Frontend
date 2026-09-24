import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listCustomers, getBalance, getCustomerTransactions } from '../api/customers.js';
import { qk } from './queryKeys.js';

export function useCustomers() {
  return useQuery({
    queryKey: qk.customers,
    queryFn: ({ signal }) => listCustomers({ signal }),
    staleTime: 30000,
  });
}

export function useCustomerBalance(id) {
  return useQuery({
    queryKey: qk.customerBalance(id),
    queryFn: ({ signal }) => getBalance(id, { signal }),
    enabled: !!id,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });
}

export function useCustomerTransactions(id, page) {
  const params = { page, page_size: 20 };
  return useQuery({
    queryKey: qk.customerTransactions(id, params),
    queryFn: ({ signal }) => getCustomerTransactions(id, params, { signal }),
    enabled: !!id,
    placeholderData: keepPreviousData,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });
}
