# Review ledger — fix: leg-replace errors use wrong method attribution

## Scope

- Request: validate the external finding that the `catch` in `#replacePositionTpsl` (packages/perps-controller/src/providers/HyperLiquidProvider.ts, formerly L12995–13006) always reported through `#reportWriteError` as `updatePositionTPSL`, then fix and self-review.
- Repository/client: core (this checkout).
- Base: `71a3dd82822`; head: `9b97ad0f7f4` + uncommitted working-tree diff (2 files).
- Changed files:
  - `packages/perps-controller/src/providers/HyperLiquidProvider.ts` — catch in `#replacePositionTpsl` now passes the shared `operationName` (derived from `legScope`) to `#reportWriteError` instead of the hardcoded `'updatePositionTPSL'`.
  - `packages/perps-controller/tests/src/providers/HyperLiquidProvider.advanced-orders.test.ts` — two new tests asserting the logged `context.data.method` for both the leg path (`replacePositionTPSLLeg`) and the whole-position path (`updatePositionTPSL`).

## Finding validation

- CONFIRMED. `#replacePositionTpsl` computes `operationName = legScope ? 'replacePositionTPSLLeg' : 'updatePositionTPSL'` (L11897–11900) and uses it consistently in `#assertProviderLifecycleCurrent`, cleanup logging, and signer-failure logging — but the outer `catch` hardcoded `'updatePositionTPSL'`. A failed single-leg replace was therefore logged and tagged with the wrong method. Additional location L11897–11900 is the `operationName` derivation itself and was already correct; no change needed there.
- Severity: Low (telemetry/error-context misattribution only; no control-flow or state impact — verified that `method` is only consumed by `#logRetryableSignerFailure` and `#getTradingErrorContext`/`#getErrorContext` for log context, never for branching).

## Criteria ledger

