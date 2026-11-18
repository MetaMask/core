# Perps static review ledger — MetaMask/core#11206 (round 4)

## Setup

- Request: re-review https://github.com/MetaMask/core/pull/11206 "fix(perps): normalize Hyperliquid failures" with `perps-review-pr` (shared checklist plus the `repos/core.md` overlay). The skill is at `~/code/consensys/skills/domains/perps/skills/perps-review-pr`, generated from rules @ `398decc0`.
- Base: merge-base with `origin/main` = `6afee356de72a770931a9d1aa3f7bdd2a8556172`. Head: `f230bd9ad9811b3cd6e93f368ad4ebf232f3f71f` (local HEAD == PR headRefOid).
- Prior rounds: abretonc7s 5795130329 (REQUEST_CHANGES @ `5cf78b1`), 5797756960 (COMMENT @ `435e8cd`), 5933416802 (COMMENT @ `3171400`). The branch was rebased, so `3171400` is not an ancestor. The delta was reviewed by commit: `764c893`, `977074c`, `f230bd9`.
- Reference checkouts: `MM_HARNESS_REF_*` unset and `mm-harness` not installed, so no local reference roots. Consumers were read through the GitHub API at pinned revisions: Mobile PR #39018 @ `0fb47c40971e5b07487e8b4c71bca7d4f340bdd2`, Extension PR #47686 @ `4247c76ec3af106fc8e4e88ad2d572924ff3302a` (status only), Terminal `consensys-vertical-apps/va-mmcx-terminal` main @ `618c39434e4897ab3e5b909e33eaa175c1786d49`.
- Evidence boundary: static only. No tests, builds or lint were run by the reviewer. CI on head: 41 passed, 6 skipped (`gh pr checks`).
- Changed files: 46 (see `git diff --stat 6afee35..f230bd9`). All are under `packages/perps-controller` (src, tests, CHANGELOG).

## Prior findings reconciliation

| Prior item | Status | Evidence |
|---|---|---|
| errorUtils.ts:85 — Mobile still matches "No position found" | ✅ Resolved | Changelog bullet (Unreleased › Changed) names the `POSITION_NOT_FOUND` migration. Mobile `translatePerpsError.ts:580-592` @ `0fb47c4` checks the code first. The Terminal note was added in `f230bd9`. |
| HyperLiquidProvider.ts prepareTradingWallet early returns lack errorCode/details | ✅ Resolved | `977074c` adds `createNotReadyResult`, used by all five failure returns. A `KEYRING_LOCKED` or `EXCHANGE_ACCOUNT_NOT_FOUND` string maps through `isPerpsErrorCode` (`errorUtils.ts:237-241`). Ten `toStrictEqual` assertions were updated in `prepare-trading-wallet.test.ts`, plus two controller integration tests. |
| HyperLiquidProvider.ts:16284 — withdraw3 status rejection now in Sentry, untested | ✅ Resolved | Reverted to debug-only (`:16281-16293`). An `it.each` covering three messages asserts the result shape, the attached cause, the debug log, and `logger.error` not called. |
| CHANGELOG.md — false Fixed entry; createErrorResult undocumented | ✅ Resolved | Fixed entry removed. A `createErrorResult` bullet was added under the BREAKING Changed entry. |
| Nit errorUtils.ts:16 ordering comment | ✅ Resolved | The comment now reads "Keep specific post-only rejections ahead of generic failure patterns." |
| Nit errorUtils.ts:46 redundant regex | ✅ Resolved | `/order must have minimum value/iu`, with a prefixed regression case added. |
| Bugbot 4590796715 — changelog in released sections | ✅ Resolved | `764c893` moved the entries to Unreleased. |
| Bugbot 4590797073 — mixed batch loses cause | ✅ Resolved | `764c893` uses `attachProviderErrorCause` per status failure, and `TradingService` links it. Tested for the single-cause case. |
| Bugbot 4606816521 — thrown batch catch omits cause | ✅ Dismissed | `#reportWriteError` (`HyperLiquidProvider.ts:11761`, defined `:2538-2554`) already logs the mapped original error to `logger.error`. The later `TradingService` batch log is a pre-existing second summary report (present at base). The changelog's cause claim is scoped to mixed batches. |

## Base review

| Rule | Outcome | Evidence |
|---|---|---|
| Trace each changed behavior | PASS | prepareTradingWallet: signer-locked → early return; unregistered → `EXCHANGE_ACCOUNT_NOT_FOUND`/`KEYRING_LOCKED`; post-setup lock; catch path. All go through `createNotReadyResult`, and a `PerpsControllerError` with details is returned unchanged (`errorUtils.ts:216-223`). withdraw: status rejection → `#recordUnsupportedAccountFromError` + debug log + `createErrorResult`. The thrown path still calls `#reportWriteError`. closePositions status path → cause attached per failed outcome. AggregatedPerpsProvider.closePositions passes the result through unchanged (`:1064-1078`), so the symbol survives. |
| Inspect test coverage | FINDING (Minor) | `TradingService.ts:2566` `AggregateError` branch is untested; `grep AggregateError tests/` finds nothing. Other new behavior is covered (see above). Tests were inspected, not executed. |
| Permissions, data, dependencies, wiring | PASS | No dependency, flag, locale or telemetry-event changes. Venue text stays off public results and appears only on the non-enumerable cause. |
| Signal over noise | PASS | The new comments explain why (`HyperLiquidProvider.ts:16291-16292`, `errorUtils.ts:16`). No TODOs or debug leftovers in the delta. |

## Perps criteria (shared)

