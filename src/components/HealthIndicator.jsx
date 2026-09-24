import { useHealth } from '../hooks/useHealth.js';

export default function HealthIndicator() {
  const { data, isError } = useHealth();

  if (isError) {
    return <span className="badge text-bg-danger fs-6">✕ API unreachable</span>;
  }

  if (!data) {
    return <span className="badge text-bg-secondary fs-6">Checking health…</span>;
  }

  const healthy = String(data.status).toLowerCase() === 'ok' && !data.stale_processing;

  if (healthy) {
    return <span className="badge text-bg-success fs-6">✓ API healthy</span>;
  }

  return (
    <span className="badge text-bg-warning fs-6">
      ⚠ Degraded — db: {String(data.db)}, queue_depth: {data.queue_depth}
    </span>
  );
}
