# Requirements — txn-frontend

## Goal
Build a React operational dashboard for a transaction-processing backend: view/create transactions, monitor status transitions, retry failed ones, and browse customers/balances, with correct loading/empty/error/offline states and live auto-refresh.

## Scope
- Dashboard (stats, health, filters/pagination table, new-transaction form)
- Transaction detail page with polling + retry
- Customers list + customer detail (balance + history)
- MSW mocks for local dev/tests; real backend via `VITE_API_BASE_URL`
- Vitest/RTL test suite (7 required tests)

## Out of scope
- Auth/login, user management
- Editing/cancelling existing transactions
- Charts/analytics beyond the 5 stat cards
- i18n, theming, visual polish beyond basic a11y
- Backend implementation (mocked only)

## API contract (exact, as given)
Error shape: `{"error": {"code": "STRING", "message": "text", "details": {...}|null}}`
Money amounts are strings like `"100.00"` — never parsed into floats for arithmetic, only formatted for display.
Statuses: `PENDING, PROCESSING, RETRY, SUCCESS, FAILED`. Types: `CREDIT, DEBIT`.

- `POST /transactions {transaction_id, customer_id, type, amount}` → 202 `{transaction_id,status,created:true}` | 200 `{...,created:false}` | 409 `IDEMPOTENCY_CONFLICT` | 422 validation
- `GET /transactions/{id}` → `{transaction_id, customer_id, type, amount, status, attempts, max_attempts, manual_retries, failure_code, failure_reason, next_run_at, created_at, updated_at, processed_at, retry_eligible, events:[{from_status,to_status,attempt,worker_id,message,created_at}]}`
- `GET /transactions?status=&type=&customer_id=&page=&page_size=` → `{items, page, page_size, total}`
- `GET /customers` → `[{customer_id, name, balance}]`
- `GET /customers/{id}/balance` → `{customer_id, balance, updated_at}`
- `GET /customers/{id}/transactions?page=&page_size=` → `{items, page, page_size, total}`
- `POST /transactions/{id}/retry` → 202 transaction | 409 `NOT_RETRYABLE` | 404
- `GET /stats` → `{PENDING, PROCESSING, RETRY, SUCCESS, FAILED}`
- `GET /health` → `{status, db, queue_depth, oldest_pending_age_seconds, stale_processing}`

## Functional requirements

**FR-1 — Dashboard stats & health**
Show 5 stat cards (Pending/Processing/Retry/Success/Failed) from `/stats`, and a health indicator from `/health`.
Acceptance: cards render counts from `/stats`; health indicator shows healthy/unhealthy state distinguishable by text+icon (not colour alone); if `/health` fails, indicator shows an offline/unknown state without crashing the page.

**FR-2 — Transaction table with filters, URL-synced**
Paginated table with filters: status, type, customer (dropdown from `/customers`). Filters and page live in URL search params.
Acceptance: refresh/back/forward preserve filters+page; changing any filter resets `page` to 1; table calls `/transactions` with matching query params.

**FR-3 — New transaction form**
Fields: customer select, type select, amount input, with client-side validation (required, >0, max 2 decimals) and inline error messages.
Acceptance: invalid amount (0, negative, 3 decimals) shows inline error and does not call the API; valid submit calls `POST /transactions`.

**FR-4 — Idempotent submission**
Generate `transaction_id` via `crypto.randomUUID()` on first form edit; reuse the same id on resubmission after network error/timeout; generate a fresh id after success.
Acceptance: two submissions after a simulated network failure send the same `transaction_id` in the request body (asserted in test).

**FR-5 — Submission result handling**
Disable submit while pending; on success show the id as a link and reset the form; 200 `created:false` shows an informational "already submitted" message; 409 shows a clear conflict error; 422 shows field-level errors from `details`.
Acceptance: double-click submit results in exactly one API call; success/duplicate/409/422 each render the specified UI without crashing.

**FR-6 — Transaction detail page**
Show all transaction fields, status badge, attempts `x/max`, failure code+reason, next retry time, and event timeline. Poll every 2s while status is PENDING/PROCESSING/RETRY; stop polling on SUCCESS/FAILED.
Acceptance: given a mocked sequence PROCESSING→SUCCESS, the page updates status without user action and stops further polling.

**FR-7 — Retry action**
Retry button shown when `retry_eligible`; disabled while its own mutation is pending. On success, invalidate transaction detail, lists, stats, and that customer's balance. On 409 `NOT_RETRYABLE`, show a "status changed" message and refetch immediately.
Acceptance: success path updates displayed status; 409 path shows the stale-state message and triggers a refetch (test asserts on refetched data).

