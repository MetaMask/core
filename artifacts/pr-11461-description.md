## Explanation

In aggregated mode, list reads (positions, orders, fills, markets) already fan out to every venue and tag rows with `providerId`. Account-level data did not: `getAccountState` and `subscribeToAccount` read only the default venue, `perpsBalances` was declared but never written, batch cancel/close were refused outright in multi-venue mode, several market streams ignored explicit routes, and money-movement routes and records carried no venue identity. A Lighter chart would show Hyperliquid candles and the second venue's balance was invisible.

This PR gives each exchange its own account data and routing. Direct/single-provider modes keep their established behavior, and one-venue aggregated fallback (for example Hyperliquid-only while Lighter fails to load) keeps passing the direct result through unchanged.

### Aggregated account reads and streams

- `AggregatedPerpsProvider.getAccountState` fans out to every enabled venue and returns:
  - top-level `totalBalance`, `spendableBalance`, `withdrawableBalance`, `marginUsed` and `unrealizedPnl` as decimal-safe combined totals over the venues that reported data (`bignumber.js`, never binary float), and
  - `returnOnEquity` as the margin-weighted combined rate `100 × Σ unrealizedPnl ÷ Σ marginUsed` (`'0'` when no margin is used). Both venues' adapters report account-level RoE in percentage points, so the combined rate uses the same units; it is never summed or averaged.
- New optional `providerStates` entries, keyed by provider id, hold each venue's own snapshot — including venue-local `crossMarginSummary` and `subAccountBreakdown`, which are never merged into the top level because cross-venue collateral is not mutually usable. Identical sub-account names at different venues do not collide.
- New optional `aggregate` metadata (`{ status: 'complete' | 'partial', availableProviders, unavailableProviders }`) says whether the totals cover every enabled venue. A venue whose read failed (or has not reported) is an explicit `unavailable` entry — never a zero balance; a confirmed zero or nonexistent venue account is an `available` entry with zero balances. A `partial` total is a subtotal and must not be presented as the complete portfolio value. When no venue has usable data the read throws (REST) or the stream emits `null` — never an all-zero total.
- The aggregated result carries no venue `providerId`; per-venue attribution lives in `providerStates`. Each entry's venue is captured before the venue request is awaited, so a default change mid-request never mislabels a balance.
- `AggregatedPerpsProvider.subscribeToAccount` subscribes to every enabled venue through the multiplexer and emits the same combined contract. The account stream is venue fan-out, not default-routed: changing the routing default neither drops a venue's subscription nor erases a still-valid all-venue total, and no `null` invalidation is emitted on a default change. A venue whose update is `null` is explicitly unavailable — its previous value is not kept as current and does not become a zero. Each simultaneous account subscription owns its venue cache, so one subscription's cleanup never erases another subscription's venue data.

### Controller state

- `perpsBalances[providerId]` is now written from live account updates: one entry per available venue with `totalBalance`, `unrealizedPnl` and `lastUpdated`. `accountValue1dAgo` is now optional — `AccountState` carries no historical observation, so it is never fabricated from the current balance and is only carried forward from a real prior entry. A venue whose data becomes unavailable has its entry removed rather than left looking live. There is no synthetic combined entry; the total lives in `accountState`.
- REST account responses are validated against the live account context: an aggregate result stays current while the aggregated wrapper is the active provider (regardless of the routing default); a single-venue result is matched against the venue it names. A response that resolves after the active provider changed is discarded instead of overwriting the live snapshot.
- User-data preload assigns each venue's account state to its own provider cache bucket; the combined total is never stored in Hyperliquid's bucket merely because the aggregate has no `providerId`.
- `setDefaultProvider` clears only a single-venue snapshot (for example a one-venue fallback read); an all-venue aggregate snapshot stays valid across the change.

### Batch routing

- `cancelOrders` and `closePositions` are venue-attributed rather than refused. Cancel targets keep the venue identity of the order that named them, so a filtered or cancel-all batch reaches every venue that actually holds an order. `closePositions` takes either `closeAll` (fans out to every enabled venue) or explicit `targets` of `{ symbol, providerId }`.
- Venue identity is execution identity: untagged batch targets are refused with `PROVIDER_ROUTE_REQUIRED` while multiple venues are registered (single-venue fallback accepts them), and duplicate symbols/order ids across venues are never resolved by choosing the default provider. Results carry a `providerId` per item, and one venue's failure never hides another venue's successes; a thrown venue batch is reported as an explicit per-venue failure.
- Read-only account guards, stale-response handling and the other trade safety checks are unchanged.

### Venue-specific market streams and money movement

- `subscribeToCandles`, `subscribeToOICaps` and `subscribeToOrderBook` take an optional `providerId`. An explicit route reaches that venue — required when both venues list the same symbol — and stays pinned when the routing default changes. Omitting it keeps the previous default-routed rebinding behavior. An unregistered route is reported through `onError` (or thrown when there is no `onError`) and never silently subscribes to a different venue.
- `getDepositRoutes` and `getWithdrawalRoutes` return every active venue's routes, each tagged with a `providerId`; identical asset/chain routes from different venues are distinct entries and are never collapsed.
- Deposit and withdrawal request records in controller state capture the initiating venue (`providerId` from the chosen route, or the active direct provider) before any asynchronous preparation and never relabel it. Legacy persisted records without venue identity keep their shape.

