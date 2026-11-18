VERDICT: APPROVE
COMMIT: 036923bb21e4df874e86ed0b62ff37d5a3f0ee4a (working tree, uncommitted diff of 9 files)

Implements the Core ask from Mobile #37252 discussion 4489580830: a public `PerpsController.resolveWithdrawalRoute` query that reports the venue `withdraw` will sign on, sharing `withdraw`'s resolution and `PROVIDER_ROUTE_REQUIRED` refusal. No-arg `getAccountSupport`, `withdraw` and `PerpsAccountSupport` are unchanged.

✅ Route-required is returned as a typed value, not thrown, so Mobile's fail-open `readAccountSupport` catch cannot swallow it.
✅ Pre-ready and post-ready refusals reuse the same private helper `withdraw` uses; the migration (cold-start direct→aggregated) case is covered by a test asserting the query and `withdraw` agree on one fixture.
✅ Full package suite executed (7134 passed), `changelog:validate`, oxlint, oxfmt, `messenger-action-types:check` and `readme-content:check` all pass.

| Severity | file:line | Problem | Ask |
|---|---|---|---|
| ⚠️ Nitpick | packages/perps-controller/CHANGELOG.md:9 | Changelog entry links PR #11532, which does not exist yet. | Replace with the real PR number when the pull request is opened. |

<details>
<summary>Details for agents</summary>

| Status | Item | Evidence or gap | Ask |
|---|---|---|---|
| ⚠️ NOT_CHECKED | Client compilation against the new export | Branch-only review; Mobile/Extension/Terminal were not compiled against the package. Additive surface, no client change required. | Client bump PR should name the package version and consumers checked. |
| ➖ | 14 rule families not applicable to this diff | No math, formatting, events, tracing, connection, signer or write-path changes. | Full ledger in `artifacts/review-task-4489580830/review-ledger.md`. |

</details>
