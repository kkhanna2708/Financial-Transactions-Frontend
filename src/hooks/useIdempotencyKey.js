import { useRef, useCallback } from 'react';

export function useIdempotencyKey() {
  const ref = useRef(null);

  const ensureKey = useCallback(() => {
    if (!ref.current) ref.current = crypto.randomUUID();
    return ref.current;
  }, []);

  const rotateKey = useCallback(() => {
    ref.current = null;
  }, []);

  return { ensureKey, rotateKey };
}