**FR-8 — Customers pages**
Customers list shows `customer_id, name, balance`. Customer detail shows current balance + paginated transaction history.
Acceptance: list renders rows from `/customers`; detail page renders balance from `/customers/{id}/balance` and paginated items from `/customers/{id}/transactions`.

**FR-9 — Auto-refresh**
Stats and the transaction table refetch every 3s while tab is visible (`refetchIntervalInBackground: false`), and on window focus. Table pagination uses `placeholderData: keepPreviousData`. Show "Last updated hh:mm:ss" and a subtle "refreshing" marker; a failed background refetch keeps old data and shows a warning banner instead of clearing the screen.
Acceptance: mock a background refetch failure — table keeps rendering previous rows plus a visible warning banner.

**FR-10 — Universal state handling**
Every data view supports loading, empty (with a "clear filters" action where applicable), error (with a Retry button), and offline/API-down states.
Acceptance: table renders loading skeleton on first load, an empty-state message + clear-filters button on zero results, and an error state with a working Retry button on API failure; unknown transaction/customer id routes render a 404 page.

**FR-11 — Accessibility basics**
All inputs have associated labels; all buttons have discernible text; status is conveyed by text/icon in addition to colour.
Acceptance: form inputs queryable by label via RTL `getByLabelText`; status badges include visible text, not colour swatches alone.

## Non-functional requirements
- **NFR-1** No floating-point arithmetic on money values anywhere in the codebase; amounts are formatted strings for display only.
- **NFR-2** Pages never call `fetch` directly — all network access goes through `hooks/ -> api/` layer; enforced by code structure/review, not automated lint in this pass.
- **NFR-3** All API calls timeout after 10s via `AbortController`; timeouts and network failures are normalized to `ApiError` with `code: TIMEOUT` / `NETWORK_ERROR`, `status: 0`.
- **NFR-4** App works fully against MSW mocks with no backend running (`VITE_USE_MOCKS=true`) and against a real backend at `VITE_API_BASE_URL` (default `http://localhost:8000`).
- **NFR-5** JavaScript only (no TypeScript); Vite + React 18 + React Router v6 + TanStack Query v5; no heavy UI library.
- **NFR-6** Basic accessibility per FR-11 (labels, button text, non-colour status cues) — no full WCAG audit in scope.

## Required tests → FR mapping
1. Form validation (0 / negative / 3-decimal amount) blocks API call → FR-3
2. Submit success shows id link; button disabled while pending; double-click = one request → FR-3, FR-5
3. Network error then resubmit reuses same `transaction_id` → FR-4
4. Server 422 and 409 render correct messages → FR-5
5. Table renders rows/empty/error; status filter sets query param and resets page to 1 → FR-2, FR-10
6. Retry: success refetches/updates status; 409 shows stale message and refetches → FR-7
7. Detail page polling moves PROCESSING → SUCCESS without user action → FR-6

## Deliverables
- Working app per the structure in `docs/brief.md` (api/, hooks/, components/, pages/, mocks/)
- `README.md`: install, env var, run against real backend, run with MSW (`VITE_USE_MOCKS=true`), run tests, folder-structure summary, and state-handling decisions (idempotency key reuse, polling strategy, stale-state handling)
- Passing `npm test` run with results reported

## Assumptions
- Default `page_size` = 20 when not specified by the user/UI.
- Dates/times displayed in the browser's local time zone, formatted for readability (not raw ISO).
- Health indicator: healthy when `/health` returns `status` indicating OK and `stale_processing` is false; any fetch failure or non-OK `status` shows an "unhealthy/unknown" state rather than hiding the indicator.
- MSW seed data: a small fixed set (~5–10) of transactions across all statuses/types and ~3 customers with balances, sufficient to exercise filters, pagination, and polling.
- Offline/network-error detection: a `fetch` `TypeError` (connection refused/DNS) or an `AbortError` from the 10s timeout is caught in `api/client.js` and mapped to `ApiError({status: 0, code: 'NETWORK_ERROR' | 'TIMEOUT', message})`; pages render the offline/API-down state on this specific error shape.
- "Amount max 2 decimals" validated via regex on the raw string input, not numeric rounding, to avoid float issues.
- `NFR-2` (no direct `fetch` in pages) is verified by code review/structure, not an automated ESLint rule, given the time budget.
