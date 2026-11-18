# Per-exchange account data and routing: implementation handoff

## Start here

Implement the work in `docs/exchange-each-its-own.md` for `@metamask/perps-controller` in MetaMask/core. First independently review the current source, instructions, tests, related changes, and provider documentation. Own that review: this handoff is starting evidence, not a substitute for checking whether assumptions are stale, already solved, unsafe, or better addressed differently. Raise substantive ambiguities before committing to an incompatible public contract.

The user explicitly approved the API direction and test seams below. They then requested this Markdown implementation spec **instead of implementation in this session**. No production code or tests were changed, and no tests, builds, typechecks, or formal Perps review were run. Do not mistake the existing working tree for work produced by this handoff.

### Observed starting state

- Core HEAD at inspection: `50546643512`. Re-check before starting.
- Package version at inspection: `23.1.0`.
- The working tree already contained untracked `Support/`, `docs/core-pr-11421-description.md`, `docs/core-pr-11421-review-reply.md`, `docs/exchange-each-its-own.md`, `docs/review-task.md`, and `packages/perps-controller/docs/`. Preserve unrelated user work.
- `~/code/consensys/terminal-backend` was clean at `b61ee0d` (`Merge pull request #92 from consensys-vertical-apps/feat/lighter-info-client`). No concrete backend blocker was identified. Relevant cross-repository contracts have **not** been fully reviewed, so this is not proof of independence.
- Dependency in the original request: TAT-4385, default provider and explicit per-trade routing. The checkout already contains related default-provider logic, route-required guards, tests, and Unreleased changelog entries referring to Core PR #11421. Reconcile the new behavior with those changes; do not blindly replace them.

## Goal and scope

In aggregated mode, expose Hyperliquid and Lighter account states separately and a correctly identified combined total. Persist live per-provider balances, route mixed-venue batches and venue-specific market streams correctly, aggregate money-movement routes, and attribute money-movement records to their initiating venue. Direct/single-provider modes must retain their established behavior.

Out of scope: client UI implementation, new exchange infrastructure, implementing all of Lighter money movement, live funded trading, and publishing a package from the agent session. Prepare the change for the normal release process; publication remains an explicit outstanding acceptance criterion until the release team actually publishes it.

## User-confirmed decisions

1. **Account result direction:** retain top-level `AccountState` numeric fields as the combined total and add optional `providerStates`, keyed by provider. Direct-provider results retain their existing shape.
2. **Unavailable providers:** expose available providers and explicit unavailable/missing entries. Never substitute zero for a failed read or silently present a partial total as a complete portfolio total.
3. **Batch close compatibility:** extend `closePositions` with provider-tagged targets while preserving existing calls. `closeAll` must fan out to enabled venues in aggregated mode.
4. Follow existing Perps conventions and the actual Hyperliquid/Lighter documentation rather than imposing one venue's semantics on the other.
5. Publication is a release follow-up, not permission to publish now.

The exact names/types of completeness metadata, provider-tagged close targets, and per-result venue attribution were not individually approved. Choose the smallest coherent public API satisfying these decisions, document it, and ask if that requires changing the agreed semantics.

## Confirmed test seams and what coverage means

The user approved these boundaries and expressed concern about what they do not cover. Do not use that as permission to ignore integration risks.

| Public seam | Required observations | Boundary limits and mitigation |
| --- | --- | --- |
| `AggregatedPerpsProvider` account reads/subscriptions | Per-provider identity, totals, explicit unavailability, fan-out, stream updates, teardown | Not a live exchange test. Check real provider adapter contracts and documentation; use representative venue fixtures where adapters are affected. |
| `AggregatedPerpsProvider` public batch and market-stream methods | Mixed-venue routing, venue-attributed outcomes, explicit stream routing, errors and cleanup | Does not prove exchange settlement. Exercise real aggregation/routing code; fake external venue boundaries, not the router or multiplexer under test. |
| `PerpsController` public methods plus observable state | `perpsBalances`, REST/stream consistency, initiating-venue money-movement records, route guard integration, direct-mode regressions | Does not exercise a client UI. Inspect public consumers and caches, record compatibility/migration impacts, and add package-level consumer-style tests for changed contracts. |

Test through these seams. Do not test private methods or create tests that only duplicate the implementation. Existing provider doubles may be useful as venue-boundary test fixtures; do not mock away the behavior being implemented. If an additional seam is needed, obtain agreement before adding tests there.

## Behavior specification

### 1. Aggregated account reads

`AggregatedPerpsProvider.getAccountState` must query every active provider, preserve each account's provider identity, and return `providerStates` plus top-level aggregate values.