| Family | Rule | Outcome | Evidence |
|---|---|---|---|
| Blocking review checks | Confirmed anti-pattern → REQUEST_CHANGES | PASS | No confirmed Perps anti-pattern in this round. |
| Controller Portability | Platform import | PASS | No new imports beyond `errorContext`. |
| Controller Portability | Deep import from app code | NOT_APPLICABLE | Core-only diff. |
| Controller Portability | New dependency not in DI | PASS | Uses the injected `logger` and `debugLogger`. |
| Controller Portability | Breaking publisher contract | PASS | BREAKING entries plus paired client PRs (see Core criteria). |
| Perps Math | Client-side trading math / copy / advanced-order state | NOT_APPLICABLE | No math touched. |
| Shared Formatting | all rules | NOT_APPLICABLE | No display formatting. |
| Missing numeric data | all rules | NOT_APPLICABLE | No numeric fields. |
| Magic strings/numbers | all rules | PASS | Codes come from `PERPS_ERROR_CODES`. The `'hyperliquid'` provider tag is typed by `HyperLiquidErrorDetails`. |
| Protocol Abstraction | Execution identity / entity ownership | NOT_APPLICABLE | Not touched. |
| Protocol Abstraction | Hardcoded provider | PASS | Routing stays through `AggregatedPerpsProvider`. |
| Protocol Abstraction | Provider-specific error handling | PASS | Venue prose is classified only at the HL provider boundary (`normalizeHyperLiquidError`), and clients map `errorCode`. |
| Protocol Abstraction | Hardcoded symbols / executable precision / detailedOrderType | NOT_APPLICABLE | Not touched. |
| Pro Mode UI Gating | all rules | NOT_APPLICABLE | No UI. |
| MetaMetrics Events | all rules | NOT_APPLICABLE | No events. |
| Sentry Tracing | Unbounded trace volume | PASS | Net Sentry volume is lower: the withdrawal status path was moved back to debug. No new spans. |
| Connection & WebSocket | all rules | NOT_APPLICABLE | Not touched. |
| Data Flow & State | all rules | NOT_APPLICABLE | No state changes. |
| Trade Flow | Numeric meaning / pre-trade / refresh / slippage | NOT_APPLICABLE | Error path only. Clients branch on `failureCount`, which is unchanged. |
| Navigation parity | Only one path fixed | NOT_APPLICABLE | No navigation. |
| test-i18n-usage delegation | — | NOT_APPLICABLE | No locale strings changed in Core. |
| Test Layer Coverage | Degenerate fixtures | PASS | Withdrawal `it.each` uses three distinct classifications, including unknown. |
| Test Layer Coverage | Numeric control units / clock control / assertions miss behavior | NOT_APPLICABLE | Not UI; the assertions check outcomes directly. |
| Embedded Signer Boundaries | all rules | NOT_APPLICABLE | Not touched. |
| Architecture Docs | Change contradicts its doc | FINDING (Minor) | `docs/architecture.md:245` says "104 stable codes" (106 at head) and "Adding a code is a minor change", while the changelog marks the two additions BREAKING. |
| Architecture Docs | Documented pattern changed without its doc | FINDING (Minor) | Same Errors section: the provider result contract changed (code in `error`, `UNKNOWN_ERROR`, provider-tagged details, attached cause) and the section was not updated. Folded into the finding above. |

## Cross-repository conformity

| Rule | Outcome | Evidence |
|---|---|---|
| Client parity | NOT_APPLICABLE | No client UI changed in this diff. |
| Core and consumers | PASS with NOT_CHECKED | Mobile @ `0fb47c4`: `isNoPositionFoundError` is code-first; `ORDER_POST_ONLY_*` is mapped in `ERROR_CODE_TO_I18N_KEY`; `isHyperLiquidErrorDetails` is accepted. Terminal @ `618c394`: pins `^23.1.0`; `toSubmissionResult` passes `result.errorCode`; `TPSL_ERROR_MESSAGES` and the order reason map include `POSITION_NOT_FOUND`; `cancelOrder`/`editOrder`/`withdraw` forward raw `result.error`; `toOrderErrorCode` is prose-based. This matches the changelog's Terminal note. Extension #47686 status only. Nothing was compiled. |

## Core criteria

| Rule | Outcome | Evidence |
|---|---|---|
| Public contracts versioned & migration-aware | PASS | Result-type additions are optional. The `PerpsErrorDetails` widening and new codes are BREAKING with migration notes. `tests/public-api.test.ts` and `public-api-types.ts` assert the exports. |
| Release metadata matches impact | PASS | Entries are under Unreleased with **BREAKING:** first and PR links. No version bump in this PR, which is correct for a non-release PR. |
| Multi-sig handling | PASS | The withdraw status path still calls `#recordUnsupportedAccountFromError` before returning. |
| `#ensureUnifiedAccountEnabled` cache semantics | NOT_APPLICABLE | Not touched. |
| Metered benefits | NOT_APPLICABLE | Not touched. |
| Read-only guards cover every write | NOT_APPLICABLE | No guard changes. |
| One formatter surface | NOT_APPLICABLE | No formatting. |
| Provider rejections have two shapes | PASS | Withdraw: status (new `it.each`) and thrown (unchanged `#reportWriteError` path). closePositions: status (cause attached, tested) and thrown (provider-reported). Lighter is untouched; the normalizer is HL-specific. |
| Evidence expected before review | FINDING (Minor) | PR body has no contract-impact matrix, no paired PR links, and no Terminal note (these are only in the changelog). Its verification count is stale. |

## Outcome counts

- FINDING: 3 (TradingService AggregateError test, architecture doc, PR description evidence)
- NOT_APPLICABLE: 31 rule rows
- NOT_CHECKED: consumer compilation (Mobile, Extension, Terminal), runtime
- Verdict: COMMENT (3 minor, 0 blocker/major)
