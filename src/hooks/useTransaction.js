import { useQuery } from '@tanstack/react-query';
import { getTransaction } from '../api/transactions.js';
import { qk } from './queryKeys.js';

export const ACTIVE_STATUSES = ['PENDING', 'PROCESSING', 'RETRY'];

export const detailRefetchInterval = (query) =>
  ACTIVE_STATUSES.includes(query.state.data?.status) ? 2000 : false;

export function useTransaction(id) {
  return useQuery({
    queryKey: qk.transaction(id),
    queryFn: ({ signal }) => getTransaction(id, { signal }),
    enabled: !!id,
    refetchInterval: detailRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