- Use decimal-safe arithmetic; `bignumber.js` is already a dependency. Do not sum USD strings with binary floating-point arithmetic.
- Sum additive USD fields: `totalBalance`, `spendableBalance`, `withdrawableBalance`, `marginUsed`, and `unrealizedPnl` from available, valid venue results.
- `returnOnEquity` is a rate, not an additive balance. Confirm the controller's account-level units, define the correct combined calculation and zero-denominator behavior, and document them. Do not sum percentages or take an unweighted average. Distinguish account-level RoE from position-level RoE.
- Keep venue-local `crossMarginSummary` and `subAccountBreakdown` under the corresponding provider entry unless a documented aggregate representation is justified. Identical subaccount names at different venues must not collide. Do not imply that cross-venue collateral is mutually usable.
- Do not stamp the combined total with the current default provider's identity. Each provider entry is attributed to the provider that actually served it, captured before awaiting asynchronous work.
- Represent each enabled venue's unavailable/pending state explicitly. A map containing successful entries alone is insufficient if it cannot distinguish disabled from failed/not-yet-loaded venues.
- Add an explicit completeness/unavailability contract. If top-level fields contain a subtotal while a venue is unavailable, metadata must identify that subtotal as incomplete; document consumer requirements. If no venue has usable data, do not manufacture an all-zero successful total. Define the read failure/stream-null behavior consistently with existing public contracts.
- A real zero balance or a confirmed nonexistent exchange account is not automatically an infrastructure failure. Check each provider's documented semantics and existing error classification.
- Lighter has `GetAccountStateParams.throwOnUnavailable`. Use the strict-read path where necessary so a failed read is not mistaken for an empty account; do not change direct-provider defaults merely to implement aggregation.
- Keep standalone discovery supported and respect account/network generation guards.

**Worked test fixture:** Hyperliquid returns balances `1000.10`, `700.05`, `600.02`, margin `200`, and PnL `30`; Lighter returns `250.20`, `150.15`, `120.08`, margin `50`, and PnL `-5`. Expected aggregate balances are `1250.30`, `850.20`, `720.10`, margin `250`, and PnL `25` (allow canonical decimal-string normalization). These literal expected values are independent of the implementation. Choose separate RoE fixtures that expose incorrect rate weighting.

### 2. Aggregated account subscriptions

Use the existing multiplexer fan-out rather than keeping account subscriptions default-routed.

- Every enabled venue is subscribed; callback results include the current per-venue states and total under the same contract as reads.
- After the first venue emits and before the second emits, the aggregate is explicitly incomplete.
- A venue's `null` update invalidates that venue's balance. Do not retain its previous value as current or turn it into a real zero.
- Changing the routing default must not drop the other venue's account subscription or erase a still-valid all-venue account total.
- Forward applicable subscription parameters such as account identity through the multiplexer.
- Cleanup must cover all subscriptions, partial setup failures, late callbacks, and reconnect/provider replacement. Guard against callbacks from an old account/network/provider generation.
- The multiplexer currently owns provider-keyed caches. Check whether simultaneous account subscriptions can interfere with each other's data or cleanup; add behavioral coverage through the confirmed public seam if this affects the new behavior.

### 3. Controller balance state and caches

Write `perpsBalances[providerId]` from live account updates. REST account updates and preload paths must not contradict the stream's venue attribution.

- Each available enabled provider gets its own balance entry, including `totalBalance`, `unrealizedPnl`, and `lastUpdated`.
- Invalidation/unavailability must have an explicit policy: remove or mark stale/unavailable rather than continue exposing a stale entry as live. Reconcile this with persisted/historical state semantics.
- `accountValue1dAgo` is currently required in each balance entry but is **not** supplied by `AccountState`. Preserve valid historical data or obtain it from its proper source. Do not fabricate zero/current balance as a historical observation. If unknown must be modeled differently, make the type/state migration and compatibility implications explicit.
- Avoid adding a synthetic `aggregated` balance entry that duplicates venue totals.
- Update `accountState`, timestamps, errors, and balance entries coherently. Clear/invalidate state appropriately for account changes, network switches, disabled venues, and unavailable updates.
- Preserve direct-provider behavior and do not infer direct-mode venue identity from an unrelated saved default.
- Update aggregated user-data preload/cache bucketing: the total must never be stored in Hyperliquid's bucket merely because the aggregate lacks a `providerId`. Each available provider account goes into its own bucket.
- Inspect cached snapshot consumers for any assumption that there is only one default account state. Do not put aggregate data into a venue-specific snapshot type without adapting that contract.

