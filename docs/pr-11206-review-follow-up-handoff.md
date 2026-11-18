# PR #11206: consumer compatibility follow-up

I want to discuss and possibly finish the consumer compatibility follow-up for [MetaMask/core#11206](https://github.com/MetaMask/core/pull/11206), prompted by [review 5933416802](https://github.com/MetaMask/core/pull/11206#pullrequestreview-5933416802).

## Before changing anything

Please independently review the current code, tests, repository instructions, GitHub PRs, and CI. You own that review; the evidence below is a starting point, not a compatibility verdict. Decide whether the remaining work is still real, already solved, stale, or better handled differently. Call out anything that should stop adoption before making changes.

Find the appropriate repository from the current directory, a parent directory, or the usual workspace. Re-check live revisions: neither consumer PR was merged when inspected. Do not push, merge, close issues or PRs, label, or post comments or PR-description edits without explicit authorization.

## Core changes completed locally

Repository: `MetaMask/core`; branch: `cursor/normalize-hyperliquid-errors-ae74`. Starting local HEAD was `764c893691a`; the reviewed GitHub PR head was `3171400139856d6e81ab1931b2398aef4b256640`. Work is uncommitted. Preserve unrelated pre-existing untracked documents and review artifacts.

- `HyperLiquidProvider.prepareTradingWallet` now uses one normalized failure builder, including early `KEYRING_LOCKED` and `EXCHANGE_ACCOUNT_NOT_FOUND` returns. Normal pending setup still returns `{ ready: false }` without an error. Existing no-signing/no-Sentry behavior is preserved. Provider and controller integration assertions were updated.
- Non-OK `withdraw3` status responses remain debug-only rather than being routed through `#reportWriteError`. Returned fields are still normalized and the diagnostic remains the internally attached error's cause. Three regression cases cover insufficient balance, an unfunded account, and an unclassified rejection, including an explicit assertion that `logger.error` is not called. Thrown exceptions retain the existing reporting path.
- The changelog removes the false `replacePositionTPSLLeg` fix: the PR base already used `operationName`. It now documents exported `createErrorResult`, normalized early readiness failures, Mobile's already-closed migration, and Terminal's unverified compatibility.
- Both `errorUtils` nits are fixed: the stale `status 503` ordering explanation was replaced, and the minimum-value regex is `/order must have minimum value/iu`. A raw prefixed minimum-value regression case was added.

## Confirmed Mobile evidence

[MetaMask/metamask-mobile#39018](https://github.com/MetaMask/metamask-mobile/pull/39018) was open at head `0fb47c40971e5b07487e8b4c71bca7d4f340bdd2`.

- `isNoPositionFoundError` checks the stable `POSITION_NOT_FOUND` code before its legacy raw-message fallback.
- Translator tests cover a normalized provider-tagged `POSITION_NOT_FOUND` result.
- `usePerpsClosePosition` tests cover a normalized already-closed result, the already-closed toast, positions/account-state cache invalidation, and CUF reconciliation without generic error logging.
- `usePerpsTPSLUpdate` tests also cover code-based already-closed handling, cache invalidation, and CUF reconciliation.
- [Commit 9cee1e18418fc1c0bb745ebd6bbc4da9bb4e4002](https://github.com/MetaMask/metamask-mobile/commit/9cee1e18418fc1c0bb745ebd6bbc4da9bb4e4002) introduces the helper change and close reconciliation test. Use the inspected PR head for the complete evidence, including TP/SL coverage.
- These are source/test inspections through GitHub APIs, not a claim that Mobile tests were executed in this Core session.

[MetaMask/metamask-extension#47686](https://github.com/MetaMask/metamask-extension/pull/47686) was open at head `4247c76ec3af106fc8e4e88ad2d572924ff3302a`. Its error translation diff was inspected, but a full Extension compatibility audit and test run were not performed.

## Remaining work: Terminal adoption audit

Terminal is **not proven compatible**. Do not infer compatibility from the local checkout: local HEAD `d07759de8dc572b5b427d10a525982ce8f555440` predates its controller integration and uses the Hyperliquid SDK directly.

Current GitHub evidence is materially different:

- Repository: `consensys-vertical-apps/va-mmcx-terminal`.
- Inspected `main`: [9241d87f9b321a7369ec12e059ebfe47c57e1b79](https://github.com/consensys-vertical-apps/va-mmcx-terminal/commit/9241d87f9b321a7369ec12e059ebfe47c57e1b79).
- The dependency manifest declares `@metamask/perps-controller: ^23.1.0`.
- `ControllerPerpsProvider.closePosition` goes through `toSubmissionResult`, which forwards `result.errorCode` into `toOrderFailure`. The mappers already recognize `POSITION_NOT_FOUND` as an order-refusal reason, but no `ORDER_POST_ONLY_*` mapping was found in the inspected mapper module.
- `useExplainRefusal` localizes a result's `refusal` field. The inspected close mutation invalidates trading queries on success and calls `onError` on failure; it does not by itself establish Mobile-style already-closed reconciliation. Whether Terminal needs equivalent reconciliation is an independent product/code-review question.
- Some wrappers, including `ControllerPerpsProvider.cancelOrder`, rebuild `{ success, error }` and drop other error fields. Audit their consumers before claiming this is harmless.

Please review Terminal's full error pipeline, including controller mappers, `toOrderFailure`, `toSubmissionResult`, `toOrderRefusal`, `useExplainRefusal`, close/TP-SL hooks, edits, and financial/readiness result consumers. Verify stable-code handling, retryable unknown-error copy, provider-tagged details and `PRICE_MOVED` narrowing, post-only edit cancellation semantics, and any already-closed cache reconciliation required by its UX. Test those behaviors against the exact Core artifact intended for adoption. Do not restore raw venue prose to Core results as a compatibility workaround.

If Terminal needs changes, prepare a scoped migration proposal or patch in its own repository, identify the owner and intended package version/preview, and link a coordinated client PR before adoption. Do not expand this Core patch speculatively. No Terminal tests were run here.

## Suggested Core PR-description/review note

The following text is prepared locally, **not published**:

> Compatibility: Mobile's paired PR #39018 migrates `isNoPositionFoundError` to `POSITION_NOT_FOUND` and includes normalized close and TP/SL reconciliation tests (inspected at `0fb47c40971e5b07487e8b4c71bca7d4f340bdd2`; initial helper/close test commit `9cee1e18418fc1c0bb745ebd6bbc4da9bb4e4002`). Extension's paired PR is #47686. Terminal's current main consumes this package, so it is not assumed unaffected: its error translation, post-only edit handling, and already-closed behavior require a coordinated audit before upgrading. Early Hyperliquid readiness errors now have the same normalized fields as catch-path errors. Non-OK withdrawal statuses remain debug-only; thrown exceptions retain their reporting path. The changelog documents `createErrorResult` and removes the non-change.

Re-check that statement against the final client heads and CI before asking the author to publish it. Include an explicit client impact/status table if updating the PR body.

## Validation already run

- Tests were changed first: the focused run failed in 12 expected cases before the implementation fix, then passed all 186 focused tests.
- `yarn workspace @metamask/perps-controller test:coverage`: **138 files passed; 7,435 tests passed, 40 skipped; no type errors**. Coverage: 92.22% statements, 87.34% branches, 90.98% functions, 92.30% lines; package thresholds passed.
- `yarn lint:tsc:check`: no new repository-wide type errors.
- Targeted Oxlint and Oxfmt checks passed for changed files.
- `yarn changelog:validate`: passed across the monorepo.
- `git diff --check`: passed.
- `yarn lint`: type checking and Oxlint passed, then formatting stopped on **16 pre-existing untracked Markdown files** under the user's Support, artifacts, and docs areas. Those files were present before this task and were not modified. Stages after formatting did not run. Do not reformat or delete unrelated user files to make this command pass.

## Expected output

Start with your independent findings and recommendation, then summarize any scoped patch or adoption plan. Separate confirmed behavior from unknowns, name exact inspected revisions, report only checks actually run, and state whether Terminal migration is required before consuming the new Core contract. Identify any remaining publication/owner/release decisions rather than claiming they are complete.
