# Validation and remediation

Validated against the current working tree. The original review is preserved below.

| Finding                                                    | Validation                                                | Resolution                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Partial discovery double-counts a successful cancel     | Valid                                                     | Subtract discovered `(orderId, providerId)` targets before recording unresolved IDs. Tests cover direct and aggregated HIP-3 partial reads, mixed found/missing IDs, and cross-venue ID collisions.                                                                                                  |
| 2. Legacy cancel filters execute on multiple venues        | Valid                                                     | Controller and trading-service boundaries refuse non-empty bare-ID or symbols filters with `PROVIDER_ROUTE_REQUIRED` when multiple venues are registered. Scoped targets, cancel-all, empty no-op filters and single-venue requests remain supported.                                                |
| 3. Merged errors lose stable codes                         | Valid                                                     | Add `BATCH_INCOMPLETE`; cancel discovery retains `discoveryFailures`, and merged close and cancel errors retain venue details in their respective `failures` fields. Preserve nested discovery failures without repeating venue prefixes. Unknown close-all failure counts include one failed venue. |
| 4. Changelog understates route/export changes              | Valid                                                     | Move route enumeration to **Changed / BREAKING**, document filtering by `route.providerId`, and list all four account-aggregation subpath exports.                                                                                                                                                   |
| 5. Balance-history carry-forward has no producer           | Valid                                                     | Remove carry-forward, provenance fields and their helpers. Live writes replace entries; account selection and network changes clear balances. Keep the optional legacy historical field readable without manufacturing a value.                                                                      |
| 6. Fan-out fees reuse allowance and query incapable venues | Valid; over-allocation was latent with the current venues | Expose fee-resolution support per route, skip unsupported venues, resolve fees sequentially, and subtract subscription notional reserved for preceding venues. Tests cover the 600 + 600 / 1000 allowance case.                                                                                      |
| 7. Withdrawal attribution trusts tracing metadata          | Valid                                                     | Resolve the write provider from `getWriteProviderId` or `protocolId`, narrow through `isPerpsProviderType`, and never use tracing tags as execution identity.                                                                                                                                        |

All four provider-code nits are addressed: shared error normalization, locally narrowed cancel routes, a set for reported venues, and `this.protocolId` for HyperLiquid partial discovery.

The pre-existing non-finite batch-close pricing issue is also fixed: a venue with any unpriced selected position no longer receives a fee quote based only on its priced subtotal. Other venues remain independently priced.

## Contract impact matrix

| Surface          | Impact / compatibility                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State            | Live `perpsBalances` writes contain venue-local balance, PnL and timestamp only. History is optional; account/network changes clear entries. Aggregated `accountState` totals remain cross-venue; venue-local validation must use `providerStates[providerId]`.                                                                                                                                                  |
| Methods          | Ambiguous non-empty cancel filters are refused in multi-venue mode. Close/cancel batches preserve successful work and structured failures. Fee support is exposed through optional `PerpsProvider.supportsFeeResolution`; `RewardsIntegrationService.resolveFee` accepts an optional third argument for batch-reserved subscription notional. Money-movement route lists require venue filtering.                |
| Events / streams | No new messenger actions or events. Existing account subscriptions and controller state-change events reflect the balance reset behavior; aggregate completeness remains available on account callbacks.                                                                                                                                                                                                         |
| Types / exports  | Add `PERPS_ERROR_CODES.BATCH_INCOMPLETE`, optional `CancelOrdersResult.failures` / `ClosePositionsResult.failures`, cancel-selection and fee-support utilities, and fee capability/resolver parameters. Remove unused balance provenance fields. Document `utils/accountAggregation` exports: `buildAggregatedAccountState`, `getAccountAggregateMetadata`, `aggregateAccountTotals`, `AggregatedAccountTotals`. |

## Advisory and external items

- Cancel selection and refusal are now centralized in the follow-up fix. Centralizing close selection and introducing a distinct aggregated-account type remain optional architectural refactors, not demonstrated behavioral defects.
- Zero return-on-equity without margin and absent batch slippage parameters are existing contracts / feature-design choices, not regressions to change implicitly here.
- Mobile, Extension and Terminal consumers and paired rollout PR links remain **not verified**. This checkout cannot establish client migration readiness; no links or consumer evidence have been invented. The impact matrix above can accompany the PR compatibility notes.

## Verification

- Added/updated regression tests first: 21 expected failures across the seven targeted test files before implementation. The additional non-finite pricing regression also failed before its fix.
- Full perps test suite and coverage thresholds pass.
- Root `yarn lint:tsc:check` passes (no new unsuppressed type errors).
- Oxlint and Oxfmt checks pass for changed package files.
- Root `yarn changelog:validate` passes.
- `yarn workspace @metamask/perps-controller run build` passes.

---

# Original review

I'll review the current branch of `core` against `origin/main` using the perps review skill and anti-patterns list, read-only.

I'm requesting changes on `TAT-4392-exchange-each-its-own`, based on two major findings. First, a cancel that succeeds during a HIP-3 DEX outage can still be reported as failed. Second, cancels by `symbols` or by order ID alone now reach every exchange instead of being refused.

I didn't run tests or lint, and I didn't fetch, push or write anything, including the `artifacts/` ledger files the skill asks for. The base is your local `origin/main`, last fetched 2026-11-17 01:34 UTC and not refreshed.

