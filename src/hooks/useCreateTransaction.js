import { useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTransaction } from '../api/transactions.js';
import { qk } from './queryKeys.js';
import { useIdempotencyKey } from './useIdempotencyKey.js';

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { ensureKey, rotateKey } = useIdempotencyKey();
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: (body) => createTransaction(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.transactionLists });
      queryClient.invalidateQueries({ queryKey: qk.stats });
    },
  });

  const touch = useCallback(() => {
    ensureKey();
  }, [ensureKey]);

  const submit = useCallback(
    async (values) => {
      if (inFlight.current) return { ok: false, ignored: true };
      inFlight.current = true;
      const transaction_id = ensureKey();
      try {
        const data = await mutation.mutateAsync({ transaction_id, ...values });
        // 2xx (202 created:true, or 200 created:false) -> rotate to a fresh key
        rotateKey();
        return { ok: true, data };
      } catch (error) {
        const status = error?.status;
        // keep the key on network/timeout (status 0) or 5xx — outcome unknown
        if (!(status === 0 || status >= 500)) {
          rotateKey();
        }
        return { ok: false, error };
      } finally {
        inFlight.current = false;
      }
    },
    [ensureKey, rotateKey, mutation]
  );

  return { touch, submit, isPending: mutation.isPending };
}