### 4. Batch cancel and close routing

There are two distinct cancel interfaces in the checkout: the controller's filter-oriented `CancelOrdersParams` and the provider's explicit `BatchCancelOrdersParams` array. Trace both end to end.

- Add provider identity to explicit cancel targets and support grouping mixed-venue requests by that identity.
- Extend close parameters with provider-tagged targets while preserving existing direct-mode `{ symbols?, closeAll? }` calls.
- `cancelAll`/`closeAll` in aggregated mode apply to every enabled provider. Explicit targets only apply to their named provider.
- Never resolve duplicate symbols or order IDs across venues by choosing the default provider. Venue identity is execution identity.
- For legacy ambiguous targeted requests in multi-venue mode, preserve the route-required safety principle; ask if a different compatibility policy is needed. Do not silently guess a venue. Unambiguous direct/single-venue cases remain supported.
- Update controller/service guards: the existing blanket rejection of all multi-venue batches must not prevent valid explicitly routed targets or intentional all-venue operations from reaching aggregation.
- Preserve existing protections for unrelated unrouted writes, read-only accounts, and other trade safety checks.
- Combine batch counts and success using established result semantics; successful work on one venue must not be hidden by another venue's rejection/throw/unsupported batch API.
- Attribute results to venues so overlapping order IDs/symbols are distinguishable. Represent invalid/unavailable routes and batch-level failures explicitly rather than silently dropping them.
- Handle empty input, mixed success/failure, and absent optional provider batch methods deliberately. Do not invent a fallback execution strategy without examining existing provider contracts.

### 5. Venue-specific market subscriptions

Add optional `providerId` to relevant public parameter types and route `subscribeToCandles`, `subscribeToOICaps`, and `subscribeToOrderBook` accordingly.

- An explicit Lighter route must reach Lighter even if the default is Hyperliquid, including when both venues list the same symbol.
- An explicitly routed subscription remains pinned when the default changes.
- If no explicit route is supplied, preserve the existing default-routed behavior and rebind semantics for these streams.
- Reject/report an invalid or unavailable explicit route; never silently subscribe to a different venue.
- Preserve existing error callbacks, account parameters, cleanup, and direct-provider semantics. For OI caps, verify what each venue actually supports; routing to Lighter does not authorize fabricating unsupported exchange data.

### 6. Routes and money-movement attribution

- `getDepositRoutes` and `getWithdrawalRoutes` return supported routes from every active provider, each tagged with `providerId`. Forward filtering parameters; a provider with no supported route contributes none.
- Do not collapse identical asset/chain routes belonging to different venues.
- Inspect route consumers/transaction preparation to ensure choosing a route retains its venue. Listing a route must not suggest an unsupported money-movement capability is implemented.
- Add `providerId` to newly created deposit/withdrawal request records in controller state. Capture the initiating venue before asynchronous preparation/execution and keep it fixed through later status updates/default changes.
- Existing persisted records may lack venue identity. Maintain a migration-compatible representation; do not relabel old records using today's default.
- Check account/network identity binding in delayed completion/balance trackers. Do not claim to fix unrelated backend money movement or silently add unsupported Lighter operations.

## Source map and integration traps

Line numbers are deliberately omitted; search the named symbols in the current checkout.

