import { useRetryTransaction } from '../hooks/useRetryTransaction.js';

export default function RetryButton({ txn, eligible = txn.retry_eligible }) {
  const { mutate, isPending, message } = useRetryTransaction();

  return (
    <span className="retry-button d-inline-flex flex-column align-items-start gap-1">
      {eligible && (
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={isPending}
          onClick={() => mutate(txn)}
        >
          {isPending && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
          {isPending ? 'Retrying…' : 'Retry'}
        </button>
      )}
      {message && (
        <span role="alert" className="small text-danger">
          {message}
        </span>
      )}
    </span>
  );
}
