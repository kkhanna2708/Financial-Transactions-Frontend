# txn-frontend

React operational dashboard for a transaction-processing backend: view/create transactions, monitor status
transitions, retry failed ones, and browse customers/balances. See `docs/brief.md`, `docs/requirements.md`,
`docs/architecture.md` for the full contract and design.

## Install

```
npm install
```

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL of the real backend API. |
| `VITE_USE_MOCKS` | `false` | When `true`, requests are served by an in-browser MSW worker instead of the real backend. |

`.env.example` documents both; `.env.mocks` sets `VITE_USE_MOCKS=true` for the mocked dev script.

## Run against the real backend

Start the backend (default `http://localhost:8000`), then:

```
npm run dev
```

If your backend runs elsewhere, set `VITE_API_BASE_URL` first, e.g. in PowerShell:

```
$env:VITE_API_BASE_URL="http://localhost:9000"; npm run dev
```

Dev server runs on **port 5173** (`http://localhost:5173`).

## Run with MSW mocks (no backend needed)

```
npm run dev:mocks
```

This runs Vite with `--mode mocks`, which loads `.env.mocks` (`VITE_USE_MOCKS=true`). All 9 endpoints are served
from an in-memory store (`src/mocks/store.js`) seeded with 3 customers and 12 transactions across every
status/type. In dev mode the store auto-progresses active transactions (PENDING → PROCESSING → SUCCESS/FAILED,
RETRY → PROCESSING → …) on a timer, so the dashboard/detail pages show live status changes without any backend.

Equivalent on Windows PowerShell without the mode file:

```
$env:VITE_USE_MOCKS="true"; npm run dev
```

## Run tests

```
npm test
```

Runs the Vitest suite once (jsdom environment, MSW mocking the network layer — no real backend or browser
worker needed). Use `npm run test:watch` for watch mode.

## Build

```
npm run build
```

Outputs to `dist/` (not checked in).

## Folder structure

```
src/
  api/        fetch layer — client.js (timeout + ApiError), one file per resource
  hooks/      TanStack Query hooks — all server state, query keys, polling, mutations
  components/ presentational components (Money, StatusBadge, TransactionTable, ...)
  pages/      route-level composition of hooks + components
  lib/        pure helpers (money formatting, validation, dates, 422 field-error mapping) — no React
  mocks/      MSW store + handlers, shared by the browser worker (dev) and the Node server (tests)
  test/       Vitest setup + shared render helper
  __tests__/  the required test suite
```

Pages never call `fetch` or `api/*` directly — they only call hooks; hooks are the only code that imports
`api/*`, and `api/client.js` is the only place that calls `fetch`.

## State-handling decisions

- **Idempotency key reuse.** `useIdempotencyKey` generates a `transaction_id` via `crypto.randomUUID()` on the
  form's first edit (`touch()`) and holds it in a `useRef` (not component state, so it doesn't trigger renders).
  `useCreateTransaction` keeps the same key across resubmits when the previous attempt's outcome is unknown
  (network error/timeout, or a 5xx) — the backend dedupes a retry with the same id. It rotates to a fresh key
  after any outcome that is known and terminal for that id: success (202 or 200 `created:false`), a 409
  conflict, a 422 validation error, or any other 4xx — since the server has already rejected/accepted that
  id+payload pair, reusing it again would either be a no-op or a spurious conflict. An additional `inFlight` ref
  guarantees exactly one in-flight request even if the submit button is double-clicked before React re-renders
  the `disabled` state.
- **Polling strategy.** The transaction detail page polls every 2s via TanStack Query's `refetchInterval`
  computed from the query's own cached data (`detailRefetchInterval`): active while status is
  `PENDING`/`PROCESSING`/`RETRY`, `false` (polling stops) once the transaction reaches `SUCCESS`/`FAILED`.
  Stats, the transactions table, customer balance, and customer transaction history all refetch every 3s
  (`refetchIntervalInBackground: false`, so polling pauses when the tab isn't visible) plus on window focus.
  Health polls every 10s with `retry: false` so an unreachable backend surfaces quickly as "unreachable" rather
  than retrying silently.
- **Stale-state (409) handling.** Retrying a transaction whose state has already changed server-side (e.g.
  another actor retried it first, or it's no longer `FAILED`) returns `409 NOT_RETRYABLE`. The UI shows "This
  transaction's status changed" next to the Retry button/row and immediately invalidates the transaction detail,
  transaction lists, and stats queries so the screen refetches and reflects the real current state rather than
  the stale one the user was looking at. Creating a transaction with a reused id but a different payload
  similarly returns `409 IDEMPOTENCY_CONFLICT`, shown as a form-level "submit again" error, and rotates the
  idempotency key so the next attempt uses a fresh id.
- **Background refetch failures.** TanStack Query v5 keeps the last successful `data` in cache when a
  background refetch fails, so a section never has to fall back to a blank/loading screen just because one poll
  failed. Every data section (stats, transaction table, customer balance, customer history) checks
  `isError && data !== undefined` and, in that case, keeps rendering the last known rows/values while also
  showing an `ErrorState variant="banner"` ("Showing last known data — refresh failed: …", `role="alert"`) with
  a manual Retry button. Only when there is *no* cached data yet (`isError && data === undefined`) does the
  section render the full error/404 state instead of the content.
- **`keepPreviousData`.** The transaction table and the customer transaction history both pass
  `placeholderData: keepPreviousData` to their list queries, so changing the page number keeps the previous
  page's rows on screen (no loading flash) until the new page resolves; pagination controls stay responsive.
- **Money as strings.** All amounts/balances are strings end-to-end (`"100.00"`) and are only ever formatted for
  display via `lib/money.js` string manipulation (`formatMoney`) — never parsed with `Number()`/`parseFloat` or
  passed through `Intl.NumberFormat`. The MSW mock store does the same for its internal balance arithmetic,
  using integer-cents helpers (`mocks/money.js`) instead of floating point.

## Known environment workaround

On Node versions where `node:util`'s `styleText` export is missing (this project was built against Node
21.6.1), `npx msw init public --save` fails inside one of its transitive CLI dependencies. `public/mockServiceWorker.js`
was instead copied directly from `node_modules/msw/lib/mockServiceWorker.js`, which is functionally identical
to what the CLI generates (same `PACKAGE_VERSION`/`INTEGRITY_CHECKSUM`, baked into the shipped file). If you
upgrade the `msw` package, rerun `npx msw init public --save` once on a Node version ≥ 21.7 (or 22+) to
regenerate the worker file for real.