| Area | Relevant files / symbols | Observed behavior to reconcile |
| --- | --- | --- |
| Aggregation | `packages/perps-controller/src/providers/AggregatedPerpsProvider.ts` | `getAccountState` reads only the default and stamps its captured ID. Account and the three market streams use `#trackDefaultRoutedSubscription`. Routes and batches delegate to default. |
| Multiplexing | `src/aggregation/SubscriptionMultiplexer.ts` | `subscribeToAccount` already emits `AccountState[]`, tags by provider, and deletes a cached venue on `null`. `MultiplexedAccountParams` currently exposes providers/callback, not account identity. |
| Public types | `src/types/index.ts` | `AccountState`, `GetAccountStateParams`, subscription params, `AssetRoute`, batch params/results, provider interface. Explicitly export any new public types. |
| Controller state/stream | `src/PerpsController.ts` | `perpsBalances` is declared/defaulted but not populated. `subscribeToAccount` writes only non-null snapshots and does not clear state on `null`. |
| REST write guard | `PerpsController.getAccountState`, `src/services/MarketDataService.ts`, service context types | The controller supplies an `isCurrent` check tied to direct/default venue; the service writes account state after that check. Aggregate results and stale-context rejection need coordinated changes. |
| Default changes | `PerpsController.setDefaultProvider` and aggregated default-routed subscription helpers | Existing default-change account invalidation reflects the old single-default account model. Preserve market-stream behavior while changing aggregate account semantics. |
| User caches | `PerpsController` user-data preload, provider cache helpers/consumers | Preload assigns one account result to `accountState.providerId ?? 'hyperliquid'`. This would misbucket an aggregate total. |
| Trading | Controller `cancelOrders` / `closePositions`, `src/services/TradingService.ts` | Controller uses filter-style cancel params; aggregated provider uses explicit targets. Existing multi-venue safety guards refuse batches. Trace conversion and validation, not only provider methods. |
| Deposit records | `PerpsController` deposit flow, `src/services/DepositService.ts` | Deposit request construction currently lacks venue attribution. |
| Withdrawal records | `src/services/AccountService.ts`, controller withdrawal flow | Withdrawal request construction currently lacks venue attribution. |
| Venue semantics | `src/providers/HyperLiquidProvider.ts`, `src/providers/LighterProvider.ts`, `src/utils/hyperLiquidAdapter.ts`, `src/utils/lighterAdapter.ts` | Lighter has strict unavailable-read support. Hyperliquid account adapter computes account RoE as percentage points; inspect the Lighter **account** adapter separately rather than assuming position units apply. |

Paths in the table beginning with `src/` are relative to `packages/perps-controller/`.

Existing tests are under `packages/perps-controller/tests/`, not alongside source. Start with:

- `tests/src/providers/AggregatedPerpsProvider.test.ts`
- `tests/src/aggregation/SubscriptionMultiplexer.test.ts`
- `tests/src/PerpsController.subscriptions.test.ts`
- `tests/src/PerpsController.default-provider.test.ts`
- `tests/src/PerpsController.state.test.ts`
- `tests/src/PerpsController.operations.test.ts`
- Relevant trading/service/provider-cache tests and existing helpers.

Do not merely delete old default-provider assertions. Replace assertions whose semantics intentionally change, while retaining protection for routing, default-pinned market streams, explicit direct mode, fallback, and stale-response handling.

## Provider documentation and cross-repository check

Before finalizing semantics, inspect current official documentation and compare it with the installed SDK/types and current adapters:

- Hyperliquid developer API documentation: info/account reads, account models, cross-margin versus total account state, withdrawals/unified balances, WebSocket account/market subscriptions, and batch cancel behavior.
- Lighter API documentation: account reads, account absence versus request failure, collateral/PnL/margin fields, subscription payloads and market IDs, batch operations, and actually supported OI/money-movement capabilities.
- Starting documentation sites, not verified during this handoff: `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api` and `https://apidocs.lighter.xyz/`.

Record concrete documentation references and the conventions they establish. Preserve opaque venue identifiers at provider boundaries; do not route by display symbols alone.

Inspect the relevant `terminal-backend` checkout/API contracts and record its revision. If an account field, stream, or route depends on pending backend changes, name the precise missing capability/change and which acceptance criteria it blocks. Distinguish a backend blocker from a client migration or package-release dependency. Check available Mobile/Extension/Terminal consumers for affected account reads, stream payloads, caches, batch signatures, and route selection; report unavailable checkouts as unverified, not compatible.

Browser tooling was not available in this session: the expected local browser skill file was absent and `agent-browser` was not on PATH. A receiving agent should check its own environment and locate the configured browser skill/tool. No provider web documentation was fetched, and no claim of documentation conformity has been established.

## TDD and validation workflow

The user asked to call the shared `tdd` Skill tool where possible, at the agreed seams, and to run typechecking and individual test files regularly, then the full suite once at the end.

- Prefer the actual Skill tool if available. This session had no such tool, so the skill was read directly from `~/code/consensys/skills/domains/planning/skills/tdd/SKILL.md`, plus `tests.md` and `mocking.md`. A coding-domain variant also exists at `domains/coding/skills/tdd/skill.md`; resolve the installed skill rather than inventing a tool invocation.
- Read applicable repository instructions, any domain glossary/ADRs, and skill references before writing tests.
- Work in vertical slices: one public behavior test → demonstrate the relevant failure → minimal implementation → rerun the focused test → typecheck. Do not write a speculative batch of tests first.
- Suggested order: aggregate REST account result; partial/unavailable result; aggregate stream; controller balance/state propagation and cache bucketing; mixed-venue cancel; close-all and tagged close targets; explicit market streams; route enumeration and transaction attribution; direct-mode/edge regressions.
- Use real aggregation/multiplexer/controller logic in the relevant tests. Fake network/venue boundaries. Do not mock the internal collaborator whose behavior is under test.
- Include failures, nontrivial numeric values, differing venue emission order, same-symbol/same-order-ID collisions, default changes, stale callbacks, partial setup cleanup, and direct/single-venue fallback.

