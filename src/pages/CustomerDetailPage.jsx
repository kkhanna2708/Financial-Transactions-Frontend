import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useCustomers, useCustomerBalance, useCustomerTransactions } from '../hooks/useCustomers.js';
import Money from '../components/Money.jsx';
import TransactionTable from '../components/TransactionTable.jsx';
import Pagination from '../components/Pagination.jsx';
import LoadingState from '../components/LoadingState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import LastUpdated from '../components/LastUpdated.jsx';
import { formatDateTime } from '../lib/format.js';
import NotFound from './NotFound.jsx';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page')) || 1;

  const customers = useCustomers();
  const balance = useCustomerBalance(id);
  const txns = useCustomerTransactions(id, page);

  const setPage = (n) => {
    const next = new URLSearchParams(searchParams);
    if (n === 1) next.delete('page');
    else next.set('page', String(n));
    setSearchParams(next);
  };

  if (balance.isError && balance.data === undefined && balance.error?.status === 404) {
    return <NotFound message="Customer not found" />;
  }

  const name = customers.data?.find((c) => c.customer_id === id)?.name;

  return (
    <div>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link to="/customers">Customers</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {id}
          </li>
        </ol>
      </nav>
      <h1 className="h3 mb-4">
        {name || id} {name && <small className="text-body-secondary fs-6 font-monospace">{id}</small>}
      </h1>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          {balance.isPending ? (
            <LoadingState label="Loading balance…" />
          ) : balance.isError && balance.data === undefined ? (
            <ErrorState error={balance.error} onRetry={balance.refetch} />
          ) : (
            <>
              {balance.isError && balance.data !== undefined && (
                <ErrorState variant="banner" error={balance.error} onRetry={balance.refetch} />
              )}
              <dl className="row mb-2">
                <dt className="col-sm-3 text-body-secondary fw-normal">Balance</dt>
                <dd className="col-sm-9 fs-3 fw-bold mb-1">
                  <Money value={balance.data.balance} />
                </dd>
                <dt className="col-sm-3 text-body-secondary fw-normal">Updated</dt>
                <dd className="col-sm-9 mb-0">{formatDateTime(balance.data.updated_at)}</dd>
              </dl>
              <LastUpdated dataUpdatedAt={balance.dataUpdatedAt} isFetching={balance.isFetching} />
            </>
          )}
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header bg-white">
          <h2 className="h5 mb-0">Transaction history</h2>
        </div>
        <div className="card-body p-0">
          {txns.isPending ? (
            <div className="px-3">
              <LoadingState label="Loading transactions…" />
            </div>
          ) : txns.isError && txns.data === undefined ? (
            txns.error?.status === 404 ? (
              <NotFound message="Customer not found" />
            ) : (
              <div className="p-3">
                <ErrorState error={txns.error} onRetry={txns.refetch} />
              </div>
            )
          ) : (
            <>
              {txns.isError && txns.data !== undefined && (
                <div className="px-3 pt-3">
                  <ErrorState variant="banner" error={txns.error} onRetry={txns.refetch} />
                </div>
              )}
              {txns.data.items.length === 0 ? (
                <EmptyState message="No transactions for this customer yet" />
              ) : (
                <TransactionTable items={txns.data.items} />
              )}
            </>
          )}
        </div>
        {txns.data && (
          <div className="card-footer bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
            <LastUpdated dataUpdatedAt={txns.dataUpdatedAt} isFetching={txns.isFetching} />
            {txns.data.items.length > 0 && (
              <Pagination
                page={txns.data.page}
                pageSize={txns.data.page_size}
                total={txns.data.total}
                onChange={setPage}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
