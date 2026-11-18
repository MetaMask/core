# PR #11206 review follow-up

Review: <https://github.com/MetaMask/core/pull/11206#pullrequestreview-5953260863>

Branch: `cursor/normalize-hyperliquid-errors-ae74`.
The review assessed pre-rebase commit `3c70fa77811`; the rebased starting point for these fixes was `bc1ef71713d` on base `b10c359477e`.

## Completed and verified in Core

- **4611184379 — mapping coverage:** added table-driven tests covering every entry in `HYPERLIQUID_ERROR_MAPPINGS`, including both position-flip and slippage spellings, network errors, order rejections, and timeouts. The table asserts stable codes, provider details, and original-cause identity.
- **4611184392 — reporting causes:** added `cancelOrder` and `flipPosition` tests using `attachProviderErrorCause`. They assert exact logged-error identity, original-cause identity, code-only public/analytics fields, and no venue text in serialized result/logging context. Existing no-attached-cause fallback tests remain.
- **4611184403 — copied test helper:** deleted `tests/helpers/normalizedCreateErrorResult.ts`. All ten provider suites and the shared strategy fixture install the production `createErrorResult` loaded through typed `vi.importActual`; the advanced-orders suite reuses its existing actual-module import.
- **4611184409 — analytics documentation:** documented the Hyperliquid-result-derived analytics `error_message` change under the existing breaking Unreleased changelog entry. Updated the live PR description's Events row and verified the returned body matches the requested update.
- **4611184415 — readiness duplication:** moved `createNotReadyResult` to a module-local builder shared by `prepareTradingWallet` and `isReadyToTrade`. Readiness tests cover unknown, mapped, and stable-code errors, plus `PRICE_MOVED` with and without details. Existing wallet-preparation tests still pass.
- **4611184421 — overwritten mock branch:** removed the obsolete mock-factory implementation; the real implementation is installed during setup. Applied the same cleanup to the other consumers of the deleted helper.
- **Core-boundary evidence nit:** added the exact production-added-lines grep to the live PR description. It found no client imports or host-global identifiers; the new `AggregateError` is an ES2021 builtin.

## Verification

- `yarn workspace @metamask/perps-controller run test run`: **141 files passed; 7,645 tests passed, 40 skipped**.
- `yarn lint:tsc:check`: **no new type errors** against repository suppressions; this does not mean the repository has no pre-existing suppressed errors.
- `yarn exec oxlint packages/perps-controller`: passed.
- Oxfmt on changed files and package `changelog:validate`: passed.
- Regression sensitivity: temporarily disabling the five reviewed mapping classifications and cancel/flip attached-cause handling produced **13 expected failing tests**. Both production files were restored before the passing runs.

Changes are uncommitted and unpushed. Only the PR description was edited remotely. Do not stage unrelated pre-existing untracked documents/artifacts.

## Remaining: cross-client verification and release coordination

These are intentionally **not claimed as verified**. GitHub metadata confirms the paired PRs are open, but metadata is not an integration test. No client checkout was modified or tested here.

### Mobile

1. Obtain the checkout for <https://github.com/MetaMask/metamask-mobile/pull/39018>; observed head: `0fb47c40971e5b07487e8b4c71bca7d4f340bdd2`, open/unmerged. Recheck its current head/state first.
2. Inspect `app/components/UI/Perps/utils/translatePerpsError.ts`: verify `isNoPositionFoundError` checks `POSITION_NOT_FOUND`, both post-only codes have translations, and `isPerpsErrorDetails` accepts the provider-tagged union without breaking `PRICE_MOVED` narrowing.
3. Run the PR's translation, close/TP-SL already-closed reconciliation, and edit-rejection tests against this Core error contract. Verify unknown codes have a safe fallback and consumers do not depend on raw venue text.
4. Coordinate merging that migration before Mobile bumps to the affected controller release. Do not merge client PRs without maintainer authorization.

### Extension

1. Obtain <https://github.com/MetaMask/metamask-extension/pull/47686>; observed head: `4247c76ec3af106fc8e4e88ad2d572924ff3302a`, open/unmerged. Recheck its current head/state first.
2. Inspect `ui/components/app/perps/utils/translate-perps-error.ts` and the changed close, TP/SL, and edit-margin consumers. Verify both post-only codes and `POSITION_NOT_FOUND` translate correctly, provider-tagged details pass runtime guards, and unknown codes have safe copy.
3. Run the relevant translation/component tests with the new Core contract and coordinate landing the migration before the controller dependency bump.

### Terminal

No Terminal checkout was tested. The existing PR/changelog claim that Terminal pins `^23.1.0` was inherited, not independently reverified here. The review requests no Terminal code change for this PR. Before a future upgrade, obtain its checkout, confirm the actual dependency, audit order/close reconciliation and direct `editOrder`/`cancelOrder`/`withdraw` error display, map both post-only codes, and test known/unknown-code translations and `POSITION_NOT_FOUND` behavior.

### Analytics rollout

The Core contract change is documented and cancel/flip tests pin code-valued failed-event properties. Dashboard configuration was not inspected or changed. If dashboards currently group by venue sentences, coordinate code-based `error_message` buckets with their owners, including the broader `UNKNOWN_ERROR` bucket.
