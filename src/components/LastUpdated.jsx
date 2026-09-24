import { formatTime } from '../lib/format.js';

export default function LastUpdated({ dataUpdatedAt, isFetching }) {
  return (
    <p className="last-updated small text-body-secondary mb-0">
      {dataUpdatedAt ? `Last updated ${formatTime(dataUpdatedAt)}` : null}
      {isFetching && (
        <span aria-live="polite">
          {' '}
          <span className="refreshing-dot" aria-hidden="true" /> refreshing…
        </span>
      )}
    </p>
  );
}
