import { useSearchParams } from 'react-router-dom';

export function useTransactionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get('status') || '';
  const type = searchParams.get('type') || '';
  const customer_id = searchParams.get('customer_id') || '';
  const page = Number(searchParams.get('page')) || 1;

  const filters = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(customer_id ? { customer_id } : {}),
    page,
    page_size: 20,
  };

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value == null) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete('page');
    setSearchParams(next);
  }

  function setPage(n) {
    const next = new URLSearchParams(searchParams);
    if (n === 1) {
      next.delete('page');
    } else {
      next.set('page', String(n));
    }
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams({});
  }

  const hasFilters = !!(status || type || customer_id);

  return { filters, setFilter, setPage, clearFilters, hasFilters };
}
