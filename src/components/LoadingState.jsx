export default function LoadingState({ label = 'Loading…' }) {
  return (
    <p role="status" className="d-flex align-items-center gap-2 text-body-secondary my-3">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      {label}
    </p>
  );
}
