export default function StatCard({ label, count, status }) {
  return (
    <div className={`card shadow-sm h-100 stat-card stat-card--${status}`}>
      <div className="card-body py-3">
        <div className="text-body-secondary small text-uppercase fw-semibold">{label}</div>
        <div className="stat-card__count">{count}</div>
      </div>
    </div>
  );
}
