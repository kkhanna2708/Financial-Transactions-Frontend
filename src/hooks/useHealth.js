import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api/health.js';
import { qk } from './queryKeys.js';

export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: ({ signal }) => getHealth({ signal }),
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
