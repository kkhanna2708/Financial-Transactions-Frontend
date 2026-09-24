export default function Pagination({ page, pageSize, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pagination d-flex align-items-center justify-content-between gap-2">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        Prev
      </button>
      <span className="small text-body-secondary">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}
