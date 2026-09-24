import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCreateTransaction } from '../hooks/useCreateTransaction.js';
import { useCustomers } from '../hooks/useCustomers.js';
import { validateTransaction } from '../lib/validation.js';
import { fieldErrorsFromDetails } from '../lib/fieldErrors.js';

const EMPTY_VALUES = { customer_id: '', type: '', amount: '' };

export default function NewTransactionForm() {
  const customers = useCustomers();
  const { touch, submit, isPending } = useCreateTransaction();
  const [values, setValues] = useState(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null);

  function handleChange(field, value) {
    setValues((v) => ({ ...v, [field]: value }));
    touch();
    setFieldErrors((errs) => {
      if (!errs[field]) return errs;
      const next = { ...errs };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validateTransaction(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setResult(null);

    const outcome = await submit(values);
    if (outcome.ignored) return;

    if (outcome.ok) {
      const { data } = outcome;
      if (data.created) {
        setResult({ kind: 'success', id: data.transaction_id });
      } else {
        setResult({ kind: 'duplicate', id: data.transaction_id });
      }
      setValues(EMPTY_VALUES);
      setFieldErrors({});
      return;
    }

    const err = outcome.error;
    if (err?.status === 409) {
      setResult({ kind: 'error', message: 'Conflict: this transaction ID was already used with different details. Please submit again.' });
    } else if (err?.status === 422) {
      const mapped = fieldErrorsFromDetails(err.details);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
        setResult(null);
      } else {
        setResult({ kind: 'error', message: err.message });
      }
    } else if (err?.status === 0) {
      setResult({
        kind: 'error',
        message: 'Network problem — your transaction may not have been saved. Submit again; it will not be duplicated.',
      });
    } else {
      setResult({ kind: 'error', message: err?.message || 'Something went wrong.' });
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="New transaction" className="card shadow-sm">
      <div className="card-header bg-white">
        <h2 className="h5 mb-0">New transaction</h2>
      </div>
      <div className="card-body">
        <div className="mb-3">
          <label htmlFor="new-txn-customer" className="form-label">
            Customer
          </label>
          <select
            id="new-txn-customer"
            className={`form-select${fieldErrors.customer_id ? ' is-invalid' : ''}`}
            value={values.customer_id}
            onChange={(e) => handleChange('customer_id', e.target.value)}
            aria-invalid={!!fieldErrors.customer_id}
            aria-describedby={fieldErrors.customer_id ? 'customer_id-error' : undefined}
          >
            <option value="">Select…</option>
            {(customers.data || []).map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.name}
              </option>
            ))}
          </select>
          {fieldErrors.customer_id && (
            <div id="customer_id-error" role="alert" className="invalid-feedback">
              {fieldErrors.customer_id}
            </div>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="new-txn-type" className="form-label">
            Type
          </label>
          <select
            id="new-txn-type"
            className={`form-select${fieldErrors.type ? ' is-invalid' : ''}`}
            value={values.type}
            onChange={(e) => handleChange('type', e.target.value)}
            aria-invalid={!!fieldErrors.type}
            aria-describedby={fieldErrors.type ? 'type-error' : undefined}
          >
            <option value="">Select…</option>
            <option value="CREDIT">CREDIT</option>
            <option value="DEBIT">DEBIT</option>
          </select>
          {fieldErrors.type && (
            <div id="type-error" role="alert" className="invalid-feedback">
              {fieldErrors.type}
            </div>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="new-txn-amount" className="form-label">
            Amount
          </label>
          <input
            id="new-txn-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={`form-control${fieldErrors.amount ? ' is-invalid' : ''}`}
            value={values.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            aria-invalid={!!fieldErrors.amount}
            aria-describedby={fieldErrors.amount ? 'amount-error' : undefined}
          />
          {fieldErrors.amount && (
            <div id="amount-error" role="alert" className="invalid-feedback">
              {fieldErrors.amount}
            </div>
          )}
        </div>

        <div className="d-grid">
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            {isPending ? 'Submitting…' : 'Create transaction'}
          </button>
        </div>

        {result?.kind === 'success' && (
          <div role="status" className="alert alert-success small mt-3 mb-0 text-break">
            Transaction created: <Link to={`/transactions/${result.id}`}>{result.id}</Link>
          </div>
        )}
        {result?.kind === 'duplicate' && (
          <div role="status" className="alert alert-info small mt-3 mb-0 text-break">
            This transaction was already submitted. <Link to={`/transactions/${result.id}`}>{result.id}</Link>
          </div>
        )}
        {result?.kind === 'error' && (
          <div role="alert" className="alert alert-danger small mt-3 mb-0">
            {result.message}
          </div>
        )}
      </div>
    </form>
  );
}
