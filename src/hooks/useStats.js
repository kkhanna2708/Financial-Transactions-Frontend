import { useQuery } from '@tanstack/react-query';
import { getStats } from '../api/transactions.js';
import { qk } from './queryKeys.js';

export function useStats() {
  return useQuery({
    queryKey: qk.stats,
    queryFn: ({ signal }) => getStats({ signal }),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
