# Review ledger — review-task-4489580830 (withdrawal route query in Core)

- Request: implement `docs/review-task-4489580830.md` — add a public `PerpsController` query reporting the venue `withdraw` will sign on, sharing `withdraw`'s resolution and `PROVIDER_ROUTE_REQUIRED` refusal. Do not change no-arg `getAccountSupport`, `withdraw`, or `PerpsAccountSupport`. No Mobile edits.
- Repository/client: `core` (`~/code/consensys/core`), base head `036923bb21e4df874e86ed0b62ff37d5a3f0ee4a`, reviewed content = working-tree diff (uncommitted, 9 files, +339).
- Consumer revisions: Mobile not re-inspected for this diff (no Mobile change in diff); the task records Mobile `702c143bdd9aed03d10f44a8ec9c7c6f92e6c103` as the baseline for the follow-up. Mobile call-site swap is explicitly out of scope (declared gap, not a finding against this diff).
- Tests executed, not just inspected: `yarn workspace @metamask/perps-controller run test` — 135 files, 7134 passed / 40 skipped, no type errors. Targeted: `PerpsController.operations.test.ts` (7 new cases), `PerpsController.default-provider.test.ts` (1 new migration case), `public-api.test.ts` (1 new export assertion).
- Commands: `yarn changelog:validate` (pass), `yarn lint:oxlint` (pass), `oxfmt --check` on touched files (pass after format), `yarn messenger-action-types:check` (pass after regenerate), `yarn readme-content:check` (pass). Grep of added diff lines for `react-native|Engine|Sentry|DevLogger|__DEV__|window\.|chrome\.` — no matches.

## Ledger

| Family | Rule | Outcome | Evidence |
| --- | --- | --- | --- |
| Base | Trace changed behavior caller→result, incl. error/boundary | PASS | `PerpsController.resolveWithdrawalRoute` reuses `#getUnroutedAggregatedWriteRefusal` before readiness and after `#getActiveProviderWhenReady`, then `#hasConflictingProviderRoute` throw and `AggregatedPerpsProvider.getWriteProviderId`/`#getDirectProviderId` for the venue — the same three-phase resolution `withdraw` uses (src/PerpsController.ts:3326). Route-required returned as a value; PROVIDER_NOT_FOUND thrown, matching `getAccountSupport`. |
| Base | Meaningful test coverage of changed behavior | PASS | 7 operations cases (direct hyperliquid/lighter, direct conflict, single-venue aggregated with saved Lighter default, multi-venue route-required + withdraw agreement + no `getAccountSupport` call, aggregated explicit venue, aggregated unknown venue) + 1 migration case (call queued across direct→aggregated init is refused post-ready, agrees with `withdraw`) + 1 public-api export case. Executed, all pass. |
| Base | Permissions / secrets / deps / product wiring | PASS | No dependency, flag, telemetry or locale changes in diff. |
| Base | Signal over noise | PASS | No TODOs, debug logs, dead code; doc comments state why (fail-open rationale). |
| Perps | Blocking anti-patterns | PASS | None found. |
| Perps | Controller Portability (Core) | PASS | No platform imports or host globals added (grep clean); venue resolution stays behind the provider abstraction; no deep imports. |
| Perps | Perps Math Comes From the Controller | NOT_APPLICABLE | No trading math in diff. |
| Perps | Shared Formatting & Display Precision | NOT_APPLICABLE | No displayed values. |
| Perps | Missing numeric data stays undefined | NOT_APPLICable | No numeric data flows through the new query. |
| Perps | Magic strings/numbers/placeholders | PASS | Error code uses `PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED`; `status` literals are members of the exported `WithdrawalRoute` union, not magic strings. |
| Perps | Protocol Abstraction | PASS | Resolution goes through `AggregatedPerpsProvider` (`instanceof` + `getWriteProviderId`/`hasProvider`), same as the refusal helper; no venue literal in `src/`. Test literals (`'hyperliquid'`, `'lighter'`) are `PerpsProviderType` keys, matching existing suite conventions. |
| Perps | Pro Mode UI Gating | NOT_APPLICABLE | No UI. |
| Perps | MetaMetrics Events | NOT_APPLICABLE | No events added. |
| Perps | Sentry Tracing | NOT_APPLICABLE | No tracing added. |
| Perps | Connection & WebSocket Architecture | NOT_APPLICABLE | No connection code. |
| Perps | Data Flow & State | NOT_APPLICABLE | Stateless read; no state written. |
| Perps | Trade Flow & Order Execution | NOT_APPLICABLE | Read-only query; no mutation, no pre-trade or refresh obligations. |
| Perps | Test Layer Coverage | PASS | Fixtures distinguish venues (resolved id `'lighter'` vs `'hyperliquid'` differ, so a wrong resolution fails); route-required case asserts `mockProvider.getAccountSupport` not called, so a regressions-to-Hyperliquid path fails the test. |
| Perps | Embedded Signer Boundaries | NOT_APPLICABLE | No signer/key material. |
| Core | Public controller contracts versioned/migration-aware | PASS | Additive method + messenger action + exports; consumer-style assertions in `tests/public-api.test.ts`; README documents the withdrawal use and the no-arg `getAccountSupport` split. Mobile adoption is a documented follow-up, not a coordinated break. |
| Core | Package release metadata matches contract impact | FINDING (nitpick) | Changelog entry under Unreleased/Added, additive ⇒ minor at release. Changelog links PR #11532, which does not exist yet (placeholder until the PR is opened). |
| Core | HyperLiquid multi-sig handling | NOT_APPLICABLE | No `HyperLiquidProvider` write changes. |
| Core | `#ensureUnifiedAccountEnabled` semantics | NOT_APPLICABLE | Not touched. |
| Core | Metered benefits strict improvement | NOT_APPLICABLE | No fee sources. |
| Core | Read-only account guards | NOT_APPLICABLE | No write path changes. |
| Core | One formatter surface | NOT_APPLICABLE | No formatting. |
| Core | Evidence expected before Core review | PASS (in-run) | Contract impact matrix: state unchanged; +1 method (`resolveWithdrawalRoute`), +1 messenger action, +2 exported types (`WithdrawalRoute`, `ResolveWithdrawalRouteParams`), no constant/event changes. Compatibility: additive, no client changes required; consumers checked against package tests only (clients not compiled — NOT_CHECKED by design for a branch-only review). |

## Gaps (not findings against the diff)

- The changelog PR link is a placeholder until a pull request exists.
- Client (Mobile/Extension/Terminal) integration against the new method is out of scope by the task; Mobile follow-up is specified in the task document.
- Package release itself was not performed (per task: do not publish).
