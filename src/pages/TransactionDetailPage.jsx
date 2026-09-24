import { Link, useParams } from 'react-router-dom';
import { useTransaction, ACTIVE_STATUSES } from '../hooks/useTransaction.js';
import Money from '../components/Money.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import RetryButton from '../components/RetryButton.jsx';
import LastUpdated from '../components/LastUpdated.jsx';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import NotFound from './NotFound.jsx';
import { formatDateTime } from '../lib/format.js';

function Field({ label, children }) {
  return (
    <>
      <dt className="col-sm-4 col-lg-3 text-body-secondary fw-normal">{label}</dt>
      <dd className="col-sm-8 col-lg-9">{children}</dd>
    </>
  );
}

export default function TransactionDetailPage() {
  const { id } = useParams();
  const txn = useTransaction(id);

  if (txn.isPending) {
    return <LoadingState label="Loading transaction…" />;
  }

  if (txn.isError && txn.data === undefined) {
    if (txn.error?.status === 404) return <NotFound message="Transaction not found" />;
    return <ErrorState error={txn.error} onRetry={txn.refetch} />;
  }

  const data = txn.data;
  const isActive = ACTIVE_STATUSES.includes(data.status);

  return (
    <div>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link to="/">Dashboard</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Transaction
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-wrap align-items-center gap-3 mb-4">
        <h1 className="h4 mb-0 text-break">
          Transaction {data.transaction_id}
        </h1>
        <StatusBadge status={data.status} />
        {isActive && <span className="badge text-bg-info">Live — updating every 2s</span>}
      </div>

      {txn.isError && txn.data !== undefined && (
        <ErrorState variant="banner" error={txn.error} onRetry={txn.refetch} />
      )}

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card shadow-sm">
            <div className="card-header bg-white d-flex align-items-center justify-content-between gap-2">
              <h2 className="h5 mb-0">Details</h2>
              <RetryButton txn={data} eligible={data.retry_eligible} />
            </div>
            <div className="card-body">
              <dl className="row mb-0">
                <Field label="Transaction ID">
                  <span className="font-monospace small text-break">{data.transaction_id}</span>
                </Field>
                <Field label="Customer">
                  <Link to={`/customers/${data.customer_id}`}>{data.customer_id}</Link>
                </Field>
                <Field label="Type">{data.type}</Field>
                <Field label="Amount">
                  <span className="fw-semibold">
                    <Money value={data.amount} />
                  </span>
                </Field>
                <Field label="Attempts">
                  {data.attempts} / {data.max_attempts}
                </Field>
                <Field label="Manual retries">{data.manual_retries}</Field>
                <Field label="Failure code">
                  {data.failure_code ? (
                    <code className="fw-semibold text-danger">{data.failure_code}</code>
                  ) : (
                    '—'
                  )}
                </Field>
                <Field label="Failure reason">
                  <span className={data.failure_reason ? 'text-danger' : undefined}>{data.failure_reason || '—'}</span>
                </Field>
                <Field label="Next retry">{formatDateTime(data.next_run_at)}</Field>
                <Field label="Created">{formatDateTime(data.created_at)}</Field>
                <Field label="Updated">{formatDateTime(data.updated_at)}</Field>
                <Field label="Processed">{formatDateTime(data.processed_at)}</Field>
              </dl>
            </div>
            <div className="card-footer bg-white">
              <LastUpdated dataUpdatedAt={txn.dataUpdatedAt} isFetching={txn.isFetching} />
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card shadow-sm">
            <div className="card-header bg-white">
              <h2 className="h5 mb-0">Event timeline</h2>
            </div>
            <div className="card-body">
              {data.events && data.events.length > 0 ? (
                <ol className="timeline list-unstyled mb-0">
                  {data.events.map((ev, i) => (
                    <li key={i} className="timeline__item">
                      <div className="fw-semibold small">
                        {ev.from_status || '—'} → {ev.to_status}
                      </div>
                      <div className="small text-body-secondary">
                        attempt {ev.attempt}
                        {ev.worker_id ? ` · ${ev.worker_id}` : ''}
                        {ev.message ? ` · ${ev.message}` : ''}
                      </div>
                      <div className="small text-body-tertiary">{formatDateTime(ev.created_at)}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-body-secondary mb-0">No events yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
