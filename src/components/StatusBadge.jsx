const GLYPHS = {
  PENDING: '…',
  PROCESSING: '↻',
  RETRY: '↺',
  SUCCESS: '✓',
  FAILED: '✕',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge rounded-pill status-badge status-badge--${status}`}>
      <span aria-hidden="true">{GLYPHS[status] || ''}</span>
      <span>{status}</span>
    </span>
  );
}