---

## PR summary (ready to paste)

```markdown
VERDICT: REQUEST_CHANGES
COMMIT: 9cd5989475b9d9578b3ad8fcb7493915ef75c3c3

Per-venue account aggregation, tagged close targets and venue-attributed batches are the right direction, and the missing-vs-zero handling in `accountAggregation.ts` and the Lighter `null` reset is careful work. Two behaviours need to change before merge. A cancel that succeeds while a HyperLiquid HIP-3 DEX is down is also counted as a failure. Cancels by `symbols` or `orderIds` alone now execute on every venue: `main` refused them, and this PR still refuses the same ambiguity for `closePositions`.
⚠️ NOT_CHECKED: Mobile, Extension and Terminal consumers of the BREAKING aggregated `AccountState` (no checkouts available to this review).

| Severity | file:line                                                               | Problem                                                                                                                                             | Ask                                                                                              |
| -------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ❌ Major | packages/perps-controller/src/services/TradingService.ts:2156           | A scoped target found in a venue's partial `OrderDiscoveryError.orders` is cancelled and also counted as an unresolved discovery failure.           | Remove IDs the venue already returned from `discoveryFailures[].orderIds` before counting them.  |
| ❌ Major | packages/perps-controller/src/PerpsController.ts:4082                   | Cancels by `symbols` or `orderIds` alone now run on every venue in multi-venue aggregated mode.                                                     | Refuse them with `PROVIDER_ROUTE_REQUIRED`, as `closePositions` does.                            |
| ⚠️ Minor | packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:1609 | Multi-venue batch `error` turns error codes into venue-prefixed text (`hyperliquid: PROVIDER_NOT_AVAILABLE`).                                       | Keep `error` a `PerpsErrorCode` and move per-venue detail into a structured field.               |
| ⚠️ Minor | packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:494  | Deposit/withdrawal route lists change for existing callers but are logged under "Added". A new public subpath module is missing from the changelog. | Move the entry to Changed and mark it **BREAKING**. List the `utils/accountAggregation` exports. |
| ⚠️ Minor | packages/perps-controller/src/PerpsController.ts:7652                   | Nothing ever sets `accountValue1dAgo`, so the carry-forward and its provenance fields can never run.                                                | Add the producer in this PR, or remove the carry-forward and provenance.                         |
| ⚠️ Minor | packages/perps-controller/src/services/TradingService.ts:2643           | A fan-out close checks each venue's fee waiver against the same remaining allowance, without subtracting what the other venues used.                | Skip venues that don't apply fees, and split the allowance across venues.                        |
| ⚠️ Minor | packages/perps-controller/src/services/AccountService.ts:155            | Withdrawal venue comes from Sentry tracing data through an `as` cast.                                                                               | Use the existing pattern at `TradingService.ts:1720`.                                            |

<details>
<summary>Details for agents</summary>

| Status         | Item                        | Evidence or gap                                                                                                                                                                                                                   | Ask                                                                                    |
| -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ⚠️ NOT_CHECKED | Client consumers            | Aggregated top-level `spendableBalance` / `withdrawableBalance` are now cross-venue sums. Any client passing `accountState.spendableBalance` into `orderCalculations` max-size or withdraw validation over-allows a single venue. | Link paired Mobile, Extension and Terminal PRs that read `providerStates[providerId]`. |
| ⚠️ NOT_CHECKED | Core evidence (author-owed) | The PR body was not available. The #11552 sub-PR body is the empty template. A BREAKING release needs a contract impact matrix and compatibility notes.                                                                           | Add the matrix (state, methods, events, exports) and paired client PR links.           |
| ⚠️ NOT_CHECKED | Runtime                     | Tests and lint not executed; CI owns them.                                                                                                                                                                                        | —                                                                                      |

➖ Not applicable to this core-only diff: Pro Mode UI Gating, MetaMetrics Events, Navigation Entry/Exit Parity, Embedded Signer Boundaries, i18n, Shared Formatting, client-side math.

</details>
```

---

## Line comments

**1. `packages/perps-controller/src/services/TradingService.ts:2156`, ❌ Major (must fix)**

> Hunk `@@ -2024,40 +2110,98 @@` (the new `OrderDiscoveryError` catch). This PR introduced it: on `main`, `cancelOrders` read open orders leniently and had no `discoveryFailures`. The partial-orders throw at `HyperLiquidProvider.ts:14414` is also new here.
>
> Scenario: HIP-3 DEX `xyz` is down and the orders cache isn't initialized. A user cancels main-DEX order `A` with `cancelOrders({ orders: [{ orderId: 'A', providerId: 'hyperliquid' }] })`.
>
> 1. HyperLiquid throws `OrderDiscoveryError({ orders: [A], failures: [{ providerId: 'hyperliquid', … }] })`.
> 2. This line builds `orderIds: ['A']` for that failure.
> 3. The filter below matches `A` and the venue cancels it.
>
> The result is `success: true, successCount: 1, failureCount: 1`, with `discoveryFailures: [{ providerId: 'hyperliquid', orderIds: ['A'] }]`. That contradicts the README ("these targets have no discovered symbol, so they are separate from `results`"). Clients told to check `discoveryFailures` will show a failure for a cancel that worked.
>
> Ask: before pushing an entry, drop IDs that `error.orders` already contains for that venue. Match on `orderId` and on `order.providerId ?? provider.protocolId`. Skip the entry when a scoped request has nothing left. Add a test where a HyperLiquid partial `OrderDiscoveryError` contains the target and the result has `failureCount: 0` and no `discoveryFailures`.

