import { Link } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers.js';
import Money from '../components/Money.jsx';
import LoadingState from '../components/LoadingState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';

export default function CustomersPage() {
  const customers = useCustomers();

  return (
    <div>
      <h1 className="h3 mb-4">Customers</h1>

      {customers.isPending ? (
        <LoadingState label="Loading customers…" />
      ) : customers.isError && customers.data === undefined ? (
        <ErrorState error={customers.error} onRetry={customers.refetch} />
      ) : (
        <>
          {customers.isError && customers.data !== undefined && (
            <ErrorState variant="banner" error={customers.error} onRetry={customers.refetch} />
          )}
          <div className="card shadow-sm">
            {customers.data.length === 0 ? (
              <EmptyState message="No customers yet" />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th scope="col">Customer ID</th>
                      <th scope="col">Name</th>
                      <th scope="col" className="text-end">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.data.map((c) => (
                      <tr key={c.customer_id}>
                        <td>
                          <Link to={`/customers/${c.customer_id}`} className="font-monospace">
                            {c.customer_id}
                          </Link>
                        </td>
                        <td>{c.name}</td>
                        <td className="text-end">
                          <Money value={c.balance} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
