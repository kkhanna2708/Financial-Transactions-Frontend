import { Link } from 'react-router-dom';
import Money from './Money.jsx';
import StatusBadge from './StatusBadge.jsx';
import RetryButton from './RetryButton.jsx';
import { formatDateTime } from '../lib/format.js';

export default function TransactionTable({ items }) {
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Customer</th>
            <th scope="col">Type</th>
            <th scope="col" className="text-end">
              Amount
            </th>
            <th scope="col">Status</th>
            <th scope="col">Attempts</th>
            <th scope="col">Created</th>
            <th scope="col">Retry</th>
          </tr>
        </thead>
        <tbody>
          {items.map((txn) => {
            const eligible = txn.retry_eligible ?? txn.status === 'FAILED';
            return (
              <tr key={txn.transaction_id}>
                <td>
                  <Link
                    to={`/transactions/${txn.transaction_id}`}
                    className="txn-id d-inline-block text-truncate font-monospace small align-middle"
                    title={txn.transaction_id}
                  >
                    {txn.transaction_id}
                  </Link>
                </td>
                <td>{txn.customer_id}</td>
                <td>
                  <span className={`small fw-semibold ${txn.type === 'CREDIT' ? 'text-success' : 'text-danger'}`}>
                    {txn.type}
                  </span>
                </td>
                <td className="text-end">
                  <Money value={txn.amount} />
                </td>
                <td>
                  <StatusBadge status={txn.status} />
                  {txn.failure_code && (
                    <div className="failure mt-1">
                      <code className="fw-semibold">{txn.failure_code}</code>
                      {txn.failure_reason && <div className="text-body-secondary">{txn.failure_reason}</div>}
                    </div>
                  )}
                </td>
                <td>
                  {txn.attempts} / {txn.max_attempts}
                </td>
                <td className="small text-nowrap">{formatDateTime(txn.created_at)}</td>
                <td>
                  <RetryButton txn={txn} eligible={eligible} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