**2. `packages/perps-controller/src/PerpsController.ts:4082`, ❌ Major (must fix, Perps anti-pattern: entity ownership lost in transit)**

> Hunk `@@ -4013,26 +4078,21 @@` removes both `#getUnroutedAggregatedBatchRefusal` calls. `TradingService.ts:2195–2204` then matches legacy filters across every venue.
>
> This PR introduced it: on `main`, `cancelOrders` returned `PROVIDER_ROUTE_REQUIRED` whenever more than one venue was registered. Now `cancelOrders({ symbols: ['BTC'] })` from a Lighter BTC screen also cancels HyperLiquid BTC orders, and a colliding `orderIds` value cancels on both venues.
>
> The same PR still refuses symbols-only `closePositions` for exactly this ambiguity (`PerpsController.ts:4156`, `AggregatedPerpsProvider.ts:1432`). Destructive writes should follow one rule.
>
> Ask: when more than one venue is registered, refuse `symbols` or `orderIds` without `orders` (and without `cancelAll`) using `#getUnroutedAggregatedBatchRefusal(provider)`. Keep the `cancelAll` and `orders` fan-out. Change `keeps legacy bare order IDs as an explicit cross-venue filter` (`TradingService.test.ts:2269`) to assert the refusal.

**3. `packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:1609`, ⚠️ Minor (Perps anti-pattern: provider-specific error handling)**

> Introduced by the new `#mergeCloseResults` and by the discovery `error` join at `TradingService.ts:2297`. On `main`, the batch `error` was either the venue's code or `PROVIDER_ROUTE_REQUIRED`. Here, HyperLiquid's `PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE` from a multi-venue close becomes `"hyperliquid: PROVIDER_NOT_AVAILABLE"`. `isPerpsErrorCode` rejects that string, so client error-message tables fall back to showing raw text. The same `error` field holds a code with one venue and text with two.
>
> Line 871 also re-wraps `result.reason.message`, which already starts with the venue name, producing `"hyperliquid: hyperliquid: xyz: …"`.
>
> Ask: keep `error` a `PerpsErrorCode`. Add a code for incomplete batches in `perpsErrorCodes.ts`, and carry per-venue detail as `{ providerId, error }[]`. Cancel already has `discoveryFailures`; add an equivalent field for close. At line 871, spread `result.reason.failures` instead of `.message`.

**4. `packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:494`, ⚠️ Minor (core rule: changelog must match contract impact)**

> Hunk `@@ -481,15 +490,26 @@`. On `main`, both route methods returned only the default venue's routes. In aggregated mode on mainnet, `PerpsController:getWithdrawalRoutes` now also returns Lighter's bridge route (`LighterProvider.getWithdrawalRoutes` → `#bridgeRoute(...)`). Callers that take `routes[0]` or render the whole list get a second venue without changing any code.
>
> CHANGELOG line 101 files this under **Added**, while the same release marks the comparable account change as **BREAKING**.
>
> Separately, the new `src/utils/accountAggregation.ts` is public through the `./utils/*` export (`buildAggregatedAccountState`, `getAccountAggregateMetadata`, `aggregateAccountTotals`, `AggregatedAccountTotals`), but the CHANGELOG doesn't list it. The public-trades entry does list its subpath exports.
>
> Ask: move the routes entry to **Changed** as **BREAKING** ("filter by `route.providerId`"), and list or deliberately exclude the new subpath exports.

**5. `packages/perps-controller/src/PerpsController.ts:7652`, ⚠️ Minor (Simple Made Easy: state with no producer)**

> Hunk `@@ -7433,19 +7611,118 @@`. `git grep accountValue1dAgo` on both `main` and this branch finds no code that writes `perpsBalances[*].accountValue1dAgo`. `writeBalance` only copies `previous.accountValue1dAgo`. Entries persisted before this branch have no `accountAddress`, so `isSameBalanceContext` rejects them.
>
> This PR therefore adds two persisted public fields (`accountAddress`, `isTestnet`), three helpers (`isSameBalanceContext`, `#resolveBalanceAccountAddress`, `#dropForeignPerpsBalances`) and a BREAKING type change, all for a value that can never be present. The tests from `PerpsController.subscriptions.test.ts:695` onward fill it in manually, which hides the gap.
>
> Ask: either wire the producer in this PR (fill `accountValue1dAgo` per venue from `getHistoricalPortfolio`), with a test that starts from empty state, or drop the carry-forward and provenance. In the second case, set `perpsBalances = {}` on account switch and network toggle. Entries are keyed by venue, so that gives the same result for streams on the selected account.

**6. `packages/perps-controller/src/services/TradingService.ts:2643`, ⚠️ Minor (core rule: metered fee waivers)**

> On `main`, multi-venue `closePositions` was refused, and a single-venue batch called `resolveFee` once with the summed notional. Here each venue resolves in `Promise.all`, and `resolveSubscriptionWaiverRate` compares each venue's notional to the same `remainingNotionalUsd`. With 600 + 600 against 1000 remaining, both venues resolve `kind: 'full'`, covering 1200.
>
> It's latent today: `LighterProvider` implements neither `setUserFeeResolution` nor `setUserFeeDiscount`, so only HyperLiquid applies a waiver. Every fan-out close still pays an extra rewards-and-grant lookup, inside the serialized fee queue, for a venue that discards the result.
>
> Ask: expose which venues apply fee resolutions and skip the others. Before a second venue starts applying waivers, resolve venues one after another and pass along the allowance remaining after earlier venues.

