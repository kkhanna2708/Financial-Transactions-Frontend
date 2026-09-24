export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}
