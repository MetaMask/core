I want to discuss and possibly finish: the withdrawal-route change’s PR metadata.

## Context

- Repository: MetaMask/core; package: `@metamask/perps-controller`.
- Branch: `TAT-3752-block-hyperliquid-multisig`; HEAD during this work was `036923bb21e4df874e86ed0b62ff37d5a3f0ee4a`. Changes remain uncommitted.
- The original tracked diff adds `PerpsController.resolveWithdrawalRoute`, its messenger action and public types.
- Review fixes preserve the literal `PROVIDER_ROUTE_REQUIRED` error type and make `withdraw` reject conflicting explicit direct-provider routes before calling `AccountService`. Regression cases cover matching, conflicting and unknown routes in both direct modes, plus a mode change between preflight and submission.
- Documentation now distinguishes route resolution from account-support checks and tells consumers to preserve provider identity and invalidate stale preflight results.
- The new changelog entry incorrectly linked PR #11532, which is an unrelated merged keyring-dependency update. That link was removed. A separate Fixed entry documents the withdrawal guard.
- No PR existed for this branch when checked. The two new changelog entries still need the real introducing PR link. Changelog validation passes, but repository contribution guidelines still require those links.

## Before changing anything

Please own an extensive independent review of the relevant diff, repository instructions, release guidance, recent commits and live GitHub/CI state. Treat this note as starting context, not an approval. Decide whether this task remains necessary, is already solved or stale, or would be better handled differently. Identify any hidden risks before editing.

Locate the repository from the current directory, a parent directory or the usual workspace. Preserve existing changes and do not inspect or modify unrelated untracked files.

## Remaining task

Once the actual PR exists, add its correct link to the Unreleased Added entry for `resolveWithdrawalRoute` and the Fixed entry for conflicting direct-provider withdrawals. Do not invent a PR number or restore the unrelated #11532 reference. Creating or publishing a PR is not authorized by this handoff.

Consumer upgrades and rollout coordination are outside this local fix; do not imply that Mobile, Extension or Terminal already adopt the new API.

## Validation and output

The implementation checks passed: 135 test files, 7,141 tests passed and 40 skipped; source-only no-emit TypeScript check; lint on changed TypeScript files; formatting; generated messenger action-type consistency; monorepo changelog validation; whitespace check. Six new route-rejection cases and the two TypeScript errors were observed failing before implementation.

After editing metadata, run `yarn changelog:validate` and check formatting. Recheck branch/PR identity rather than trusting this note. Start your response with findings and a recommendation, then summarize any patch and the exact checks run.

Do not push, merge, close issues or PRs, label, or post public comments without explicit authorization.