**7. `packages/perps-controller/src/services/AccountService.ts:155`, ⚠️ Minor (Total TypeScript and Simple Made Easy)**

> New in hunk `@@ -140,17 +141,33 @@`. `ServiceContext.tracingContext.provider` is typed `string` (`ServiceContext.ts:41`) and exists for Sentry tags. `as PerpsProviderType` turns that tracing value into persisted withdrawal state without checking it. Deposits in the same PR attribute the venue differently (`depositVenueId` narrows `state.activeProvider` in `PerpsController.ts`).
>
> Ask: use `provider.getWriteProviderId?.(params.providerId) ?? provider.protocolId`, checked with the existing `isPerpsProviderType` (the pattern at `TradingService.ts:1720`), so one rule attributes both deposits and withdrawals.

### Suggestions (non-blocking: Simple Made Easy and Total TypeScript)

- **`packages/perps-controller/src/types/index.ts:1136`**: The order of precedence for close selection (`targets` before `closeAll` before `symbols`) is worked out again at seven new or changed places: `PerpsController.ts:4156`, `AggregatedPerpsProvider.ts:1432` and `:1536`, `TradingService.ts:1414`, `:1443` and `:2688`, and `HyperLiquidProvider.ts:11444`. Cancel's `cancelAll > orders > orderIds > symbols` order is repeated twice in `TradingService`. One helper in `utils/` that returns `{ kind: 'targets'; targets } | { kind: 'all' } | { kind: 'symbols'; symbols }` would make the order a single decision, and an exhaustive `switch` would flag any new selector.
- **`packages/perps-controller/src/types/index.ts:1029`**: `AccountState` now means both "one venue's snapshot" and "combined total across venues". Code tells them apart by checking whether `providerStates` is present (`PerpsController.ts:5436`, `5445`, `6332`, `7103`, `7663`), and `PerpsProviderAccountStateEntry.state` can itself contain another aggregate. This release already breaks aggregated account reads, so a separate `AggregatedAccountState` type with a `kind` field would make the difference explicit at no extra migration cost.

### Nits

- `AggregatedPerpsProvider.ts:731` (also 877, 1278, 1326, 1554, 1613): `reason instanceof Error ? reason.message : String(reason)` appears seven times. `ensureError` is already imported in this file.
- `AggregatedPerpsProvider.ts:1231`: `param.providerId as PerpsProviderType` relies on an earlier `.some()` check. Throw on a missing `providerId` inside the grouping loop instead, so the compiler proves the type.
- `AggregatedPerpsProvider.ts:2073`: `Map<PerpsProviderType, 'available'>` only ever stores `'available'`; a `Set<PerpsProviderType>` says the same thing.
- `HyperLiquidProvider.ts:14428`: hardcoded `providerId: 'hyperliquid'`, while the same diff uses `this.protocolId` at line 11440.

### Pre-existing issues (non-blocking, not introduced by this PR)

- `TradingService` batch-close pricing counts a non-finite `positionValue` as 0. `main` skipped it the same way. Either way the notional is understated when the waiver allowance has a cap.
- Combined `returnOnEquity` is `'0'` when no margin is used. This matches `main`'s `aggregateAccountStates`. Making it `undefined` needs a type change.
- `ClosePositionsParams` has no `maxSlippageBps`, so batch closes use each venue's default slippage. The new aggregated fallback inherits that from `main`'s `TradingService` fallback.

************FOLLOW_UP**************

## Follow-up remediation — current working tree

All three actionable follow-up findings and all four nits have been addressed locally. The follow-up review below is retained as historical evidence, not the current verdict.

| Follow-up item                              | Validation / resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Published changelog rewritten               | **Valid, fixed.** Restored `24.0.0` and every older section byte-for-byte from local `origin/main` (`ee0397eed84`). Moved all 15 branch-added release entries into Unreleased, retained breaking markers, and documented changed default-provider and batch behavior there instead of rewriting released bullets. New behavior references this branch's verified PR **#11461**, not the released #11421. Removed the earlier “breaking removal” entry for provenance fields that never existed in released 24.0.0. |
| Complete direct discovery leaks raw `error` | **Valid, fixed.** Known direct providers now return `BATCH_INCOMPLETE` plus venue-attributed `discoveryFailures`; scoped IDs are deduplicated and counted consistently with partial discovery. Protocol identity is narrowed with `isPerpsProviderType`. Unknown protocols get the stable code without a fabricated venue or tracing-based attribution.                                                                                                                                                            |
| Multi-venue cancel merge loses batch errors | **Valid, fixed.** Thrown and returned venue batch errors are all retained in new `CancelOrdersResult.failures: { providerId, error }[]`, and the merged `error` is `BATCH_INCOMPLETE`. Per-target outcomes, counts and successful venues are preserved. Discovery errors remain separately attributed in `discoveryFailures`.                                                                                                                                                                                      |
| Conditional fee resolver argument shape     | **Fixed.** Always pass reserved subscription notional, including zero, and update call-argument assertions rather than branching for old tests.                                                                                                                                                                                                                                                                                                                                                                    |
| Repeated fee-setter check                   | **Fixed.** Both the aggregate and trading service use `hasFeeSetter`; no redundant `Boolean` conversion.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Comments claim balances still carry history | **Fixed.** Account/network reset comments now describe live observations only.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Duplicated cancel selection / route refusal | **Fixed.** `resolveCancelSelection` owns precedence and empty-selection semantics. `getUnroutedCancelOrdersRefusal` is shared by controller and service; execution uses an exhaustive switch on that same selection. Unknown aggregated membership fails closed.                                                                                                                                                                                                                                                   |