### Breaking package compatibility

**This is a breaking change**, following the breaking-change process:

- The aggregated `AccountState` semantics changed: the top-level numeric fields are now combined totals (with `providerStates`/`aggregate` when the aggregated producer ran), and the account stream no longer follows the default venue or emits a `null` snapshot when the default changes. The new fields are optional, but clients that keyed on the top-level `providerId` of an aggregated read, presented the top level as a single venue's balance, or relied on default-change invalidation must read per-venue values from `providerStates` and partial-total obligations from `aggregate`.
- `perpsBalances` entries made `accountValue1dAgo` optional and gain entries at runtime (previously declared, never written). Client state readers, typed defaults and fixtures that model the entry as fully required need updating.
- `ClosePositionsParams` gains optional `targets`, `BatchCancelOrdersParams` entries gain optional `providerId`, and the batch/stream/route result types gain optional `providerId` fields. All additive.
- New package exports: `PerpsProviderAccountStateEntry`, `AccountAggregateMetadata`, `ClosePositionsTarget`.
- `perpsBalances` entries gain optional `accountAddress` and `isTestnet` provenance; `accountValue1dAgo` carries forward only within the same account and network, and entries for another account or network are dropped on account switch or network toggle. Additive.
- `PerpsProvider.setUserFeeResolution` takes an optional trailing `providerId`; an aggregating provider applies a scoped resolution to that venue only. Batch closes resolve one fee per venue they reach. Additive for callers and implementers.
- `LighterProvider` account subscribers receive `null` instead of an all-zero `AccountState` on a wallet switch or deselection (a venue-confirmed missing account still receives the empty state).

The full consumer inventory, migration notes and unavailability semantics are in the package `CHANGELOG.md` (Unreleased) and the package README's "Per-exchange account data" section.

### Client plan

Client draft PRs are not opened yet; scope is ticketed.

| Client | Plan | Ticket |
| --- | --- | --- |
| Mobile | Default provider and per-trade venue compatibility | [TAT-4405](https://consensyssoftware.atlassian.net/browse/TAT-4405) |
| Mobile | Per-provider streams and balances adoption | [TAT-4407](https://consensyssoftware.atlassian.net/browse/TAT-4407) |
| Extension | Checked at `803491c` (`^22.3.0`, unaffected until it upgrades). On upgrade: `hasZeroHyperliquidPerpsBalance` (`app/scripts/lib/hyperliquid-deposit/eligibility.ts`) reads top-level `accountState` balances, which are cross-venue totals in aggregated mode, so it should read `providerStates.hyperliquid`; the `ui/__mocks__` perps type models `accountValue1dAgo` as required and must make it optional; `perps-stream-bridge.ts` forwards account payloads, including `null`, untyped. No production batch close/cancel callers. Not compiled. | Ticket needed |
| Terminal | Terminal-backend account reads were checked at `b61ee0d`: no `@metamask/perps-controller` dependency and none of the changed surfaces are consumed; no changes needed. | — |

### Evidence

- Full `@metamask/perps-controller` suite with coverage: 132 files, 7,116 passed, 40 skipped, thresholds met (per-package suite only; the monorepo suite was not run).
- Package `build` and `yarn lint:tsc:check`: clean (`tsc-suppressions.json` only lost entries — the test-file type fixes eliminated previously suppressed errors).
- `yarn lint:oxlint`, `oxfmt --check`, root and package `yarn changelog:validate`, `messenger-action-types:check`, `readme-content:check`: clean.
- Static review (`perps-review-pr`) recorded in the run artifacts; one open policy question for reviewers: in aggregated mode the deposit flow takes `depositRoutes[0]`, now the first registered venue's route rather than the routing default's — confirm whether deposit route selection should resolve by default/`params.providerId`.

## References

- Ticket: [TAT-4392](https://consensyssoftware.atlassian.net/browse/TAT-4392) — give each exchange its own balance, positions and charts.
- Depends on: [TAT-4385](https://consensyssoftware.atlassian.net/browse/TAT-4385), default provider and explicit per-trade routing ([#11421](https://github.com/MetaMask/core/pull/11421)).
- Unblocks: [TAT-4405](https://consensyssoftware.atlassian.net/browse/TAT-4405), [TAT-4407](https://consensyssoftware.atlassian.net/browse/TAT-4407).
- Related: [TAT-4329](https://consensyssoftware.atlassian.net/browse/TAT-4329) (cross-margin summary and explicit unavailable result for Lighter account reads), [TAT-4406](https://consensyssoftware.atlassian.net/browse/TAT-4406) (Lighter money movement).

## Checklist

- [x] I've updated the test suite for new or updated code as appropriate
- [x] I've updated documentation (JSDoc, Markdown, etc.) for new or updated code as appropriate
- [x] I've communicated my changes to consumers by [updating changelogs for packages I've changed](https://github.com/MetaMask/core/tree/main/docs/processes/updating-changelogs.md)
- [ ] I've introduced [breaking changes](https://github.com/MetaMask/core/tree/main/docs/processes/breaking-changes.md) in this PR and have prepared draft pull requests for clients and consumer packages to resolve them
