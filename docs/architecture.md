# Architecture — txn-frontend

Contract: `docs/requirements.md` (FR-1..FR-11, NFR-1..NFR-6). Brief: `docs/brief.md`. Greenfield (no existing code).

## 1. Tech stack
| Choice | Reason |
|---|---|
| Vite 5 + React 18 (JS) | Fixed by brief; fast dev server on 5173. |
| React Router v6 (`react-router-dom`) | Fixed; `useSearchParams` gives URL-synced filters (FR-2). |
| TanStack Query v5 | Fixed; polling, dedupe, `keepPreviousData`, invalidation (FR-6/7/9). |
| Plain CSS, one file `src/styles.css` | Fixed; no UI library (NFR-5). |
| MSW v2 (`http`, `HttpResponse`, `delay`) | One handler set shared by browser worker (dev) and Node server (tests) (NFR-4). |
| Vitest 2 + jsdom + RTL 16 + user-event 14 + jest-dom | Fixed; runs on the Vite config, no Babel/Jest setup. |

`package.json` (use these ranges exactly):
- deps: `react@^18.3.1`, `react-dom@^18.3.1`, `react-router-dom@^6.28.0`, `@tanstack/react-query@^5.59.0`
- devDeps: `vite@^5.4.10`, `@vitejs/plugin-react@^4.3.3`, `vitest@^2.1.4`, `jsdom@^25.0.1`, `msw@^2.6.0`, `@testing-library/react@^16.0.1`, `@testing-library/dom@^10.4.0`, `@testing-library/jest-dom@^6.6.2`, `@testing-library/user-event@^14.5.2`
- scripts (cross-platform, Windows-safe: no `cross-env`, no inline `VAR=x`):
  `"dev": "vite"`, `"dev:mocks": "vite --mode mocks"`, `"build": "vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`, `"test:watch": "vitest"`
- `"msw": { "workerDirectory": ["public"] }`; generate `public/mockServiceWorker.js` once with `npx msw init public --save`.
- `.env.mocks` contains `VITE_USE_MOCKS=true` (so `npm run dev:mocks` works on Windows). `.env.example` documents `VITE_API_BASE_URL=http://localhost:8000` and `VITE_USE_MOCKS=false`.

`vite.config.js`: `plugins:[react()]`, `server:{port:5173}`, `test:{environment:'jsdom', globals:true, setupFiles:['./src/test/setup.js'], testTimeout:10000}`.