### Verification and scope

- Regression tests were updated first: the direct-discovery, merged-cancel and fee call-shape checks failed before implementation; new helper suites initially failed because their modules did not yet exist.
- Full perps suite: **142 test files, 7,549 tests passed, 40 skipped**; coverage thresholds pass (92.4% lines).
- Root type check and changed-file lint/format checks pass; root changelog validation and the perps package build pass. The published-history equality check passes after formatting.
- Local scope only: no commits, pushes, releases, client changes or GitHub PR-body edits were performed.

### Handoff: external compatibility and PR evidence still unverified

There are **no known unresolved local implementation findings** from this follow-up. The remaining uncertainty is client readiness and external release evidence, not a proposed speculative Core fix.

1. **Verify the actual client consumers before declaring rollout ready.** Inspect the relevant Mobile, Extension and Terminal checkouts and their instructions. Search for `accountState.spendableBalance`, `withdrawableBalance`, `providerStates`, `perpsBalances`, `cancelOrders`, `closePositions`, `getDepositRoutes`, `getWithdrawalRoutes`, `BATCH_INCOMPLETE`, `discoveryFailures` and batch `failures`.
   - Venue-local max-size, margin and withdrawal validation must read an **available** `providerStates[providerId]` snapshot, never a cross-venue subtotal. Partial, pending and unavailable balances must not be presented as complete or zero.
   - Add/localize `BATCH_INCOMPLETE` and render structured venue failures without hiding successful work or reporting discovered successful targets as failed. Completion checks must consider `failureCount`, per-item `results`, `error`, `discoveryFailures` and `failures`, not `success` alone.
   - Migrate venue-specific bare-ID/symbol cancellation calls to scoped `orders`; retain explicit user-confirmed fan-out behavior for cancel-all / close-all. Preserve `providerId` on explicit close targets and money-movement route selections.
   - Filter route lists by the intended venue; verify balances/UI caches reset on account/network changes and history readers tolerate missing `accountValue1dAgo`. Verify changing the routing default does not tear down the all-venue account stream.
   - Add focused client tests, then record real paired PR links and any version gates. Do not invent links or treat Core's passing mocks as consumer migration evidence.
2. **Update PR #11461's body with verified evidence, without overwriting existing discussion.** A read-only check found compatibility text and `BATCH_INCOMPLETE` already mentioned, but no `contract impact` heading or `CancelOrdersResult.failures` mention. Re-read the live body before editing. Copy/merge the contract-impact matrix near the top of this document, add both batch result `failures` fields and the cancellation/default-routing compatibility changes, and append the actual client PR links/test results from step 1. This session deliberately did not publish a remote description update.
3. **Keep release history and versioning honest.** Before landing, compare the released changelog suffix again against the current base (the local comparison here used `ee0397eed84`, without fetching). Keep this PR's entries under Unreleased; retain the new breaking changes for the release team's next major-version decision. Do not move them into 24.0.0, bump/publish packages, or claim client rollout approval as part of this handoff.
4. **Rerun after any further edits:** perps tests/coverage, root type check, lint and formatting for changed files, changelog validation, package build, and the released-history equality check. Review both new helper files and their tests when staging; they are new, untracked files until explicitly added. This review document was already untracked before the task, so include it deliberately if the handoff should be committed.

---

I'll check whether the new commits are already in your local checkout before reading them.

The two new commits (`e30d32a`, `3396337`) are already pulled locally, so I'll diff them against the previously reviewed head.

I'm still requesting changes on the update. The author fixed five of my seven findings, fixed part of a sixth, and fixed all four nits. But I missed a blocking issue in my first pass. The branch adds its changelog entries, including all three **BREAKING** ones, under `## [24.0.0]`, which has already been released. `main`'s `package.json` is `24.0.0`.

The new head is `3396337`, with two new commits since `9cd5989`; you had already pulled them, so I didn't fetch. The base is still `ee0397e`. As before, I didn't run tests or lint, and I made no local or GitHub changes.

---

## Updated PR summary (ready to paste)

```markdown
VERDICT: REQUEST_CHANGES
COMMIT: 3396337d264afcc595c81e957a3d620b5328b6ff

Thanks for the quick turnaround. The fixes are precise and come with tests that fail without them: the HIP-3 scoped-cancel test, the legacy-filter refusal, and a 600 + 600 against 1000 allowance reservation. One blocker remains: this PR's changelog entries, including all three BREAKING changes, sit under the already-published `## [24.0.0]` instead of `## [Unreleased]`. I missed this in my first pass. Two places still put a raw message in a batch result's `error` field.
⚠️ NOT_CHECKED: Mobile, Extension and Terminal consumers of the BREAKING aggregated `AccountState`, `BATCH_INCOMPLETE`, `ClosePositionsResult.failures` and per-venue routes (no checkouts available to this review).
Since last review: ✅ resolved `TradingService.ts:2156`; ✅ resolved `PerpsController.ts:4082`; ✅ resolved `PerpsController.ts:7652`; ✅ resolved `TradingService.ts:2643`; ✅ resolved `AccountService.ts:155`; ⚠️ partly resolved `AggregatedPerpsProvider.ts:1609`; ⚠️ superseded `AggregatedPerpsProvider.ts:494` (correctly categorized now, but in the released section); 🆕 new `CHANGELOG.md:124`.

