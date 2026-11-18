# Handoff — remaining review findings for PR 11461 (branch `TAT-4392-exchange-each-its-own`)

Review source: `artifacts/review.md` / `artifacts/line-comments.json` (verdict REQUEST_CHANGES at `06dafcb`). This handoff covers the findings **not** yet fixed in this working session. Do these on top of the provider-layer fixes already applied (see "Done" below).

## Done in this session (context — do not redo)

All in `packages/perps-controller/`. Tests: full package suite green (7,089 passed), `tests/src/providers/AggregatedPerpsProvider.test.ts` 212 passed, `tsc --noEmit` on `tsconfig.json` shows no errors in touched files (remaining TS6305/`messenger`-related noise is pre-existing, from unbuilt project references).

1. **Finding @AggregatedPerpsProvider.ts:690 (strict aggregated reads)** — the multi-venue `getAccountState` fan-out now passes `{ ...params, throwOnUnavailable: true }` so Lighter's lenient empty-state default cannot be classified as `available` zero balances. Single-venue passthrough still forwards params untouched. Tests: "forces a strict read in the aggregated fan-out…", "keeps direct read defaults when only one venue is registered".
2. **Finding @AggregatedPerpsProvider.ts:1113 (one-venue cancel misrouting)** — the single-venue `cancelOrders` branch partitions targets: untagged + own-venue targets go to the loaded provider's batch; foreign-venue targets get per-target `PROVIDER_NOT_FOUND` failures and are never forwarded; all-foreign batches return a failed result without calling any provider; foreign targets are appended after the venue's own results and counted in `failureCount`. Tests: three new cases in "Mixed-venue batch routing".
3. **Finding @AggregatedPerpsProvider.ts:~1345 (closeAll precedence)** — in the multi-venue `closePositions` branch, order is now targets → `closeAll === true` fans out to every venue (symbols ignored) → refuse symbols-only with `PROVIDER_ROUTE_REQUIRED` → empty request fans out. Tests: "lets closeAll override a legacy symbols list…", single-venue `closeAll` passthrough test.
4. **Finding @AggregatedPerpsProvider.ts:~1966 (one-provider account stream shape)** — `subscribeToAccount` now mirrors `getAccountState`: with one registered venue it subscribes directly and emits `{ ...account, providerId }` (top-level `crossMarginSummary`/`subAccountBreakdown` preserved, no `providerStates`/`aggregate`), and forwards `null` as `null`. Tests: "keeps the direct stream shape when only one venue is registered", "passes a null single-venue update through as no data, not zero".
5. **Finding @src/index.ts:255 (public export assertions)** — `tests/public-api-types.ts` now imports `PerpsProviderAccountStateEntry`, `AccountAggregateMetadata`, `ClosePositionsTarget`, `ClosePositionsParams`, `AccountState`, `PerpsProviderType` through `@metamask/perps-controller` (resolves to `dist/index.d.ts`) and asserts their exact shapes in a new `AggregatedAccountConsumerContracts` type.

No changelog entry was added: these are fixes to behavior introduced within this same unreleased PR branch, which is already described by the existing Unreleased entries. Re-check after the remaining findings land.

## Remaining finding 1 — TradingService batch-close fee pricing (@src/services/TradingService.ts:~1372, must_fix)

**Problem.** `#resolveBatchCloseNotionalUsd` prices the batch-close fee from a target set that no longer matches execution:

- It filters positions through `#positionsForWriteRoute`, which keeps only positions whose `providerId === provider.getWriteProviderId()` (the default venue). But the aggregator's `closePositions` now fans out: `closeAll` closes **every** venue, and tagged targets can name only a non-default venue. Consequences: a mixed close-all under-prices (excludes non-default venues' notional), and a Lighter-only target resolves `undefined` notional, which `#calculateFeeDiscountWithMeasurement` reads as "no notional to blend against" → full waiver.
- Precedence also differs from execution: this method checks `closeAll` before `targets`, while execution gives non-empty `targets` precedence. (The aggregator branch fixed in this session now orders targets → closeAll → symbols; make fee pricing agree.)