## 2. System design
```
pages/*  --(props)-->  components/*          (display only)
  |
  v
hooks/*  (TanStack Query: queries, mutations, URL filter state, idempotency key)
  |
  v
api/*.js --> api/client.js (fetch + 10s timeout + ApiError)
  |
  v
VITE_API_BASE_URL  <-- real backend  OR  MSW (mocks/handlers.js + mocks/store.js)
```
- **api/client.js**: the only place that calls `fetch` (NFR-2). **api/{transactions,customers,health}.js**: one function per endpoint.
- **hooks/**: all server state, query keys and invalidation rules. Components never touch `queryClient`.
- **components/**: presentational (only local UI state such as the form's field values).
- **pages/**: compose hooks + components; read route params.
- **mocks/**: in-memory store + handlers; `browser.js` (worker) and `server.js` (tests) import the same `handlers`.
- **lib/**: pure helpers (money formatting, validation, date formatting, 422 detail mapping). No React.

Routes (`App.jsx`, inside `<Layout>` with nav links Dashboard, Customers):
`/` DashboardPage · `/transactions/:id` TransactionDetailPage · `/customers` CustomersPage · `/customers/:id` CustomerDetailPage · `*` NotFound.

`main.jsx`:
```js
async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return;
  const { worker } = await import('./mocks/browser.js');
  return worker.start({ onUnhandledRequest: 'bypass' });
}
enableMocking().then(() => createRoot(el).render(
  <QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>));
```
App `queryClient` defaults: `retry: (n, err) => (err?.status === 0 || err?.status >= 500) && n < 2` (never retries 4xx, so 404 surfaces immediately), `refetchOnWindowFocus: true`, `staleTime: 0`.

## 3. API layer & contracts

### api/config.js
`export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')`. Imported by client AND mocks (MSW matches absolute URLs).

### api/client.js
```js
export class ApiError extends Error {
  constructor(status, code, message, details = null) // name='ApiError'; fields status, code, message, details
  get isNetwork() { return this.status === 0 }       // NETWORK_ERROR or TIMEOUT
}
export async function request(path, { method='GET', body, query, signal, timeoutMs=10000 } = {})
```
- URL = `API_BASE + path` + `?` + URLSearchParams of `query`, dropping `undefined/null/''` values.
- Headers `Accept: application/json`; when body present add `Content-Type: application/json` and `JSON.stringify(body)`.
- Timeout: own `AbortController`; `setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)`; if the caller `signal` (TanStack) aborts, forward to `ctrl.abort()`. Always `clearTimeout` in `finally`.
- Error mapping:
  | Condition | Result |
  |---|---|
  | abort and `timedOut` | `ApiError(0,'TIMEOUT','The API did not respond within 10s')` |
  | abort from caller signal | rethrow original error (query cancellation, not a failure) |
  | fetch throws anything else (`TypeError` etc.) | `ApiError(0,'NETWORK_ERROR','Cannot reach the API server')` |
  | `!res.ok`, body `{error:{code,message,details}}` | `ApiError(res.status, code, message, details ?? null)` |
  | `!res.ok`, non-JSON / other body | `ApiError(res.status, 'HTTP_'+res.status, res.statusText || 'Request failed', null)` |
  | ok | parsed JSON (empty body -> `null`) |
- Only JSON is returned; POST /transactions 200 vs 202 is distinguished by the `created` field.

### Endpoint functions (queries take `{signal}` as last arg)
| Function | Request | Response |
|---|---|---|
| `listTransactions({status,type,customer_id,page,page_size},{signal})` | GET /transactions | `{items:Txn[],page,page_size,total}` |
| `getTransaction(id,{signal})` | GET /transactions/{id} | `TxnDetail` (brief fields incl. `events[]`) |
| `createTransaction({transaction_id,customer_id,type,amount})` | POST /transactions | `{transaction_id,status,created}` (202 true / 200 false); errors 409 `IDEMPOTENCY_CONFLICT`, 422 |
| `retryTransaction(id)` | POST /transactions/{id}/retry | `TxnDetail` (202); errors 409 `NOT_RETRYABLE`, 404 |
| `getStats({signal})` | GET /stats | `{PENDING,PROCESSING,RETRY,SUCCESS,FAILED}` |
| `listCustomers({signal})` | GET /customers | `[{customer_id,name,balance}]` |
| `getBalance(id,{signal})` | GET /customers/{id}/balance | `{customer_id,balance,updated_at}` |
| `getCustomerTransactions(id,{page,page_size},{signal})` | GET /customers/{id}/transactions | `{items,page,page_size,total}` |
| `getHealth({signal})` | GET /health | `{status,db,queue_depth,oldest_pending_age_seconds,stale_processing}` |

List items (`Txn`) are assumed to be detail fields minus `events`; a row's RetryButton uses `retry_eligible` (falls back to `status === 'FAILED'` if absent). `page_size` is always 20.

422 `details` mapping — `lib/fieldErrors.js` `fieldErrorsFromDetails(details) -> {field: message}` accepting: `{fields:{amount:'msg'}}`, `{amount:'msg'|['msg']}`, `[{loc:[...,'amount'],msg}]`, `[{field,message}]`. Unknown shape -> `{}` (form shows `error.message` as a form-level error). MSW emits `{error:{code:'VALIDATION_ERROR',message:'Validation failed',details:{fields:{...}}}}`.

## 4. Hooks, query keys, polling, invalidation

### hooks/queryKeys.js
```js
export const qk = {
  transactionsAll: ['transactions'],
  transactionLists: ['transactions', 'list'],
  transactionList: (filters) => ['transactions', 'list', filters],   // {status,type,customer_id,page,page_size}, empty keys omitted
  transaction: (id) => ['transactions', 'detail', id],
  stats: ['stats'],
  health: ['health'],
  customers: ['customers', 'list'],
  customerBalance: (id) => ['customers', id, 'balance'],
  customerTransactions: (id, params) => ['customers', id, 'transactions', params],
  customerTransactionsAll: (id) => ['customers', id, 'transactions'],
};
```

### Queries (all pass TanStack's `signal` to the api layer; retry = app default above)
| Hook | Key | Options |
|---|---|---|
| `useStats()` | `qk.stats` | `refetchInterval:3000, refetchIntervalInBackground:false, refetchOnWindowFocus:true` |
| `useTransactions(filters)` | `qk.transactionList(filters)` | same three + `placeholderData: keepPreviousData` |
| `useTransaction(id)` | `qk.transaction(id)` | `refetchInterval: detailRefetchInterval, refetchIntervalInBackground:false, refetchOnWindowFocus:true` |
| `useCustomers()` | `qk.customers` | `staleTime: 30000` (dropdown/list) |
| `useCustomerBalance(id)` | `qk.customerBalance(id)` | `refetchInterval:3000, refetchIntervalInBackground:false` |
| `useCustomerTransactions(id,page)` | `qk.customerTransactions(id,{page,page_size:20})` | `placeholderData: keepPreviousData, refetchInterval:3000, refetchIntervalInBackground:false` |
| `useHealth()` | `qk.health` | `refetchInterval:10000, refetchIntervalInBackground:false, retry:false` |

```js
export const ACTIVE_STATUSES = ['PENDING', 'PROCESSING', 'RETRY'];
export const detailRefetchInterval = (query) =>
  ACTIVE_STATUSES.includes(query.state.data?.status) ? 2000 : false;   // exported for unit test
```

### URL filter state — `hooks/useTransactionFilters.js`
Uses `useSearchParams`. Returns `{ filters:{status,type,customer_id,page:Number(page)||1,page_size:20}, setFilter(key,value), setPage(n), clearFilters(), hasFilters }`.
- `setFilter`: copy params, set (or delete when `''`) the key, **delete `page`** (=> page 1), `setSearchParams(next)` (push entry, so back/forward works).
- `setPage(n)`: set `page` (delete when n===1). `clearFilters()`: `setSearchParams({})`.
- `filters` omits empty keys so query keys are stable. `page` is always sent to the API (`page=1` default).

### Mutations
**`useRetryTransaction()`** (one instance per RetryButton, so pending state is per row):
- `mutationFn: (txn) => retryTransaction(txn.transaction_id)`.
- `onSuccess(data, txn)`: `setQueryData(qk.transaction(id), old => old ? {...old, ...data} : data)`, then invalidate `qk.transaction(id)`, `qk.transactionLists`, `qk.stats`, `qk.customerBalance(txn.customer_id)`, `qk.customerTransactionsAll(txn.customer_id)`, `qk.customers`.
- `onError(err, txn)`: if `err.code === 'NOT_RETRYABLE'` -> invalidate `qk.transaction(id)`, `qk.transactionLists`, `qk.stats` (active queries refetch immediately).
- Returns the mutation plus `message`: `NOT_RETRYABLE` -> "This transaction's status changed"; 404 -> "Transaction not found"; network -> ErrorState network text; else `err.message`.
- RetryButton: `disabled={isPending}`, text "Retry" / "Retrying…"; message in `role="alert"` next to it.

**`useCreateTransaction()`** — owns the idempotency lifecycle; the component only calls it:
```js
const { ensureKey, rotateKey } = useIdempotencyKey(); // useRef-backed; ensureKey() = ref.current ??= crypto.randomUUID()
const inFlight = useRef(false);
touch()          // form onChange calls this -> ensureKey()   (id generated on first edit)
submit(values)   // Promise<{ok:true,data} | {ok:false,error}>; returns {ok:false,ignored:true} if inFlight.current
```
- `submit`: `if (inFlight.current) return ignored`; `inFlight.current = true`; `mutateAsync({transaction_id: ensureKey(), ...values})`; catch -> `{ok:false,error}`; `finally inFlight.current = false`.
- Key rules: **keep** the key when `err.status === 0` (NETWORK_ERROR/TIMEOUT) or `err.status >= 500` (outcome unknown -> resubmit is deduped by backend). **Rotate** on any 2xx (202 or 200 `created:false`), 409, 422 and other 4xx (server did not accept this id+payload; a fresh id avoids a spurious 409 after the user edits).
- `onSuccess`: invalidate `qk.transactionLists`, `qk.stats`.
- The `inFlight` ref guarantees one request on a double-click before React re-renders `isPending` (FR-5).
- Exposes `{ touch, submit, isPending }`.

## 5. Display rules
**Money (NFR-1) — `lib/money.js` `formatMoney(str)`**, string manipulation only; never `Number()`/`parseFloat`, never `Intl` on a number:
1. If input does not match `/^-?\d+(\.\d+)?$/`, return it unchanged.
2. Split sign, integer part, fraction part. Fraction = `(frac + '00').slice(0,2)` (truncate, never round).
3. Integer: strip leading zeros (keep a single `0`), group with `int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')`.
4. Return `${sign}${int}.${frac}` — `"1234.5" -> "1,234.50"`. `<Money value>` renders `<span class="money">`.
Mocks need arithmetic for balances: `mocks/money.js` `toCents(str)` = `sign * (parseInt(int,10)*100 + parseInt(frac.padEnd(2,'0').slice(0,2),10))`, `fromCents(n)` builds the string back. Integers only.

**Validation — `lib/validation.js` `validateTransaction({customer_id,type,amount}) -> {field: msg}`** (regex on the trimmed string; first failing rule per field wins):
- customer_id empty: "Select a customer"; type empty: "Select a type".
- amount empty: "Amount is required"; not `/^-?\d+(\.\d+)?$/`: "Enter a valid amount"; starts with `-` or has no `[1-9]` digit: "Amount must be greater than 0"; matches `/\.\d{3,}$/`: "Amount can have at most 2 decimal places".
Amount input is `type="text" inputMode="decimal"` (a number input would coerce the string). Amount is sent as the trimmed string.

**Dates — `lib/format.js`**: `formatDateTime(iso)` -> `new Date(iso).toLocaleString()` ('—' for null); `formatTime(ms)` -> `new Date(ms).toLocaleTimeString('en-GB',{hour12:false})` (hh:mm:ss).

**Refetch/error presentation (FR-9, FR-10)** — every data section follows:
```
isPending (no data)            -> <LoadingState/> (skeleton rows / "Loading…", role="status")
isError && data === undefined  -> error.status === 404 ? <NotFound/> : <ErrorState error onRetry={refetch}/>
isError && data !== undefined  -> keep rendering data + <ErrorState variant="banner" error onRetry={refetch}/>
                                  ("Showing last known data — refresh failed: <msg>", role="alert")
data with 0 items              -> <EmptyState message action/>
```
TanStack v5 keeps `data` when a refetch fails, so no extra state is needed. `ErrorState` text: `TIMEOUT` -> "The API did not respond in time."; `NETWORK_ERROR` -> "Cannot reach the API — you may be offline or the server is down."; else `error.message`; always a "Retry" button. `LastUpdated({dataUpdatedAt,isFetching})` -> "Last updated hh:mm:ss" + `<span aria-live="polite">refreshing…</span>` while `isFetching`.

**StatusBadge**: visible text label + `aria-hidden` glyph (PENDING `…`, PROCESSING `↻`, RETRY `↺`, SUCCESS `✓`, FAILED `✕`) + class `badge badge--{status}` for colour (FR-11).
**HealthIndicator**: healthy iff `String(status).toLowerCase() === 'ok'` and `!stale_processing` -> "✓ API healthy"; otherwise "⚠ Degraded" with db / queue_depth; query error -> "✕ API unreachable". Never throws (FR-1).

## 6. Pages
- **DashboardPage**: `<HealthIndicator/>`; 5 `<StatCard label count/>` from `useStats` + LastUpdated; `<NewTransactionForm/>`; `<FiltersBar filters customers onChange={setFilter} onClear={clearFilters}/>` (selects labelled "Status", "Type", "Customer"; option "All" = `''`); `<TransactionTable items/>` (columns: ID link to `/transactions/:id`, customer, type, Money, StatusBadge, attempts x/max, created, RetryButton if eligible); `<Pagination page pageSize total onChange={setPage}/>` ("Page x of y", Prev/Next disabled at bounds). Empty: "No transactions match these filters" + "Clear filters" button when `hasFilters`, else "No transactions yet".
- **NewTransactionForm** (component; local `values`, `fieldErrors`, `result`): onChange -> update value, `touch()`, clear that field's error. onSubmit -> `preventDefault`; `validateTransaction`; if errors, set them and **return without calling the API**; else `await submit(values)` and map:
  - `created:true` -> "Transaction created:" + `<Link to={/transactions/id}>{id}</Link>`; reset values.
  - `created:false` -> info "This transaction was already submitted." + link; reset values.
  - 409 -> error "Conflict: this transaction ID was already used with different details. Please submit again."
  - 422 -> `fieldErrors = fieldErrorsFromDetails(details)`; form-level `error.message` if the map is empty.
  - status 0 -> "Network problem — your transaction may not have been saved. Submit again; it will not be duplicated."
  Submit `disabled={isPending}`, text "Create transaction" / "Submitting…". Field errors as `<p id="amount-error" role="alert">` with `aria-invalid` + `aria-describedby`. Labels: "Customer", "Type", "Amount".
- **TransactionDetailPage**: `useTransaction(id)`; 404 -> NotFound; `<dl>` of all fields (Money, formatDateTime), StatusBadge, "Attempts x / max", manual_retries, failure_code + failure_reason, "Next retry" (`next_run_at`), RetryButton when `retry_eligible`, LastUpdated, "Live — updating every 2s" hint while active; events `<ol>` timeline (from -> to, attempt, worker, message, time).
- **CustomersPage**: table customer_id (link), name, Money balance; loading/error/empty states.
- **CustomerDetailPage**: `useCustomerBalance(id)` (404 -> NotFound); name from `useCustomers`; balance + updated_at; `useCustomerTransactions(id,page)` with `page` in the URL search param; TransactionTable + Pagination.
- **NotFound**: "Page not found" or `message` prop, link home.

## 7. MSW mocks
- `mocks/store.js`: `createInitialState()` seeds 3 customers (`cust_1..3`, balances like "1500.00") and ~12 transactions across all statuses/types (at least one FAILED with `retry_eligible:true`, one PROCESSING, one RETRY), each with `events`. Exports `store` with `list(filters)`, `get(id)`, `create(body)`, `retry(id)`, `update(id, patch)`, `stats()`, `tick(now=Date.now())`, `reset({autoProgress=true}={})`, `isAutoProgress()`.
- **Auto-progression** (dev realism): each active txn has `_nextAt`. Every handler calls `store.tick()` first; it only acts when `autoProgress` is true: PENDING -> PROCESSING (+1.5s), RETRY -> PROCESSING (+1.5s), PROCESSING -> SUCCESS (+1.5s), or FAILED with `failure_code:'INSUFFICIENT_FUNDS'` when a DEBIT exceeds balance (cents integers). SUCCESS adjusts balance. Each transition appends an event and updates `attempts`/`updated_at`/`processed_at`. Strip `_`-prefixed fields in responses.
- `create`: validate (same rules as `lib/validation.js`, plus customer exists) -> 422; existing id with identical payload -> 200 `{...,created:false}`; different payload -> 409 `IDEMPOTENCY_CONFLICT`; else 202 PENDING `created:true`.
- `retry`: missing -> 404 `NOT_FOUND`; not (FAILED && retry_eligible) -> 409 `NOT_RETRYABLE`; else status PENDING, `manual_retries++`, `retry_eligible:false`, event, 202 full txn. `retry_eligible = status==='FAILED' && manual_retries < 3`.
- Unknown txn/customer on GET -> 404 `NOT_FOUND`.
- `mocks/handlers.js`: `http.*(\`${API_BASE}/...\`)` for all 9 endpoints; errors via `HttpResponse.json({error:{code,message,details}},{status})`; `await delay(150)` only when auto-progress is on (tests stay fast).
- `mocks/browser.js`: `setupWorker(...handlers)`. `mocks/server.js`: `setupServer(...handlers)`.
- **Determinism in tests**: `setup.js` calls `store.reset({autoProgress:false})` in `beforeEach`, so seeded statuses never change by themselves. Tests create transitions explicitly: `store.update(id, {...})` inside a `server.use(...)` override, or a counter-based override (`let n = 0; http.get(url, () => HttpResponse.json(n++ === 0 ? processing : success))`). No fake timers.

## 8. Directory layout
```
txn-frontend/
  index.html  package.json  vite.config.js  .env.example  .env.mocks  README.md
  public/mockServiceWorker.js
  src/
    main.jsx  App.jsx  styles.css
    api/        config.js client.js transactions.js customers.js health.js
    hooks/      queryKeys.js useStats.js useHealth.js useTransactions.js useTransaction.js
                useTransactionFilters.js useCustomers.js (useCustomers, useCustomerBalance, useCustomerTransactions)
                useIdempotencyKey.js useCreateTransaction.js useRetryTransaction.js
    components/ StatusBadge.jsx StatCard.jsx Pagination.jsx FiltersBar.jsx TransactionTable.jsx Money.jsx
                ErrorState.jsx EmptyState.jsx LoadingState.jsx RetryButton.jsx LastUpdated.jsx
                HealthIndicator.jsx NewTransactionForm.jsx Layout.jsx
    pages/      DashboardPage.jsx TransactionDetailPage.jsx CustomersPage.jsx CustomerDetailPage.jsx NotFound.jsx
    lib/        money.js validation.js format.js fieldErrors.js
    mocks/      store.js money.js handlers.js browser.js server.js
    test/       setup.js test-utils.jsx
    __tests__/  (7 files, section 11)
```

## 9. Key decisions
- **ADR-1 Idempotency key in a ref-backed hook, not component state.** No extra renders; rotation rules live in one place and are verifiable via request bodies. Trade-off: key is lost on page reload (acceptable; brief only requires reuse across resubmits).
- **ADR-2 `inFlight` ref in addition to `disabled`.** `disabled` alone races with fast double-clicks before re-render; the ref makes "one request" deterministic.
- **ADR-3 Detail polling via a `refetchInterval` function** on `query.state.data.status` instead of effects/timers; TanStack stops on terminal status and when the tab is hidden.
- **ADR-4 Keep data on background failure** (`isError && data`) instead of replacing the screen; v5 retains `data`, so no extra state.
- **ADR-5 Money as strings end-to-end**, formatted with string ops; `Intl.NumberFormat` string input support varies across runtimes, so avoided. Mocks use integer cents only.
- **ADR-6 MSW store with switchable auto-progression** — realistic in dev, frozen in tests; avoids fake timers fighting MSW/fetch promises.
- **ADR-7 `lib/` folder** added beyond the brief's list for pure helpers, keeping business logic out of components.
- **ADR-8 `.env.mocks` + `--mode mocks`** instead of `VITE_USE_MOCKS=true npm run dev`, for Windows compatibility (README also shows the PowerShell form).

## 10. Implementation plan
| Task | Content | Satisfies | Verify |
|---|---|---|---|
| **T-1** Scaffold + api + mocks | `package.json` (sec. 1), `vite.config.js`, `index.html`, `.env.*`, `public/mockServiceWorker.js`, `main.jsx` (conditional worker), `App.jsx` routes + `Layout` (placeholder pages ok), `styles.css`; `api/*` (sec. 3); `mocks/*` (sec. 7); `hooks/queryKeys.js`; `lib/*`; `src/test/setup.js` | NFR-1, NFR-3, NFR-4, NFR-5 | `npm install`; `npm run dev:mocks` loads; `npm run build` ok; a throwaway smoke test calling `listTransactions()` through MSW passes (catches jsdom/fetch issues early, see sec. 11) |
| **T-2** Hooks + components + Dashboard (no form) | All query hooks, `useTransactionFilters`, `useRetryTransaction`; the 12 shared components; `DashboardPage` with stats, health, filters, table, pagination, all states, LastUpdated, warning banner | FR-1, FR-2, FR-7 (row), FR-9, FR-10, FR-11 | Under mocks: filters update URL, page resets to 1, back/forward works, statuses tick live |
| **T-3** Form + detail page | `useIdempotencyKey`, `useCreateTransaction`, `NewTransactionForm` wired into Dashboard; `TransactionDetailPage` with polling, fields, timeline, retry + 409 stale message | FR-3, FR-4, FR-5, FR-6, FR-7, FR-11 | Create txn under mocks, follow link, watch PENDING -> SUCCESS, polling stops (Network tab); retry a FAILED txn |
| **T-4** Customer pages + NotFound + README | `CustomersPage`, `CustomerDetailPage` (URL `page`), `NotFound` (route + 404 usage); `README.md`: install, env vars, real backend, mocks (`npm run dev:mocks`; PowerShell `$env:VITE_USE_MOCKS="true"; npm run dev`), tests, folder structure, idempotency / polling / stale-state decisions | FR-8, FR-10, NFR-4 | Customers pages work under mocks; `/transactions/nope` and `/customers/nope` show 404 |
| **T-5** Tests | `src/test/test-utils.jsx` + the 7 required test files (sec. 11); delete the T-1 smoke test | Tests 1-7 -> FR-2..FR-7, FR-10 | `npm test` all green; report actual counts |

## 11. Testing strategy
- **`src/test/setup.js`**: `import '@testing-library/jest-dom/vitest'`; if `!globalThis.crypto?.randomUUID`, assign `webcrypto` from `node:crypto`; `beforeAll(() => server.listen({onUnhandledRequest:'error'}))`; `beforeEach(() => store.reset({autoProgress:false}))`; `afterEach(() => { cleanup(); server.resetHandlers(); })`; `afterAll(() => server.close())`.
- **`src/test/test-utils.jsx`**: `renderWithProviders(ui, { route='/', path='*' })` -> fresh `new QueryClient({defaultOptions:{queries:{retry:false, refetchOnWindowFocus:false}, mutations:{retry:false}}})`, `<MemoryRouter initialEntries={[route]}><Routes><Route path={path} element={<>{ui}<LocationDisplay/></>}/></Routes></MemoryRouter>`; `LocationDisplay` renders `location.search` in `data-testid="location"`. Returns RTL result + `user = userEvent.setup()` + `queryClient`.
- **Request assertions**: capture via overrides, e.g. `server.use(http.post(\`${API_BASE}/transactions\`, async ({request}) => { bodies.push(await request.json()); return HttpResponse.json(..., {status:202}) }))`; GET URLs via `new URL(request.url).searchParams`.
- Real timers everywhere; `findBy*(..., {timeout: 4000})` for polling.

| File (`src/__tests__/`) | What |
|---|---|
| `formValidation.test.jsx` | amount `0`, `-5`, `1.234` each show the right inline message; POST counter stays 0 |
| `formSubmit.test.jsx` | handler `await delay(300)`; `user.dblClick(submit)`: button disabled + "Submitting…", exactly 1 body captured, then link with `href="/transactions/<id>"` |
| `formIdempotency.test.jsx` | POST #1 returns `HttpResponse.error()` (-> network message), POST #2 returns 202; `bodies[0].transaction_id === bodies[1].transaction_id`; a following submission uses a different id |
| `formServerErrors.test.jsx` | 422 `details:{fields:{amount:'Exceeds limit'}}` shown next to Amount; 409 `IDEMPOTENCY_CONFLICT` shows the conflict text |
| `transactionTable.test.jsx` | DashboardPage at `/?page=2`: rows render; empty list -> "No transactions match these filters" + Clear filters; 500 -> ErrorState with working Retry; select Status = FAILED -> last GET has `status=FAILED&page=1` and `location` has no `page` |
| `retry.test.jsx` | detail page, seeded FAILED txn: click Retry -> badge shows PENDING (store mutated by real handler); 409 override that also calls `store.update(id,{status:'SUCCESS',retry_eligible:false})` -> "This transaction's status changed" and badge SUCCESS |
| `detailPolling.test.jsx` | counter override: GET #1 PROCESSING, then SUCCESS -> SUCCESS appears with no interaction; plus asserts `detailRefetchInterval` gives 2000 for PROCESSING and `false` for SUCCESS/FAILED (polling stops) |

Run: `npm test` (Vitest run, jsdom). Unit tests of `lib/*` optional if time allows.

**Risk note (jsdom + Node fetch):** if tests fail with "Expected signal to be an instance of AbortSignal" / "signal is not of type AbortSignal" (jsdom's AbortController vs Node's undici fetch), switch `test.environment` to `'happy-dom'` (add `happy-dom@^15` devDep) and record it in the worklog. Do not work around it by removing the timeout from `client.js`.

## 12. Traceability
| Req | Components / modules | Task |
|---|---|---|
| FR-1 | useStats, useHealth, StatCard, HealthIndicator, DashboardPage | T-2 |
| FR-2 | useTransactionFilters, useTransactions, FiltersBar, Pagination, TransactionTable | T-2, T-5 |
| FR-3 | lib/validation, NewTransactionForm | T-1, T-3, T-5 |
| FR-4 | useIdempotencyKey, useCreateTransaction | T-3, T-5 |
| FR-5 | useCreateTransaction, NewTransactionForm, lib/fieldErrors | T-3, T-5 |
| FR-6 | useTransaction (detailRefetchInterval), TransactionDetailPage | T-3, T-5 |
| FR-7 | useRetryTransaction, RetryButton | T-2, T-3, T-5 |
| FR-8 | useCustomers / useCustomerBalance / useCustomerTransactions, customer pages | T-4 |
| FR-9 | query options (sec. 4), LastUpdated, ErrorState banner | T-2 |
| FR-10 | LoadingState, EmptyState, ErrorState, NotFound | T-2, T-4, T-5 |
| FR-11 | labelled inputs, StatusBadge text+glyph, button text | T-2, T-3 |
| NFR-1 | lib/money, mocks/money (integer cents) | T-1 |
| NFR-2 | api/client.js is the sole fetch caller | T-1 (review) |
| NFR-3 | api/client.js timeout + ApiError | T-1 |
| NFR-4 | api/config, main.jsx mocks switch, mocks/* | T-1, T-4 |
| NFR-5 / NFR-6 | stack, a11y rules | all |

Gap flagged: the FR-9 acceptance check ("background refetch failure keeps rows + warning banner") has no required test in the brief. It is covered by the design (sec. 5) and code review; test-engineer may add it to `transactionTable.test.jsx` if time permits.
