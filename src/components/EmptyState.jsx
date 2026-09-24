export default function EmptyState({ message, action }) {
  return (
    <div className="empty-state text-center text-body-secondary py-5">
      <p className="mb-3">{message}</p>
      {action}
    </div>
  );
}