**Ask.** Derive pricing from the actual fan-out/target predicate:

- Fetch positions via the aggregator (`provider.getPositions()` returns all venues, tagged with `providerId`).
- Selection predicate: `targets` non-empty → positions matching by `(symbol, providerId)`; else `closeAll === true` → all positions; else `symbols` → symbol filter; else all.
- Do **not** apply `#positionsForWriteRoute` for the fan-out cases — that filter is only correct for a single default-venue write (legacy symbols/close path). Consider keeping it for the legacy symbols path only.
- "Use venue-appropriate fee scopes for fan-out": `rewardsIntegrationService.resolveFee(notional, { providerId, isTestnet })` takes a single `PerpsFeeResolverScope` (`src/types/index.ts:2629`). A multi-venue fan-out closes on several venues with potentially different scopes/fees. Decide (with the fee-resolver owners if needed) whether to (a) resolve once per venue and combine, or (b) resolve against the default venue's scope with combined notional. Option (a) is semantically right; check what `resolveFee` supports before choosing.
- Update the stale test `'prices a batch close only from positions the route can close'` in `tests/src/services/TradingService.test.ts` — it currently documents the old behavior (only HyperLiquid's $25,000) and hides the regression. Add coverage for: `closeAll` (both venues' notionals summed), mixed/non-default targets, and `targets` + `closeAll` (targets win).

## Remaining finding 2 — Historical balance provenance (@src/PerpsController.ts:~7494, must_fix)

**Problem.** In `subscribeToAccount`'s state update, `perpsBalances` entries carry `accountValue1dAgo` forward from the previous entry with the **same provider key only** — no account or network check. `perpsBalances` is keyed by provider id and persisted; the selected-account handler refreshes preload data but does not clear/re-key these entries. Both the aggregated path (line ~7494) and the direct path (~7512–7518) carry `previous.accountValue1dAgo` forward. After an account switch or testnet/mainnet switch, the first new snapshot combines the new context's current balance with the **prior context's** 1d-ago value. Mobile consumes this field for portfolio daily change, so it substitutes another context's balance for missing history.

**Ask.**

- Track provenance for the carried `accountValue1dAgo`: record the account (`CaipAccountId`) and network (chainId/isTestnet) that produced it alongside the entry in `PerpsState.perpsBalances` (`src/PerpsController.ts:~465`). Note this shape is persisted, so a versioned/migration-safe change may be needed — check how `perpsBalances` is persisted and hydrated.
- Before carrying `accountValue1dAgo` forward, validate the previous entry's account+network match the current context; otherwise omit the field (fresh entry, no history) — never fabricate from the current balance (that invariant is already documented in the type comment at ~465).
- Also clear/omit entries on context changes: check the selected-account handler and the network-change path (`#findNetworkClientIdForChain`, isTestnet toggles) for where `perpsBalances` should be re-keyed or dropped.
- Tests in `tests/src/PerpsController.state.test.ts` (or subscriptions tests): account-switch and network-switch cases asserting the first snapshot after the switch has no `accountValue1dAgo` (or a provenance-correct one), and that same-context updates still carry it forward.

## Remaining NOT_CHECKED items from the review (not code fixes)

- Re-run the full verification at the final head and record exact results in the review ledger: `yarn workspace @metamask/perps-controller run test:coverage`, `yarn lint` (note: `yarn lint:eslint` deletes `packages/*/dist` — rebuild afterward with `yarn build`, since `tests/public-api-types.ts` resolves types through `dist/index.d.ts`), `yarn changelog:validate`.
- Consumer compilation is still outstanding: Mobile `d4a1867` and Extension `803491c` must compile against this head in their upgrade PRs. Terminal has no controller reference.
- If strict-read semantics change further, re-check adapter documentation per the review's provider-documentation item.

## Verification commands used this session

```
yarn workspace @metamask/perps-controller run test            # 132 files, 7,089 passed
yarn exec oxlint <changed files>
yarn exec oxfmt --check <changed files>
cd packages/perps-controller && yarn exec tsc --noEmit -p tsconfig.json
```
