# Spike: ASSETS-4065 — TanStack Query for asset loading state (phase 2)

- **Jira:** ASSETS-4065 "TanStackify getAssets to sync/fetchAssets – phase 2"
- **Phase 1:** [MetaMask/core#10230](https://github.com/MetaMask/core/pull/10230) (transient per-account `assetsLoadingStatus` + `@trackAssetsLoading`)
- **Type:** Investigation and feasibility check (no production change)
- **Code read:** `MetaMask/core` @ `bacfa406df` and `MetaMask/metamask-extension` @ `dc37eb38cd` (`main`, 2026-10-27). Line numbers below refer to these commits.
- **Prototype:** `packages/react-data-query/src/spike-assets-4065.test.ts`. This is a throwaway test and should not be merged. Run it with
  `yarn workspace @metamask/react-data-query run test run src/spike-assets-4065.test.ts --coverage.enabled=false`

## TL;DR

| Question                                                                                                                                        | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is it possible to sync background asset loading state to the UI with TanStack/React Query and `BaseDataService`?                                | **Yes, technically.** Both sides of the plumbing already ship. Core has `BaseDataService` and `@metamask/react-data-query`. The extension has a UI `QueryClient` bridged over the port for the Money services.                                                                                                                                                                                                                                                                                                                                    |
| Is it sensible to use the existing data-service bridge (UI `useQuery` + background `cacheUpdated` hydration) for asset **loading/error** state? | **No, not as the sync mechanism.** TanStack's `hydrate()` deliberately drops `fetchStatus`, and it ignores error states unless `dataUpdatedAt` is newer. `Error` objects also serialize to `{}`. As a result, background-initiated fetches never show as fetching in the UI, and background refetch failures never show as errors. Almost every `getAssets` call is background-initiated. The prototype demonstrates all three behaviors.                                                                                                         |
| What should we do instead?                                                                                                                      | **Keep the background as the source of truth and publish loading and error state through `AssetsController` state**, as Phase 1 already does. Fix the gaps Phase 1 leaves: the slow pipeline is untracked, per-chain errors are dropped, and later refreshes aren't tracked. TanStack `query-core` can still be used _inside_ the background to dedupe and cache fetches, with its status _projected_ into controller state. React Query in the UI fits only narrowly, for user-triggered refreshes where component-local `isFetching` is wanted. |

**Verdict:** It's feasible. Building it as "make `getAssets` a TanStack query and observe it from the UI" isn't sensible. The recommendation is option (a) below, which background-owned status published in controller state. TanStack is an optional implementation detail behind it, not the transport.

---

## 1. What exists today

### 1.1 `BaseDataService` (core)

`packages/base-data-service/src/BaseDataService.ts`

- Each service owns a private `QueryClient`. The defaults are `retry: false` and a one-minute `staleTime` (`BaseDataService.ts:136-145`). Construction happens at `:240-252`.
- Requests run only through the protected `fetchQuery` / `fetchInfiniteQuery` / `executeMutation` methods, wrapped in the `createServicePolicy` retry and circuit breaker (`:326-355`, `:366-450`, `:467-524`). **Query state such as `isFetching` or `status` isn't exposed as an API.** The only public action is `:invalidateQueries` (`:311-314`).
- State is observable only through events. The service subscribes to its own `QueryCache` and `MutationCache` (`:276-309`). For every `added`, `updated` or `removed` it publishes `${name}:cacheUpdated` and `${name}:cacheUpdated:${queryHash}`, carrying a `dehydrate()`d snapshot of that one query (`:595-629`). The snapshot is not filtered by status, so `pending` and `error` states _are_ published, together with their `fetchStatus`.
- Persistence through `StorageService` is optional and persists only `status === 'success'` queries (`:636-662`). It's rehydrated on `init()` (`:561-566`, `:670-697`).

Current subclasses include `money-account-balance-service`, `money-account-api-data-service`, `chomp-api-service`, `sentinel-api-service`, `authenticated-user-storage`, `SubscriptionService`, `ClaimsService`, `KycService`, `SocialService`, `ProfileService`, `shield-api-service`, and the `sample-gas-prices-service` sample. **No assets code uses `BaseDataService`.**

### 1.2 `@metamask/react-data-query` (core)

`packages/react-data-query/src/createUIQueryClient.ts`

- `createUIQueryClient(dataServices, messengerAdapter)` creates a UI-side `QueryClient`. Its default `queryFn` turns the query key `['Service:action', ...params]` into `messenger.call('Service:action', ...params)` (`:193-210`).
- When a query gets its first observer, the client subscribes to `Service:cacheUpdated:${hash}` and calls `hydrate(client, payload.state)` on each update (`:220-269`). It unsubscribes when the last observer goes away.
- `invalidateQueries` is overridden to invalidate the background service too (`:356-379`).
- The hooks (`hooks.ts:29-32`) force `staleTime: 0` and `retry: false` in the UI, so the background cache decides freshness.

### 1.3 `core-backend`

`ApiPlatformClient` / `BaseApiClient` (`packages/core-backend/src/api/base-client.ts:86-99` and `ApiPlatformClient.ts:96-118`) has its **own** private `QueryClient`. It's used for HTTP caching, dedupe, retries, and auth-token dedupe. The client exposes `isFetching(queryKey)` (`ApiPlatformClient.ts:166-167`), but it publishes **nothing** on the messenger. It isn't a `BaseDataService`. `assets-controller` already uses it through `PriceDataSource`, `RpcDataSource` (token detection) and `AccountsApiDataSource`. So assets HTTP calls are already TanStack-cached, but that cache isn't observable outside the background.

### 1.4 `AssetsController` loading state (Phase 1, core)

- `assetsLoadingStatus?: Record<AccountId, 'loading' | 'loaded'>` lives in state as `persist: false, usedInUi: true` (`types.ts:418`, `:501` and `AssetsController.ts:490-495`).
- `@trackAssetsLoading` wraps `getAssets` (`AssetsController.ts:1594`; implementation in `trackAssetsLoading.ts:55-82`). On `forceUpdate: true`, accounts with no status yet go to `loading` and then to `loaded` in a `finally`, whether the call succeeded or failed. After that they are never re-marked.
- Selectors live in `selectors/loading.ts`: `getAccountLoadingStatus`, `isAccountLoading`, `getAccountGroupLoadingStatus`, `isAccountGroupLoading`, and `getIsAssetsLoadingForSelectedAccountGroup`.

There are three gaps in Phase 1 that matter for phase 2:

1. **The slow pipeline is untracked.** `getAssets` awaits only the fast pipeline (Accounts API, token, price). `#runBackgroundFetch`, which covers RPC and Snaps for chains not served by the Accounts API or that failed there, is fire-and-forget (`AssetsController.ts:1780`, `:1825`, `:1932-1980`). Its failures are only logged (`:1979`). The status therefore flips to `loaded` while non-Accounts-API chains, such as Snap chains and RPC-only networks, are still loading.
2. **`DataResponse.errors` never reaches state.** Per-chain errors are typed as `Record<ChainId, string>` (`types.ts:386`). They're produced by the data sources (`AccountsApiDataSource.ts:465-467`, `:541-546`, `:585-586`; `RpcDataSource.ts:1606-1608`) and consumed internally for RPC fallback and slow-pipeline chain selection (`RpcFallbackMiddleware.ts`, `AssetsController.ts:2830-2847`). `#updateState` (`:2962`) ignores them. The UI can't tell "loaded with zero balance" apart from "failed".
3. **Only the first load is tracked.** Refreshes from unlock, account switch, transaction confirmation (`:1369`), and network changes aren't visible. This is intentional in Phase 1, but it limits what the UI can show.

`getAssets` callers are almost all **background-initiated**: startup and unlock (`#runStartupRefresh`, `:1467-1472`, triggered at `:3473`), account-switch queues, transaction events (`:1369`), and chain-support changes (`:2394`, `:2499`, `:3991`, `:4048`, `:4153`, `:4172`, `:4199`). The only UI-initiated caller found in the extension is `useFreshTronAssets` (`ui/pages/asset/hooks/useFreshTronAssets.ts:60-65`).

### 1.5 Extension UI

- React Query is used in production. `ui/contexts/query-client.ts:17-40` builds `createUIQueryClient(DATA_SERVICES, adapter)`. The adapter uses `submitRequestToBackground('messengerCall', …)` and `subscribeToMessengerEvent`. `ui/pages/index.js:47-62` mounts the `QueryClientProvider`. The extension is pinned to `@metamask/react-data-query@1.0.0`, while core is at `2.0.0` with unreleased mutation support. The hydration behavior described here comes from TanStack and is the same in both versions.
- `DATA_SERVICES` contains only `MoneyAccountBalanceService` and `MoneyAccountApiDataService` (`shared/constants/data-services.ts:8-11`). About fifty other UI hooks (ramps, discover search, token-asset, activity, notifications) use plain `@tanstack/react-query` with their own `queryFn`s.
- The bridge works like this. `messengerCall` exposes every root-messenger action (`app/scripts/metamask-controller.js:4813-4814`). `MessengerSubscriptions` keeps a separate instance per UI connection and writes each event as a JSON-RPC notification on the port stream (`app/scripts/lib/MessengerSubscriptions.ts:29-51`; constructed per connection at `metamask-controller.js:4700`). On the UI side the notification is routed by `ui/store/background-connection.ts:111-135`, which swallows callback errors with `console.error`.
- There are already serialization workarounds in the code: event args arrive as an array and must be unwrapped (`ui/contexts/query-client.ts:21-29`), and omitted args arrive as `null`, so `invalidateQueries` must pass an explicit `{}` (`ui/helpers/money/invalidate-balance-caches.ts:33-45`).
- Assets loading state reaches the UI through **controller state and Redux**, not React Query. Flow: `state.metamask.assetsLoadingStatus` → `getAssetsLoadingStatus` (`ui/selectors/assets.ts:275-279`) → `selectIsAssetsLoadingForSelectedAccountGroup` (`:1360-1367`, wrapping the core selector) → consumers in `coin-overview.tsx:245-246,330`, `account-group-balance.tsx:64-65,176` and `token-list.tsx:185-186,268-273`.

---

## 2. What the prototype proved

All five cases in `spike-assets-4065.test.ts` pass. The adapter **JSON round-trips** every argument, result, rejection and event payload, and it swallows listener exceptions the same way the extension's notification router does.

| #   | Case                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The UI starts the fetch (`useQuery` → `messengerCall`)                               | ✅ The UI sees `fetchStatus: 'fetching'` and `isLoading`. A rejection gives `status: 'error'` with the message intact.                                                                                                                                                                                                                                                                      |
| 2   | The background starts the fetch while the UI is observing (e.g. startup or unlock)   | ❌ The background publishes `fetchStatus: 'fetching'`, but `hydrate()` strips it (`@tanstack/query-core/src/hydration.ts:319-322`; it also forces `idle` for new queries at `:352-359`). **The UI stays `idle`.** Data does arrive on success. No in-flight `promise` is dehydrated, because the `fetch` cache event fires before the retryer exists, so nothing non-JSON crosses the port. |
| 3   | A background refetch fails after an earlier success                                  | ❌ `hydrate()` updates an existing query only when `dataUpdatedAt` is newer (`hydration.ts:311-341`). Errors don't bump it, so the **UI stays `success` with `error: null`**. Even when the error is sent, a JSON-serialized `Error` is `{}`.                                                                                                                                               |
| 4   | Some chains fail inside one `getAssets`                                              | ⚠️ The query is `success` and the failures live only in `data.errors`. Query-level `status` can't express partial failure unless keys are split per chain.                                                                                                                                                                                                                                  |
| 5   | Option (a): project a background `QueryClient`'s status into JSON "controller state" | ✅ This captures `pending/fetching`, then `error` with the message. It's JSON-safe and fits patches.                                                                                                                                                                                                                                                                                        |

---

## 3. Design options

### (a) The background owns the status and publishes it through controller state _(recommended)_

The `AssetsController`, optionally with a `query-core` `QueryClient` inside it, keeps per-account and per-chain fetch status in non-persisted state. The UI reads it with Redux selectors, as Phase 1 already does.

- **Correctness:** This is the only option that covers background-initiated fetches, the slow pipeline, and per-chain partial failure, which is most of what users see.
- **Multiple windows:** Every UI connection already receives state patches, so all windows agree.
- **Staleness and duplicates:** There's one fetch in the background no matter how many windows are open. Dedupe can be added with an in-flight map or `QueryClient.fetchQuery` keyed by `(accountIds, chainIds)`.
- **Serialization:** Only plain strings and enums are stored. Errors become `string` messages, as `DataResponse.errors` already is.
- **Perf:** This adds one or two extra `update()`s per pipeline stage, and patches are already batched. Keep updates at stage granularity, not per data source.
- **Migration:** Small. It extends Phase 1, keeps the existing selectors, and is additive (no breaking changes).
- **Cost:** It doesn't give TanStack ergonomics (`isFetching`, `refetch`) for free in components. That needs a small hook over the selectors.

### (b) UI-side React Query whose `queryFn` calls a background action

Example: `useQuery({ queryKey: ['assets', accountIds, chainIds], queryFn: () => messengerCall('AssetsController:getAssets', …, { forceUpdate: true }) })`, using plain `@tanstack/react-query`. `AssetsController` isn't in `DATA_SERVICES` and shouldn't be.

- **Correctness:** Accurate only for that component's own call (prototype case 1). It's blind to background refreshes. `getAssets` resolves before the slow pipeline finishes and doesn't reject on per-chain failure, so `isSuccess` would be misleading.
- **Duplicates:** Each window and each mounted hook triggers its own `forceUpdate`. It races with background refreshes, because `getAssets` has no general in-flight dedupe. Only startup is serialized, by `#accountRefreshMutex`.
- **Data:** The result duplicates data that already lives in Redux (controller state), which gives two sources of truth.
- **Fit:** Good **only** for explicit user actions, such as pull-to-refresh, "retry this chain", or the Tron asset page refresh (`useFreshTronAssets`), where local `isFetching` and `error` are wanted. In those cases it works better as `useMutation`.

### (c) Mirror or dehydrate a `QueryClient` cache across the bridge (`BaseDataService` + `createUIQueryClient`)

This would make `getAssets`, or a new `AssetsDataService`, a `BaseDataService` query, add it to `DATA_SERVICES`, and have the UI `useQuery` it.

- **Correctness:** Broken for loading and error (prototype cases 2 and 3) without changes to `react-data-query`.
- **Fit:** `getAssets` isn't an endpoint. It's a multi-source pipeline (Accounts API v5/v6, RPC, Snaps, token, price, middlewares) that writes normalized controller state. Data-service guidelines expect one method per endpoint, and `AssetsController` is a stateful controller.
- **Perf:** Every cache update sends the **full dehydrated data** for that query over the port, _on top of_ the state patches that already carry the same balances. Keys per account × chain multiply `messengerSubscribe` round-trips (one per observed query hash, see `createUIQueryClient.ts:233-251`). This option also creates a third copy of the balances: controller state, the background query cache, and the UI query cache. A fourth copy appears if `StorageService` persistence is turned on.
- **Migration:** Large. It needs a new service, new keys, `react-data-query` changes, and UI rewrites away from Redux selectors that already work.
- **Where it _would_ make sense:** New, endpoint-shaped, UI-driven reads that don't need to land in controller state, such as token details pages or search. The extension already uses it for those cases.

### Comparison

|                                      | (a) controller state  | (b) UI query → action           | (c) hydrated cache                        |
| ------------------------------------ | --------------------- | ------------------------------- | ----------------------------------------- |
| Background-initiated loading visible | ✅                    | ❌                              | ❌ (`fetchStatus` dropped)                |
| Background errors visible            | ✅ (as strings)       | ❌                              | ❌ (not applied, serialized as `{}`)      |
| Per-chain partial failure            | ✅ (keyed by chain)   | ⚠️ (in data only)               | ⚠️ (in data only)                         |
| Slow pipeline (RPC/Snaps)            | ✅ (once tracked)     | ❌ (`getAssets` resolves early) | ❌                                        |
| Multiple UI windows consistent       | ✅ (patches)          | ❌ (per-window clients)         | ✅ data, ❌ status                        |
| Duplicate requests                   | Lowest (single owner) | Highest                         | Low (background dedupes)                  |
| Port payload                         | Small status patches  | Full assets result per call     | Full dehydrated data per update + patches |
| Fits Phase 1 selectors               | ✅ (extends them)     | ❌ (parallel path)              | ❌ (parallel path)                        |
| Effort                               | S–M                   | S                               | L                                         |

---

## 4. Blockers and risks

1. **`hydrate()` semantics are a hard blocker for (c).** This is by design in TanStack, not a bug. `fetchStatus` is stripped, and an error isn't applied without newer data. Fixing it would need `react-data-query` to bypass `hydrate` for status, for example `query.setState({ fetchStatus, error, errorUpdatedAt, status })` when `errorUpdatedAt` or `fetchStatus` change. That's a platform change owned by the data-services maintainers and affects every data service.
2. **Serialization over the port.** Everything is JSON. `Error` becomes `{}` (proved). `undefined` args arrive as `null` (existing extension workaround). Event payloads arrive as arrays (existing workaround). Status therefore has to be plain strings and enums. Dehydrated promises are _not_ a problem in practice (proved).
3. **Multiple UI windows.** Popup, full-screen tab and side panel each have their own UI `QueryClient` and `MessengerSubscriptions`. Option (b) multiplies forced fetches. Options (a) and (c) are consistent through the single background.
4. **MV3 service worker restarts.** The background `QueryClient`s are in memory. A `BaseDataService` keeps only `success` queries, and only if persistence is configured. `assetsLoadingStatus` is `persist: false`, so after a restart the startup refresh marks accounts `loading` again even though persisted balances exist. That's acceptable today because `token-list.tsx:268-273` only shows skeletons while just native/mUSD rows exist. Keep any new status `persist: false`. The UI builds the port once per page (`app/scripts/ui.ts:137-152`), and I found no in-page reconnect path. If one is ever added, note that `createUIQueryClient` keeps its own subscription map (`createUIQueryClient.ts:85-88`) while `setBackgroundConnection` clears the transport's map (`background-connection.ts:146-152`). Subscriptions would then go stale silently.
5. **Controller state persistence and size.** Per-chain status must be bounded: the selected accounts × enabled chains. Prune it on account removal and chain disable, like `assetsLoadingStatus`. Exclude it from persistence, and decide whether to include it in state logs (Phase 1 sets `includeInStateLogs: true`).
6. **Semantics of "loaded".** Phase 1 settles to `loaded` even on failure, and the UI relies on that to stop skeletons (`token-list.tsx` comment). A new `error` status must not reintroduce endless skeletons. Keep "first load settled" and "last fetch had errors" as separate fields.

---

## 5. Recommendation

1. **Don't "TanStackify" `getAssets` as a cross-bridge query.** Keep `AssetsController` state as the single source of truth for asset data _and_ fetch status. This extends Phase 1.
2. **Make the background status complete:** track the slow pipeline, store per-chain errors from the final `DataResponse.errors` (after RPC fallback), and optionally track a separate refresh flag beyond the first load.
3. **Use TanStack `query-core` only where it earns its place:** dedupe concurrent `forceUpdate` fetches in the background. The `ApiPlatformClient` `QueryClient` already dedupes HTTP calls, so measure first. A small in-flight promise map may be enough.
4. **Use UI React Query narrowly:** a `useRefreshAssets` mutation for user-initiated refresh or retry, so components get local `isPending` and `error`. Background-driven loading still comes from selectors.
5. **Optional platform follow-up, outside Assets:** if Wallet Framework wants data services in general to expose background-initiated `fetchStatus` and errors to the UI, change `react-data-query` and `BaseDataService` (serialize errors, apply status updates outside `hydrate`). Prototype cases 2 and 3 are ready-made regression tests for that.

---

## 6. Phased plan (ticket-sized)

### Phase 2a: core (`@metamask/assets-controller`)

1. **Track the slow pipeline in the loading status.** Make `#runBackgroundFetch` return its promise (still not awaited by `getAssets`). Have the tracker settle `loaded` only after both the fast and slow stages, with a timeout guard. `getAssets` latency must not change. Tests: `trackAssetsLoading.test.ts` and the controller lifecycle tests. _Additive, not breaking._
2. **Expose per-chain fetch errors.** Add a non-persisted field, for example `assetsFetchErrors?: Record<AccountId, Record<ChainId, { message: string; updatedAt: number }>>`, written in `#updateState` from the final `DataResponse.errors`. Clear an entry when a later response covers that chain. Add selectors such as `getChainErrorsForAccountGroup` and `hasPartialFailureForSelectedAccountGroup`. _Additive._
3. **Optional refresh flag.** Add `isRefreshing` per account, for any `forceUpdate` and not only the first load, kept separate from `assetsLoadingStatus` so Phase 1 semantics stay the same. Gate it behind UX demand.
4. **Dedupe concurrent forced fetches.** Coalesce identical `(accounts, chains, bypassServerCache)` force-updates that are in flight, with an in-flight map or a `query-core` `QueryClient.fetchQuery` with `staleTime: 0`. First add a metric or trace to measure how often UI and background calls overlap.
5. **Changelog and README** for 1–4, plus pruning on account removal and chain disable.

### Phase 2b: extension

6. Bump `@metamask/assets-controller`. Add Redux selectors wrapping the new core selectors in `ui/selectors/assets.ts`. Add a "some networks failed to load — retry" affordance next to `account-group-balance` and `token-list`.
7. Add a `useRefreshAssets` hook. It's a plain `@tanstack/react-query` `useMutation` calling `AssetsController:getAssets` with `forceUpdate` (not added to `DATA_SERVICES`). Migrate `useFreshTronAssets` to it and wire per-chain retry from item 6.
8. QA matrix: popup, full-screen and side panel open at the same time; service worker killed during startup refresh; offline and Accounts API 5xx; RPC-only chain; Snap chain.

### Phase 3: platform (optional, Wallet Framework or data-services owners)

9. Make `react-data-query` propagate `fetchStatus` and `error` for background-initiated fetches. Apply status-only updates with `setState` instead of `hydrate`, and serialize errors as `{ name, message }`. This could optionally live in `BaseDataService` through the `dehydrate` option `shouldRedactErrors` plus a custom error shape. Use prototype cases 2 and 3 as regression tests.
10. Revisit (c) for **endpoint-shaped** asset reads that don't need controller state, such as token detail and market data. Don't revisit it for the balances pipeline.

---

## 7. References

**core** (`bacfa406df`)

- `packages/base-data-service/src/BaseDataService.ts:136-145, 240-314, 326-355, 595-629, 636-697`
- `packages/react-data-query/src/createUIQueryClient.ts:85-88, 193-210, 220-269, 356-379`
- `packages/react-data-query/src/hooks.ts:29-32`
- `node_modules/@tanstack/query-core/src/hydration.ts:311-341, 343-371` (v5.103.2)
- `packages/core-backend/src/api/base-client.ts:86-99`; `packages/core-backend/src/api/ApiPlatformClient.ts:96-118, 166-167`
- `packages/assets-controller/src/AssetsController.ts:209-226, 452-495, 1369, 1467-1480, 1594-1634, 1747-1832, 1932-1980, 2830-2847, 2962, 3473`
- `packages/assets-controller/src/trackAssetsLoading.ts:55-82`
- `packages/assets-controller/src/selectors/loading.ts`
- `packages/assets-controller/src/types.ts:378-400, 418, 488-502`
- `packages/assets-controller/src/data-sources/AccountsApiDataSource.ts:465-467, 541-546, 585-586`; `RpcDataSource.ts:1606-1608`

**metamask-extension** (`dc37eb38cd`)

- `ui/contexts/query-client.ts:17-40`; `shared/constants/data-services.ts:8-11`; `ui/pages/index.js:47-62`
- `ui/store/background-connection.ts:111-135, 146-152, 177-234`
- `app/scripts/lib/MessengerSubscriptions.ts:29-51`; `app/scripts/metamask-controller.js:4700, 4807-4814`; `app/scripts/ui.ts:137-152`
- `ui/selectors/assets.ts:275-279, 1360-1367`; `shared/types/background.ts:86`
- `ui/components/app/wallet-overview/coin-overview.tsx:245-246, 330`; `ui/components/app/assets/account-group-balance/account-group-balance.tsx:64-65, 176`; `ui/components/app/assets/token-list/token-list.tsx:185-186, 268-273`
- `ui/pages/asset/hooks/useFreshTronAssets.ts:60-65`; `ui/helpers/money/invalidate-balance-caches.ts:33-45`
