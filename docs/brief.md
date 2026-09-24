# Original brief (verbatim from user, 2026-09-24)

Build a React operational dashboard for a transaction-processing backend. Project folder: `txn-frontend/`. Time budget is tight (~60 min of agent work). Prioritise working flows, correct states and a clean structure over visual polish.

## Stack (fixed)
- Vite + React 18, JavaScript (not TypeScript), React Router v6.
- TanStack Query v5 for server state (polling, caching, invalidation, dedupe).
- Plain CSS modules or a single small stylesheet. No heavy UI library.
- Vitest + React Testing Library + MSW (Mock Service Worker) for tests and for local development when the backend is not running.
- API base URL from VITE_API_BASE_URL (default http://localhost:8000). Dev server on port 5173.

## Structure
src/
  api/client.js        -> fetch wrapper: JSON, timeout (AbortController, 10s), parses the backend error shape {error:{code,message,details}} into an ApiError(status, code, message, details)
  api/transactions.js  -> createTransaction, getTransaction, listTransactions, retryTransaction, getStats
  api/customers.js     -> listCustomers, getBalance, getCustomerTransactions
  api/health.js
  hooks/               -> useTransactions, useTransaction, useStats, useCustomer..., useCreateTransaction, useRetryTransaction (all TanStack Query)
  components/          -> StatusBadge, StatCard, Pagination, FiltersBar, TransactionTable, Money, ErrorState, EmptyState, LoadingState, RetryButton, LastUpdated, HealthIndicator
  pages/               -> DashboardPage, TransactionDetailPage, CustomersPage, CustomerDetailPage, NotFound
  mocks/               -> MSW handlers implementing the contract below (with an in-memory store that moves PENDING -> PROCESSING -> SUCCESS/FAILED over a few seconds)
Pages never call fetch directly — only through hooks -> api layer.

## API contract (exact — the backend implements this)
Error shape: {"error": {"code": "STRING", "message": "text", "details": {...}|null}}
Money amounts are strings like "100.00". Never parse them into floats for arithmetic; display them formatted.
Statuses: PENDING, PROCESSING, RETRY, SUCCESS, FAILED. Types: CREDIT, DEBIT.
- POST /transactions {transaction_id, customer_id, type, amount} -> 202 {transaction_id,status,created:true} | 200 {...,created:false} | 409 IDEMPOTENCY_CONFLICT | 422 validation
- GET /transactions/{id} -> {transaction_id, customer_id, type, amount, status, attempts, max_attempts, manual_retries, failure_code, failure_reason, next_run_at, created_at, updated_at, processed_at, retry_eligible, events:[{from_status,to_status,attempt,worker_id,message,created_at}]}
- GET /transactions?status=&type=&customer_id=&page=&page_size= -> {items, page, page_size, total}
- GET /customers -> [{customer_id, name, balance}]
- GET /customers/{id}/balance -> {customer_id, balance, updated_at}
- GET /customers/{id}/transactions?page=&page_size= -> {items, page, page_size, total}
- POST /transactions/{id}/retry -> 202 transaction | 409 NOT_RETRYABLE | 404
- GET /stats -> {PENDING, PROCESSING, RETRY, SUCCESS, FAILED}
- GET /health -> {status, db, queue_depth, oldest_pending_age_seconds, stale_processing}

## Features
1. Dashboard: stat cards for Pending, Processing, Retry, Success, Failed (from /stats), a health indicator, a "New transaction" form, and a paginated transaction table with filters (status, type, customer dropdown from /customers). Filters and page live in URL search params so refresh and back/forward work. Changing a filter resets to page 1.
2. New transaction form: customer select, type select, amount input. Client-side validation (required, > 0, max 2 decimals) with inline messages; show server 422 details against the fields.
   Duplicate-submission prevention: generate transaction_id with crypto.randomUUID() when the form is first edited, keep it until a successful response, and reuse it if the user resubmits after a network error or timeout (so the backend idempotency handles it). Disable the submit button while pending. After success show the new transaction_id as a link, reset the form and generate a fresh id. Show 200 created:false as "already submitted" (informational) and 409 as a clear error.
3. Transaction detail page: all fields, status badge, attempts x/max, failure code + reason, next retry time, event timeline, retry button when retry_eligible. Polls every 2s while status is PENDING/PROCESSING/RETRY and stops when SUCCESS/FAILED.
4. Customers page (list with balances) and customer detail page: current balance + paginated history.
5. Retry action (table row and detail page): disabled while the mutation is pending (no double clicks). On success, invalidate the transaction, the lists, the stats and that customer's balance. On 409 NOT_RETRYABLE, show "This transaction's status changed" and refetch immediately — this is the stale-UI case.
6. Auto-refresh: stats and the table refetch every 3s while the tab is visible (refetchIntervalInBackground false), refetchOnWindowFocus true. Use placeholderData: keepPreviousData so the table doesn't flash on page/filter change. Show a "Last updated hh:mm:ss" indicator and a subtle "refreshing" marker; if a background refetch fails, keep showing the old data with a warning banner instead of wiping the screen.
7. States everywhere: loading skeleton/text, empty state ("No transactions match these filters" with a clear-filters button), error state with a Retry button, 404 page for an unknown transaction/customer, and an offline/API-down message when fetch fails with a network error.
8. Accessibility basics: labels on inputs, buttons have text, status is not conveyed by colour alone.

## Tests (Vitest + RTL + MSW) — must pass
1. Form validation: amount 0 / negative / 3 decimals shows errors and does not call the API.
2. Submit flow: success shows the id link; the button is disabled while pending; double-click sends one request.
3. Network error then resubmit reuses the same transaction_id (assert on the request body in the MSW handler).
4. Server 422 and 409 errors render the correct messages.
5. Transaction table: renders rows, the empty state, and the error state; changing a status filter sends the correct query param and resets the page to 1.
6. Retry: success refetches and updates the status; 409 shows the stale message and refetches.
7. Detail page polling: status moves from PROCESSING to SUCCESS without user action (use fake timers or MSW sequence).

## Deliverables
- README.md: install, env var, run against the real backend, run with MSW mocks (VITE_USE_MOCKS=true), run tests, a short description of the folder structure and the state-handling decisions (idempotency key reuse, polling strategy, stale-state handling).
- Keep components small and reusable. No business logic in components beyond display formatting.

Work order: api layer + MSW mocks -> hooks -> Dashboard with table/filters/pagination -> form -> detail page with polling + retry -> customer pages -> tests -> README. Run `npm test` at the end and report the actual results.
