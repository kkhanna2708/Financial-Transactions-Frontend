import { useStats } from '../hooks/useStats.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { useTransactionFilters } from '../hooks/useTransactionFilters.js';
import { useCustomers } from '../hooks/useCustomers.js';
import HealthIndicator from '../components/HealthIndicator.jsx';
import StatCard from '../components/StatCard.jsx';
import FiltersBar from '../components/FiltersBar.jsx';
import TransactionTable from '../components/TransactionTable.jsx';
import Pagination from '../components/Pagination.jsx';
import LastUpdated from '../components/LastUpdated.jsx';
import LoadingState from '../components/LoadingState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import NewTransactionForm from '../components/NewTransactionForm.jsx';
import NotFound from './NotFound.jsx';

const STAT_LABELS = [
  ['PENDING', 'Pending'],
  ['PROCESSING', 'Processing'],
  ['RETRY', 'Retry'],
  ['SUCCESS', 'Success'],
  ['FAILED', 'Failed'],
];

export default function DashboardPage() {
  const { filters, setFilter, setPage, clearFilters, hasFilters } = useTransactionFilters();
  const stats = useStats();
  const customers = useCustomers();
  const txns = useTransactions(filters);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <h1 className="h3 mb-0">Dashboard</h1>
        <HealthIndicator />
      </div>

      <section className="mb-4" aria-label="Transaction counts by status">
        {stats.isPending ? (
          <LoadingState label="Loading stats…" />
        ) : stats.isError && stats.data === undefined ? (
          <ErrorState error={stats.error} onRetry={stats.refetch} />
        ) : (
          <>
            {stats.isError && stats.data !== undefined && (
              <ErrorState variant="banner" error={stats.error} onRetry={stats.refetch} />
            )}
            <div className="row row-cols-2 row-cols-md-3 row-cols-lg-5 g-3 mb-2">
              {STAT_LABELS.map(([key, label]) => (
                <div className="col" key={key}>
                  <StatCard label={label} status={key} count={stats.data?.[key] ?? 0} />
                </div>
              ))}
            </div>
            <LastUpdated dataUpdatedAt={stats.dataUpdatedAt} isFetching={stats.isFetching} />
          </>
        )}
      </section>

      <div className="row g-4">
        <div className="col-lg-4 col-xl-3">
          <NewTransactionForm />
        </div>

        <div className="col-lg-8 col-xl-9">
          <div className="card shadow-sm">
            <div className="card-header bg-white">
              <h2 className="h5 mb-3">Transactions</h2>
              <FiltersBar
                filters={filters}
                customers={customers.data}
                onChange={setFilter}
                onClear={clearFilters}
              />
            </div>

            <div className="card-body p-0">
              {txns.isPending ? (
                <div className="px-3">
                  <LoadingState label="Loading transactions…" />
                </div>
              ) : txns.isError && txns.data === undefined ? (
                txns.error?.status === 404 ? (
                  <NotFound />
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
                    <EmptyState
                      message={hasFilters ? 'No transactions match these filters' : 'No transactions yet'}
                      action={
                        hasFilters ? (
                          <button type="button" className="btn btn-sm btn-primary" onClick={clearFilters}>
                            Clear filters
                          </button>
                        ) : null
                      }
                    />
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
      </div>
    </div>
  );
}
