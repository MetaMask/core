# Perps static review ledger

## Setup

- Request: validate the fix for two Bugbot findings on PR #11461
  (https://github.com/MetaMask/core/pull/11461#discussion_r4594856123 — HIP-3 outage blocks
  main-DEX cancels; #discussion_r4594856130 — direct cancel throws instead of reporting).
- Repository/client: MetaMask/core (`packages/perps-controller` only).
- Base: `706991b804715dce34b04a1cad166d6d020130e7` (branch `TAT-4392-exchange-each-its-own`).
- Head: working-tree diff on top of base (uncommitted fix).
- Criteria: `perps-review-pr` shared checklist + `references/core.md` overlay. Static review
  only; no tests executed by the reviewer process itself (runtime evidence recorded from the
  authoring session, labeled as such).
- Changed files: `src/providers/HyperLiquidProvider.ts`, `src/providers/AggregatedPerpsProvider.ts`,
  `src/services/TradingService.ts`, `src/types/index.ts` (doc comment only), `CHANGELOG.md`,
  `tests/src/providers/AggregatedPerpsProvider.discovery.test.ts`,
  `tests/src/providers/HyperLiquidProvider.history.test.ts`.
- Affected callers traced: `PerpsController.cancelOrders` → `TradingService.cancelOrders` →
  `context.getOpenOrders` (aggregated or direct provider) → venue `getOpenOrders` strict path;
  `AggregatedPerpsProvider.getOpenOrders` (strict and lenient); HyperLiquid multi-DEX strict reads.
- Test evidence: authoring session executed
  `yarn workspace @metamask/perps-controller run test` — 140 files / 7514 passed / 40 skipped,
  0 type errors; the three new tests failed before the fix and pass after (TDD sequence);
  package build passed; `oxlint` clean on changed files; `oxfmt --check` clean;
  `yarn changelog:validate` passed.

## Shared criteria ledger

| Family | Rule | Outcome | Evidence |
|---|---|---|---|
| Blocking checks | Confirmed anti-patterns | PASS | No anti-pattern confirmed; two nits recorded (HL-1, TS-1 below). |
| Controller Portability | Platform import in controller | PASS | Diff adds no `react-native`/`Engine`/`Sentry`/host-globals imports; only `OrderDiscoveryError` from `../errors.js`. |
| Controller Portability | Deep import from app code | NOT_APPLICABLE | No app (client) files changed. |
| Controller Portability | New dependency not in DI interface | PASS | No new capability reaches outside `PerpsPlatformDependencies`. |
| Controller Portability | Publisher contract break | PASS | `CancelOrdersResult`, `GetOrdersParams`, `Order` shapes unchanged; `OrderDiscoveryError` was already exported. `GetOrdersParams` doc comment updated to match behavior; no signature change. |
| Perps Math Comes From the Controller | Client-side trading math / duplicated logic | NOT_APPLICABLE | No math or client files touched. |
| Shared Formatting & Display Precision | Local formatter copy / precision / Intl | NOT_APPLICABLE | No display formatting touched. |
| Missing numeric data stays undefined | Zero-for-missing / placeholder in numeric state | NOT_APPLICABLE | No numeric conversion added; orders list handling only. |
| Magic Strings, Magic Numbers & Placeholder Values | Inline literals | PASS | `providerId: 'hyperliquid'` is the venue's own identity typed against `PerpsProviderType`, consistent with existing usage in the same file (`this.protocolId`). No timing/precision/URL literals added. |
| Protocol Abstraction | Execution identity inferred from display fields | PASS | Order identity (`orderId`, `providerId`) preserved through the new partial-order paths; no dedup or snapshot logic touched. |
| Protocol Abstraction | Entity ownership lost in transit | PASS | Aggregated merge tags each recovered order with the owning venue's `providerId` before reporting (mirrors the fulfilled path); `TradingService` failure mapping matches scoped targets by `providerId` unchanged. |
| Protocol Abstraction | Hardcoded provider / capability in client code | NOT_APPLICABLE | No client code changed. |
| Protocol Abstraction | Provider-specific error handling | PASS | `TradingService` now handles both `OrderDiscoveryError` and any other discovery error uniformly for every provider (aggregated and direct venues); no provider-literal branching. `result.error` is message prose assembled at the controller boundary, as before. |
| Protocol Abstraction | Hardcoded market symbols | PASS (nit) | Test fixture uses `BTC`/`xyz:STOCK1` literals, consistent with every sibling fixture in the same suite; no production literal added. |
| Protocol Abstraction | Executable precision / detailedOrderType in UI | NOT_APPLICABLE | No submission, rounding or UI rendering touched. |
| Pro Mode UI Gating | Single-gate assumption | NOT_APPLICABLE | No UI. |
| MetaMetrics Events | Event/property changes | NOT_APPLICABLE | No analytics events touched; existing `trackPerpsEvent` calls unchanged. |
| Sentry Tracing | Unbounded background trace volume | PASS | No new traces or spans; the existing `PerpsTraceNames.CancelOrder` trace still ends on the structured-failure path (return flows through `withStreamPause` like any result). |
| Connection & WebSocket Architecture | Cleanup/ownership, leaks, stale reads | PASS | The structured-failure `return` is inside the `withStreamPause` operation callback, so the orders-stream pause still resolves and resumes; no stream or subscription leak introduced. |
| Data Flow & State | Context loss / late defaults / mutation locks | NOT_APPLICABLE | No account/provider/network state, balances or locks touched. |
| Trade Flow & Order Execution | Numeric meaning in transit | PASS | No unit/price-source/sign transformations added; partial orders reuse the same `adaptOrderFromSDK` adapter as the success path. |
| Trade Flow & Order Execution | Pre-trade checks / post-trade refresh / slippage | PASS (nit) | Cancel flow's refresh and per-item branch unchanged. Nit TS-1: a total discovery failure returns before the batch-failure `logger.error` summary, so it is visible only through the returned `error`/`failureCount` (same visibility as any empty-selection early return). |
| Test Layer Coverage | Degenerate fixtures / assertion quality | PASS | New HyperLiquid fixture is non-degenerate (main DEX healthy, `xyz` DEX failing; distinct symbols `BTC` vs `xyz:STOCK1`); aggregate test exercises two venues with distinct failures; TradingService test asserts the exact structured result. All three were verified to fail before the fix and pass after (authoring session execution). |
| Test Layer Coverage | Clock control / assertion mechanism | NOT_APPLICABLE | No timers or component rendering touched. |
| Embedded Signer Boundaries | Key material handling | NOT_APPLICABLE | No signer or transport change. |

## Core overlay ledger (`references/core.md`)

| Rule | Outcome | Evidence |
|---|---|---|
| Public controller contracts versioned and migration-aware | PASS | No type/signature/event changes; behavior of strict reads is richer (partial orders now carried in `OrderDiscoveryError`), backward compatible for existing `catch` consumers since the exported error type is unchanged. Package-level tests cover the new behavior. |
| Package release metadata matches contract impact | PASS | Changelog entries added under Unreleased → Fixed describing both behavior changes with the PR link; `yarn changelog:validate` passes. Behavior fix, no API break → patch/minor semantics unchanged. |
| HyperLiquid multi-sig account handling | NOT_APPLICABLE | `getOpenOrders` is a read; no exchange write added or modified. |
| `#ensureUnifiedAccountEnabled` cache semantics | NOT_APPLICABLE | Not touched. |

## Self-identified nits (non-blocking)

- HL-1 (`HyperLiquidProvider.getOpenOrders` error path): partial orders now pass through
  `#restoreScaleOrderGroups` like the success path so scale-group handles stay consistent.
  (Addressed during review; previously the throw path skipped restoration.)
- TS-1 (`TradingService.cancelOrders`): the total-discovery-failure early return bypasses the
  batch-failure `logger.error` summary emitted for partial batch failures. The failure is still
  fully reported via the returned `error` and `failureCount: 1`. Optional follow-up if operators
  want a log line for total discovery outages.

## Second round: Bugbot 29f0c1bd (stale venue balances stay live)

- Comment: https://github.com/MetaMask/core/pull/11461#discussion_r4594920859
  (referenced commit `a2e50c5ec53b`, predates the latest rebased head).
- Staleness check: still valid on the current head. `perpsBalances` writes with no
  `providerStates` (direct venue stream, single-venue aggregated emission) refresh only their own
  venue; provider switches and the aggregated→direct flag migration cleared `accountState` but not
  `perpsBalances`, and state persists across restarts, so a foreign venue's entry kept looking live
  against the documented invariant ("an entry's presence means the venue's balance was live as of
  `lastUpdated`").
- Fix: the direct/single-venue write path now prunes entries for venues the stream does not serve;
  `switchProvider` and the aggregated→direct migration clear `perpsBalances` at the topology
  boundary. Tests: direct-stream prune, single-venue-aggregate prune (both in
  `PerpsController.subscriptions.test.ts`) and a `switchProvider` balance-clear test
  (`PerpsController.lifecycle.test.ts`) — all failed before the fix, pass after; full suite
  140 files / 7517 passed / 0 type errors. Changelog entry added.

## Cross-repository conformity

- Controller-internal change; no client files, hooks, formatters or screens changed → parity map
  NOT_APPLICABLE. Consumers compile against unchanged public types; client compile claim NOT_CHECKED
  (static review cannot establish it and no client checkouts were supplied).
