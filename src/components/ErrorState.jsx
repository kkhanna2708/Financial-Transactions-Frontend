function errorMessage(error) {
  if (!error) return 'Something went wrong.';
  if (error.code === 'TIMEOUT') return 'The API did not respond in time.';
  if (error.code === 'NETWORK_ERROR') return 'Cannot reach the API — you may be offline or the server is down.';
  return error.message || 'Something went wrong.';
}

export default function ErrorState({ error, onRetry, variant }) {
  const message = errorMessage(error);

  if (variant === 'banner') {
    return (
      <div className="alert alert-warning d-flex align-items-center justify-content-between gap-2 py-2" role="alert">
        <span>Showing last known data — refresh failed: {message}</span>
        {onRetry && (
          <button type="button" className="btn btn-sm btn-outline-dark" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="alert alert-danger d-flex align-items-center justify-content-between gap-2" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-danger" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