| Severity | file:line                                                               | Problem                                                                                                                                                                      | Ask                                                                                    |
| -------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ❌ Major | packages/perps-controller/CHANGELOG.md:124                              | This PR's entries, including three BREAKING ones, are in the published `## [24.0.0]` section. Several 24.0.0 bullets are rewritten, and new behaviour is credited to #11421. | Move them to `## [Unreleased]`, restore 24.0.0 to `main`'s text, and fix the PR links. |
| ⚠️ Minor | packages/perps-controller/src/services/TradingService.ts:2168           | When open-order discovery fails completely, the cancel result's `error` is the raw exception message.                                                                        | Return `BATCH_INCOMPLETE` and put the venue detail in `discoveryFailures`.             |
| ⚠️ Minor | packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:1262 | A multi-venue cancel whose venue batch throws sets no batch `error`; otherwise the first venue's error code wins without saying which venue.                                 | Merge the same way `#mergeCloseResults` does.                                          |

<details>
<summary>Details for agents</summary>

| Status         | Item                        | Evidence or gap                                                                                                                     | Ask                                             |
| -------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| ⚠️ NOT_CHECKED | Client consumers            | `BATCH_INCOMPLETE` is a new code that client error-message tables must map. Aggregated top-level balances are now cross-venue sums. | Link paired Mobile, Extension and Terminal PRs. |
| ⚠️ NOT_CHECKED | Core evidence (author-owed) | No contract impact matrix or compatibility note is available for a BREAKING release.                                                | Add them to the PR body.                        |

➖ Not applicable to this core-only diff: Pro Mode UI Gating, MetaMetrics Events, Navigation Entry/Exit Parity, Embedded Signer Boundaries, i18n, Shared Formatting, client-side math.

</details>
```

---

## New and still-open line comments

**`packages/perps-controller/CHANGELOG.md:124`, ❌ Major (new; core rule: changelog must match contract impact)**

> On `main`, `package.json` is `24.0.0`. `main`'s `## [24.0.0]` (lines 57–116) has no #11461 or #11552 entries, and `main`'s `src` has no `discoveryFailures`. This branch's changelog hunks `@@ -63`, `@@ -66,3`, `@@ -84`, `@@ -94,0 +114,7`, `@@ -97,0 +124,18`, `@@ -106,0 +151,9` and `@@ -114,0 +168` all land inside that released section.
>
> Concretely:
>
> - The three **BREAKING** entries (routes at line 124, aggregated account state at line 127, optional `accountValue1dAgo` at line 140) are filed under the published 24.0.0.
> - Released 24.0.0 bullets are rewritten to describe new behaviour (line 81 "account stream is not default-routed", and line 102 "venue-attributed rather than refused").
> - New behaviour is credited to the already-released #11421 (lines 151 and 153; `discoveryFailures` does not exist in 24.0.0).
>
> As written, the published 24.0.0 changelog describes APIs that 24.0.0 doesn't contain. `## [Unreleased]` doesn't record the breaking account and route changes, so the next release could ship them as a minor version.
>
> Ask:
>
> 1. Restore `## [24.0.0]` to `main`'s exact text.
> 2. Move every entry this PR adds into `## [Unreleased]` under Added, Changed or Fixed, keeping the **BREAKING** prefixes.
> 3. Describe the changed `setDefaultProvider` and batch-cancel behaviour as new Unreleased "Changed" entries instead of editing the 24.0.0 bullets.
> 4. Point new-behaviour entries at this PR instead of #11421.

**`packages/perps-controller/src/services/TradingService.ts:2168`, ⚠️ Minor (left over from the earlier `AggregatedPerpsProvider.ts:1609` comment; Perps anti-pattern: provider-specific error handling)**

> Close results and partial-discovery results now return `BATCH_INCOMPLETE` with structured detail, which is exactly what I asked for. This branch is still left: when open-order discovery fails completely (direct mode, with something other than an `OrderDiscoveryError`), the result has `error: error.message`.
>
> This branch introduced the structured result itself: on `main`, `cancelOrders` threw here. A direct HyperLiquid outage now returns `{ error: 'HL down' }`, which `isPerpsErrorCode` rejects.
>
> Ask: return `error: PERPS_ERROR_CODES.BATCH_INCOMPLETE` with `discoveryFailures: [{ providerId, error }]`. Get `providerId` from `provider.protocolId`, checked with `isPerpsProviderType`. Then the README's "check both `error` and `discoveryFailures`" advice holds for every path.

**`packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:1262`, ⚠️ Minor (left over from the same comment)**