| Family | Rule | Outcome | Evidence |
|---|---|---|---|
| Base | Trace changed behavior caller → result, error paths | PASS | Both call paths traced: `updatePositionTPSL` → `#replacePositionTpsl(params)` → `operationName === 'updatePositionTPSL'` (unchanged); `replacePositionTPSLLeg` → `#replacePositionTpsl(params, legScope)` → `operationName === 'replacePositionTPSLLeg'` (now correct in the catch). The `method` string feeds only `#logRetryableSignerFailure` (debug log) and `#getErrorContext` (Sentry/log context) — verified at L2818–2845 and L5352–5365; no behavioral branching on the string. |
| Base | Test coverage of changed behavior | PASS | Two new tests executed and passing (134/134 in `HyperLiquidProvider.advanced-orders.test.ts`); they assert the logged `context.data.method` equals `replacePositionTPSLLeg` / `updatePositionTPSL` respectively when the open-orders read throws. Static inspection plus runtime execution of the suite. |
| Base | Signal over noise (comments, TODOs, dead helpers) | PASS | Diff is a one-token change plus two focused tests; no comments restating code, no leftovers. |
| Blocking review checks | Anti-pattern scan of diff | PASS | No catch that swallows (existing catch still maps and returns the error); no abstraction with one caller; no padded tests. |
| Controller Portability (Core) | Controller stays portable | NOT_APPLICABLE | No new platform imports, UI code, or client-specific behavior in the diff. |
| Perps Math Comes From the Controller | Trading math source | NOT_APPLICABLE | No math in the diff. |
| Shared Formatting & Display Precision | Formatting source | NOT_APPLICABLE | No display formatting touched. |
| Missing numeric data stays undefined | Undefined propagation | NOT_APPLICABLE | No numeric data handling in the diff. |
| Magic Strings / Numbers / Placeholders | Constants live in controller | PASS | The changed string `'updatePositionTPSL'` → `operationName` is an internal method label, consistent with existing sibling usage (`#assertProviderLifecycleCurrent(lifecycle, operationName)`); no new literals introduced. |
| Protocol Abstraction | Venue identity at provider boundary | NOT_APPLICABLE | No identity/display-field handling touched. |
| Pro Mode UI Gating | Flag + mode gate | NOT_APPLICABLE | No UI in diff. |
| MetaMetrics Events | Consolidated events/typed properties | NOT_APPLICABLE | No analytics events in the diff; logger error context is not a MetaMetrics event. |
| Sentry Tracing | Unbounded trace volume | NOT_APPLICABLE | No new spans; the change only renames a log-context field. |
| Connection & WebSocket Architecture | Cleanup ownership | NOT_APPLICABLE | No connection/WebSocket code touched. |
| Data Flow & State | Delayed balance tracker context | NOT_APPLICABLE | No balance tracker code touched. |
| Trade Flow & Order Execution | Numeric meaning in transit | NOT_APPLICABLE | No values change unit/source/direction; error result shape (`success: false`, mapped error) is unchanged. |
| Test Layer Coverage | Non-degenerate fixtures | PASS | New tests use realistic trigger fixtures (`rawPositionTrigger`) and a realistic failure injection (open-orders read rejects with 'orders offline'); assertions distinguish the two paths by method name, where a wrong value fails the test. |
| Embedded Signer Boundaries | Sensitive key material timing | NOT_APPLICABLE | No signer/key material handling in the diff. |
| Core: Public Controller Contracts Versioned | Contract + migration plan | NOT_APPLICABLE | No public surface change: `operationName` is private; error result contract unchanged. |
| Core: Package Release Metadata | Changelog + semver match impact | PASS (resolved) | Unreleased `Fixed` entry added to `packages/perps-controller/CHANGELOG.md` describing the corrected method attribution; non-breaking, no semver bump owed in this branch-only state. `yarn changelog:validate` passes. A PR link must be appended to the entry when the PR number exists (repo guideline: entries link their PRs). |
| Core: HyperLiquid Multi-Sig Account Handling | Probe + catch-path classifier | PASS | The change does not remove or reorder the catch-path classification: `#reportWriteError` still runs `#handleSignerFailure` first, then maps and logs. The proactive probe and unified-account logic are untouched. |
| Core: `#ensureUnifiedAccountEnabled` semantics | Retry vs permanent cache | NOT_APPLICABLE | Not touched. |
| Core: Metered Benefits Strict Improvement | Fee source + reduction | NOT_APPLICABLE | Not touched. |
| Core: Read-only Account Guards | Write inventory | NOT_APPLICABLE | No exchange-write behavior change. |
| Core: One Formatter Surface | Formatter location | NOT_APPLICABLE | No formatting. |
| Core: Evidence Expected Before Core Review | Contract impact matrix etc. | NOT_CHECKED | This is a local fix under validation, not a packaged PR submission; contract impact is none (private method-internal string). Author to attach standard evidence at PR time. |
| Cross-repo conformity | Parity with Mobile/Extension/Terminal | NOT_APPLICABLE | No shared behavior/formatting/state surface changed; provider-internal error context only. `owned-paths.json` scoped to controller internals here. |

## Commands executed

- `yarn workspace @metamask/perps-controller run test run tests/src/providers/HyperLiquidProvider.advanced-orders.test.ts` → 134 passed, no type errors.
- `yarn workspace @metamask/perps-controller run test run tests/src/providers/HyperLiquidProvider.advanced-orders.test.ts tests/src/providers/HyperLiquidProvider.error-handling.test.ts` (pre-fix regression sweep) → 241 passed.
- `yarn lint:oxlint` → clean.
- `npx tsc --noEmit -p packages/perps-controller/tsconfig.json` → errors confined to `tests/src/utils/orderCalculations.advanced-orders.test.ts`; verified pre-existing by re-running with the working tree stashed.

## Verdict rationale

No blocker, no major, one author-owed minor (changelog entry). Policy maps to COMMENT with a concrete ask.