Typical commands, from the repository root (confirm current tool versions/config):

```sh
# Establish the repository's Yarn 4 environment; do not use global Yarn Classic.
corepack enable
yarn --version

# Focused runs, repeatedly during implementation.
yarn workspace @metamask/perps-controller run test run tests/src/providers/AggregatedPerpsProvider.test.ts
yarn workspace @metamask/perps-controller run test run tests/src/PerpsController.subscriptions.test.ts

# Regular typecheck; use the repository's supported typecheck workflow.
# This package build checks production types but not the entire test surface.
yarn workspace @metamask/perps-controller run build
# Include the lint/test TypeScript project as appropriate; inspect baseline
# suppressions and configuration rather than hiding newly introduced errors.
yarn lint:tsc:check

# Formatting/linting and public messenger contract consistency.
yarn exec oxfmt --check <changed-files>
yarn exec oxlint <changed-typescript-files>
yarn workspace @metamask/perps-controller run messenger-action-types:check

# Validate the changed changelog, then run the repository validation requested
# by AGENTS.md; report unrelated failures separately.
yarn workspace @metamask/perps-controller run changelog:validate
yarn changelog:validate

# Once at the end: ALL perps-controller tests, not only changed files.
yarn workspace @metamask/perps-controller run test run
```

If messenger signatures require generation, use the existing generator and inspect its diff. Do not hand-edit generated contracts inconsistently. Run broader monorepo tests if changed shared code warrants them; do not describe the package suite as the entire monorepo suite. Report exactly which suite ran. A command above is an instruction, not evidence that it has run.

## Changelog, compatibility, and release

Update `packages/perps-controller/CHANGELOG.md` and public documentation with the new contract, unavailable/partial semantics, batch routing, explicit stream parameters, and migration guidance.

- Include a `**BREAKING:**` note for changed aggregate account semantics/shape or other contract/default behavior that existing consumers rely on, even if new TypeScript properties are optional.
- Reconcile existing Unreleased statements that account streams follow the default, account reads use only that venue, and multi-venue batches are always refused. Avoid contradictory release notes.
- Explain how clients access venue-specific values versus combined/subtotal values, how they recognize unavailability, and why combined spendable/withdrawable balances are not a single execution venue's limits.
- Follow repository changelog/link and release tooling conventions. Do not invent a PR number or claim a package version is published.
- Inventory state/method/event/export/constant impact. Document legacy persisted-state handling for newly attributed requests and any balance-history change.
- Do not manually bump/publish unless explicitly authorized by the established release workflow. Track original AC6 as pending release until there is actual publication evidence.

## Required final static review

After implementation and validation, invoke `perps-review-pr` from `~/code/consensys/skills` using the Skill tool where available. If unavailable, load the source skill directly and state that fallback accurately:

- `domains/perps/skills/perps-review-pr/skill.md`
- `domains/perps/skills/perps-review-pr/repos/core.md`
- Applicable references selected by the skill.

This review is static/read-only: no tests, builds, installs, probes, product changes, releases, or workspace cleanup during the review itself. Record existing execution evidence rather than rerunning commands under the review. Follow its report/ledger requirements, cross-repository checks, and blocking finding policy. If fixes follow a review, exit the static review to make/test them and review the resulting diff again.

## Acceptance and final handoff

Deliver a concise implementation summary and evidence against each criterion:

1. **AC1:** aggregate totals match the available per-venue values, with a tested explicit completeness contract and correct rate semantics.
2. **AC2:** live controller balances are provider-keyed, updated from streams, and safely invalidated; historical values are not fabricated.
3. **AC3:** mixed-venue cancel/close requests reach only their intended venues; all-venue operations fan out and report partial failures.
4. **AC4:** explicitly routed Lighter candle/OI-cap/order-book subscriptions reach Lighter and remain pinned.
5. **AC5:** direct/single-provider behavior is preserved, including default/fallback routing and supported legacy signatures.
6. **AC6:** changelog/release preparation is complete; report publication separately and honestly as outstanding unless independently verified.

Also report documentation references checked, consumer compatibility/migration requirements, actual typecheck/focused/full-suite outcomes, static-review findings, and any exact `terminal-backend` dependency. Do not push, merge, publish, post comments, or change issue/PR state without explicit authorization.
