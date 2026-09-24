export default function FiltersBar({ filters, customers, onChange, onClear }) {
  return (
    <div className="filters-bar row g-2 align-items-end" role="search" aria-label="Filter transactions">
      <div className="col-sm-6 col-md-3">
        <label htmlFor="filter-status" className="form-label small mb-1">
          Status
        </label>
        <select
          id="filter-status"
          className="form-select form-select-sm"
          value={filters.status || ''}
          onChange={(e) => onChange('status', e.target.value)}
        >
          <option value="">All</option>
          <option value="PENDING">PENDING</option>
          <option value="PROCESSING">PROCESSING</option>
          <option value="RETRY">RETRY</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILED">FAILED</option>
        </select>
      </div>
      <div className="col-sm-6 col-md-3">
        <label htmlFor="filter-type" className="form-label small mb-1">
          Type
        </label>
        <select
          id="filter-type"
          className="form-select form-select-sm"
          value={filters.type || ''}
          onChange={(e) => onChange('type', e.target.value)}
        >
          <option value="">All</option>
          <option value="CREDIT">CREDIT</option>
          <option value="DEBIT">DEBIT</option>
        </select>
      </div>
      <div className="col-sm-8 col-md-4">
        <label htmlFor="filter-customer" className="form-label small mb-1">
          Customer
        </label>
        <select
          id="filter-customer"
          className="form-select form-select-sm"
          value={filters.customer_id || ''}
          onChange={(e) => onChange('customer_id', e.target.value)}
        >
          <option value="">All</option>
          {(customers || []).map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-sm-4 col-md-2 d-grid">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClear}>
          Clear filters
        </button>
      </div>
    </div>
  );
}