> `#mergeCloseResults` now collects venue failures and sets `BATCH_INCOMPLETE`, but the multi-venue `cancelOrders` merge still doesn't.
>
> - When a venue's batch throws, its targets fail per item and no batch-level `error` is set. A client following the README check sees a partial cancel as complete.
> - When venues return error codes, `merged.error ??=` keeps whichever venue's code comes first and drops which venue it came from.
>
> Ask: collect `{ providerId, error }` for every venue that threw or returned an `error`. Set `BATCH_INCOMPLETE` when there are any, and expose the list the same way `ClosePositionsResult.failures` does. Batch close and batch cancel then share one result contract.

### Nits (non-blocking)

- **`TradingService.ts:1720`**: the `reservedSubscriptionNotionalUsd > 0 ? resolveFee(n, scope, reserved) : resolveFee(n, scope)` branch only exists to keep the call shape that older tests expect; `resolveFee` already defaults the argument to `0`. Always pass it and update the `toHaveBeenCalledWith` expectations.
- **`TradingService.ts:2672`**: the inline fallback repeats the check in `AggregatedPerpsProvider.supportsFeeResolution`, and `Boolean(a || b)` is redundant for two booleans. A small shared helper such as `hasFeeSetter(provider)` would keep one definition.
- **`PerpsController.ts:1518` and `:6729`**: the comments still say the balances "carry history", which they no longer do after the provenance removal.
- **`PerpsController.ts:4048` and `TradingService.ts:2102`**: the legacy-filter refusal is written twice, once using `#getUnroutedAggregatedBatchRefusal` and once using `getProviderIds().length`. This is the Simple Made Easy point from the earlier `types/index.ts:1136` suggestion. One `resolveCancelSelection(params)` that returns a discriminated union would remove both copies.

## Replies for resolved threads

- **`TradingService.ts:2156`**: Resolved. Requested IDs already returned by the venue are now removed (`TradingService.ts:2177–2186`). Both direct and aggregated cases are covered, plus the "same ID on another venue" case.
- **`PerpsController.ts:4082`**: Resolved. Non-empty `symbols` or `orderIds` without `orders` now return `PROVIDER_ROUTE_REQUIRED` with more than one venue, matching `closePositions`. The cross-venue test now asserts the refusal.
- **`PerpsController.ts:7652`**: Resolved. The carry-forward and provenance fields are removed, account and network changes clear `perpsBalances`, and the BREAKING entry is in Unreleased.
- **`TradingService.ts:2643`**: Resolved. Venues without a fee setter are skipped, and the allowance is reserved venue by venue (the 600 + 600 against 1000 test makes the second venue partial). This also fixes the earlier pre-existing issue where a non-finite position value understated the notional.
- **`AccountService.ts:155`**: Resolved. The venue now comes from `getWriteProviderId ?? protocolId`, checked with `isPerpsProviderType`.
- **Nits**: Resolved: `ensureError` everywhere, the `as` cast replaced by narrowing inside the loop, `lastReport` is a `Set`, and HyperLiquid uses `this.protocolId`.




***********FOLLOW-UP-2************

I'll check for new commits since `3396337` and re-verify each open item.

The new commit imports `utils/cancelOrders.js` and `utils/feeSupport.js`, but neither file appears in the diff stat. I'll check whether they're committed.

`utils/cancelOrders.ts` and `utils/feeSupport.ts` are not in commit `1e20226`, on disk, or on the remote branch you fetched at 23:39. I'll still check the changelog and the remaining hunks.

The `## [24.0.0]` section now matches `main` exactly. Next I'll check the Unreleased section's contents and PR links.

I'm still requesting changes, but only because of one mechanical problem. The new commit `1e20226` imports two modules that were never committed, so the package won't compile. Everything else from the last round is fixed.

The two missing modules are `src/utils/cancelOrders.ts` and `src/utils/feeSupport.ts`. They aren't in the commit, on your disk, or on the remote branch as of your 23:39 fetch. The changelog also documents them as public exports (line 49), so the author most likely wrote them and didn't `git add` them. The legacy-filter refusal from round 1 and the fee-setter check now live in those files, so I can't confirm either fix until they're pushed. As before, I didn't run tests or lint, and made no local or GitHub changes.

---

## Updated PR summary (ready to paste)

```markdown
VERDICT: REQUEST_CHANGES
COMMIT: 1e2022658c75d8276c5abb404f1331b667707e0f

The changelog is now correct: `## [24.0.0]` matches `main` exactly, every change in this PR is under `## [Unreleased]`, and the PR links point here. Cancel and close batches now share one result contract (`BATCH_INCOMPLETE` plus structured `failures` / `discoveryFailures`), and the cancel selector is a discriminated union handled with `assertExhaustive`. One blocker: `utils/cancelOrders.ts` and `utils/feeSupport.ts` are imported but not committed, so the package does not compile. The legacy-filter refusal and the fee-setter check now live in those files, so I'll confirm both once they're pushed.
⚠️ NOT_CHECKED: contents of `utils/cancelOrders.ts` and `utils/feeSupport.ts` (not in the commit). Mobile, Extension and Terminal consumers of the BREAKING contract.
Since last review: ✅ resolved `CHANGELOG.md:124`; ✅ resolved `TradingService.ts:2168`; ✅ resolved `AggregatedPerpsProvider.ts:1262`; ✅ resolved nits `TradingService.ts:1720`, `PerpsController.ts:1518`, `PerpsController.ts:6729`; ⚠️ pending verification `PerpsController.ts:4048` / `TradingService.ts:2102` (consolidation moved into the uncommitted `utils/cancelOrders.ts`); 🆕 new `TradingService.ts:50`.

| Severity | file:line | Problem | Ask |
|---|---|---|---|
| ❌ Blocker | packages/perps-controller/src/services/TradingService.ts:50 | `../utils/cancelOrders.js` and `../utils/feeSupport.js` are imported in four places but the files are not in the commit. TypeScript fails with TS2307, so the build and every test file that imports these modules fail. | Commit both files, with direct tests for `resolveCancelSelection`, `getUnroutedCancelOrdersRefusal` and `hasFeeSetter`. |
| 💬 Nit | packages/perps-controller/CHANGELOG.md:91 | "Fixed" lists fixes to bugs that were introduced inside this unreleased PR and never shipped. | Fold them into the Added/Changed entries that describe the final behaviour. |

<details>
<summary>Details for agents</summary>

| Status | Item | Evidence or gap | Ask |
|---|---|---|---|
| ⚠️ NOT_CHECKED | `utils/cancelOrders.ts`, `utils/feeSupport.ts` | Not in commit `1e20226` or the fetched branch tree. | Push the files; re-review their selection precedence (`{ orderIds: [], symbols: ['BTC'] }` must still select nothing) and the multi-venue refusal. |
| ⚠️ NOT_CHECKED | Client consumers | `BATCH_INCOMPLETE`, `CancelOrdersResult.failures`, `ClosePositionsResult.failures`, per-venue routes and aggregated `AccountState` totals. | Link paired Mobile, Extension and Terminal PRs. |

➖ Not applicable to this core-only diff: Pro Mode UI Gating, MetaMetrics Events, Navigation Entry/Exit Parity, Embedded Signer Boundaries, i18n, Shared Formatting, client-side math.

</details>
```

---

## Line comments

**`packages/perps-controller/src/services/TradingService.ts:50`, ❌ Blocker (new)**
> This commit adds imports of `../utils/cancelOrders.js` (`TradingService.ts:50`, `PerpsController.ts:207`) and `../utils/feeSupport.js` (`TradingService.ts:62`, `AggregatedPerpsProvider.ts:128`). Neither `src/utils/cancelOrders.ts` nor `src/utils/feeSupport.ts` is in commit `1e20226` (`git ls-tree HEAD packages/perps-controller/src/utils/` lists neither). TypeScript therefore fails with TS2307, and every test file that imports `PerpsController`, `TradingService` or `AggregatedPerpsProvider` fails before it runs. `CHANGELOG.md:49` already documents both modules as public `./utils/*` subpath exports, so they look written but unstaged.
>
> Ask: commit both files. Since the changelog makes `resolveCancelSelection`, `getUnroutedCancelOrdersRefusal` and `hasFeeSetter` public, add direct tests for them:
> - every `CancelSelection` kind;
> - empty-list cases: `{ orders: [] }`, `{ orderIds: [], symbols: ['BTC'] }` and `{ symbols: [] }` must resolve to `none`;
> - the multi-venue refusal and single-venue pass-through;
> - a provider with only `setUserFeeDiscount`.

**`packages/perps-controller/CHANGELOG.md:91`, 💬 Nit (signal over noise)**
> The changelog tells people upgrading from 24.0.0 what changed. Lines 91, 92, 93, 95 and 110 describe fixes to behaviour that only ever existed inside this unreleased PR: discovery double-counting, cross-venue legacy filters, the shared-allowance fee resolution, withdrawal attribution from tracing tags, and raw discovery messages. Line 92 also repeats the BREAKING entry at line 70.
>
> Ask: drop those five bullets and, where needed, fold their final behaviour into the Added/Changed entries for the same feature. Keep the "Fixed" entries that change behaviour that actually shipped in 24.0.0, such as line 94 (non-finite position values) and the structured cancel result instead of a throw.

## Replies for resolved threads

- **`CHANGELOG.md:124`**: Resolved. `## [24.0.0]` is byte-identical to `main`, all of this PR's entries (including the five BREAKING ones) are in `## [Unreleased]`, and new behaviour is credited to #11461 instead of #11421.
- **`TradingService.ts:2168`**: Resolved. A complete direct-venue discovery failure now goes through the same unresolved-target accounting as partial discovery: `BATCH_INCOMPLETE` plus `discoveryFailures`, with the venue taken from `protocolId` checked by `isPerpsProviderType`. An unknown protocol returns the code without inventing a venue. Both cases are tested.
- **`AggregatedPerpsProvider.ts:1262`**: Resolved. The multi-venue cancel merge now collects every venue's thrown or returned error into `CancelOrdersResult.failures` and sets `BATCH_INCOMPLETE`, matching `#mergeCloseResults`. The test checks that no venue's code wins by order.
- **Nits**: `TradingService.ts:1720` now always passes the reserved allowance, and the stale "history" comments at `PerpsController.ts:1518` and `:6729` are gone. The remaining two are consolidated into the missing modules and resolve once they're committed: the duplicated legacy-filter refusal (`PerpsController.ts:4048` / `TradingService.ts:2102`) and the duplicated fee-setter check. The cancel half of the selection-helper suggestion is done (discriminated union and exhaustive switch). The close half (`targets` / `closeAll` / `symbols` precedence repeated across seven places) is still open and remains non-blocking.
