# Extension follow-up: preserve already-gone order cancellation handling

## Task and scope

I want to discuss and finish the Extension integration for [MetaMask/core#11206](https://github.com/MetaMask/core/pull/11206), preferably in the existing [MetaMask/metamask-extension#47686](https://github.com/MetaMask/metamask-extension/pull/47686).

Core now classifies Hyperliquid's already-gone cancellation responses as `PERPS_ERROR_CODES.ORDER_NO_LONGER_OPEN`. The intended outcome is for Extension to recognize that stable code and retain its existing informational already-closed UX before adopting this Core error contract.

## Independently review before implementing

Find the MetaMask/metamask-extension repository from the current directory, a parent directory, or the usual workspace. Read its repository instructions, then extensively review the relevant implementation, tests, docs, recent commits, live PR/GitHub/CI state, and dependency versions. You own that review: this handoff supplies starting evidence, not a substitute for your assessment. Decide whether this task is still real, already solved, stale, over-scoped, or better handled differently, and call out blockers before changing anything.

The revisions below are investigation anchors, not a claim that future heads are unchanged. Do not push, merge, publish, close issues/PRs, label, post public comments, or edit remote PR metadata without explicit authorization. Preserve unrelated work. Do not change Core back to exposing venue text.

## Confirmed regression and history

- Core branch: `cursor/normalize-hyperliquid-errors-ae74`; implementation work started from `1cdd2a149f8`.
- The first normalization commit, `7b9fd30a1dc`, changed the existing cancel-status test from preserving the raw venue sentence to expecting `UNKNOWN_ERROR`. No subsequent commit through `1cdd2a149f8` restored its classification.
- Core `main` was fetched and inspected at `7d57ee04a6e66f67ab3ae7cf4257d680a992c2bf`. It preserves the raw sentence, so this loss of Extension behavior was introduced by the normalization branch, not inherited from `main`.
- Extension PR #47686 was inspected at `4247c76ec3af106fc8e4e88ad2d572924ff3302a`. Its cancel detector still matches only `/never placed, already canceled, or filled/iu`; its modal reconstructs `new Error(result.error)`. The paired PR had not migrated this path.

A full fill can race cancellation: the user opens the modal while the order rests, the order fills, and cancellation reaches Hyperliquid afterward. Extension retains an order snapshot in `cancelOrderTarget`, so the modal can still be open after the live order disappears. Partial fills are not required. Cancellation must not close or reverse any resulting position. Closing/TP-SL orders can also fill and reduce a position rather than create one.

## Core contract implemented

An ordinary failed `cancelOrder` result for an already-gone order has this serializable shape:

```typescript
{
  success: false,
  orderId: '123',
  error: 'ORDER_NO_LONGER_OPEN',
  errorCode: 'ORDER_NO_LONGER_OPEN',
  errorDetails: {
    code: 'ORDER_NO_LONGER_OPEN',
    provider: 'hyperliquid',
  },
}
```

- Both returned exchange status errors and thrown SDK errors normalize to this shape.
- Recognized venue markers are `never placed`, `already canceled`, `already cancelled`, `order not found`, and `twap not found`, case-insensitively and with SDK prefixes/suffixes allowed.
- The code is deliberately neutral: it does not distinguish filled, canceled elsewhere, and never placed. Do not call it `ORDER_FILLED`, imply the position was closed, or show a successful-cancellation message.
- Bare `filled` or `partially filled` text is not enough to classify an order as gone. Network, nonce, permission, rate-limit, and unrecognized failures remain failures.
- The original diagnostic remains internal error-cause metadata, not serialized result fields. Do not depend on `cause` being available in Extension.
- Ordinary cancellation stays `success: false`, with existing Core failed-event behavior. Advanced strategy cancellation keeps its existing outcome semantics while sharing the same classification.
- `PERPS_ERROR_CODES` and its inferred `PerpsErrorCode` type already export the new member; no separate helper export was added.

Core anchors in MetaMask/core, package `@metamask/perps-controller`:

- `PERPS_ERROR_CODES.ORDER_NO_LONGER_OPEN` and `isPerpsErrorCode` in `perpsErrorCodes.ts`.
- `normalizeHyperLiquidError` and `HYPERLIQUID_ERROR_MAPPINGS` in `errorUtils.ts`.
- `HyperLiquidProvider.cancelOrder`, `classifyCancelStatus`, and `#cancelChaseChild` in `HyperLiquidProvider.ts`.
- The normalization suite `errorUtils.test.ts` and provider suite `HyperLiquidProvider.error-handling.test.ts`.
- The package changelog's Unreleased section and architecture documentation's Errors section.

## Extension implementation instructions

Relevant Extension anchors:

- `isOrderNoLongerOpenError` and `ORDER_NO_LONGER_OPEN_PATTERN` in `orderUtils.ts`, and the corresponding `orderUtils.test.ts` suite.
- `CancelOrderModal` and `handleCancel` in `cancel-order-modal.tsx`, and the corresponding `cancel-order-modal.test.tsx` suite.
- `cancelOrderTarget` in `perps-market-detail-page.tsx` (order snapshot lifecycle; inspection only unless a separate problem requires a change).
- `translatePerpsError` in `translate-perps-error.ts` (only if needed for the current error pipeline).

If your independent review supports this direction, use test-driven development:

1. Update `isOrderNoLongerOpenError` to recognize `PERPS_ERROR_CODES.ORDER_NO_LONGER_OPEN`. Prefer `errorCode` on structured results/errors, and also handle the exact stable code in an `Error.message` or legacy string: the current modal wraps `result.error` in `new Error(...)` and drops `errorCode`.
2. Either pass the structured failed result into the detector before reconstructing an `Error`, or preserve the structured code while routing through the shared failure handler. Do not implement an `errorCode`-only detector without fixing the modal's lossy wrapper. Use the package's exported code constant, not a new client-defined code.
3. Retain the existing raw-sentence fallback if older supported controller versions can still return prose. Ensure the normalized path is directly tested rather than relying on that fallback.
4. Keep the existing already-gone outcome: show `PERPS_TOAST_KEYS.CANCEL_ORDER_ALREADY_CLOSED`, clear submission state, close the modal, and do not show the generic failure toast or emit a UI `Perp Error` event. This is informational, not completely silent.
5. Preserve existing analytics ownership: Core already emits submitted/failed cancellation events for the attempt. Do not add a contradictory UI cancellation-success event to the already-gone path. Do not broaden the task into analytics cleanup.
6. Do not swallow `UNKNOWN_ERROR`, other stable failures, or every `success: false` result. Do not use `POSITION_NOT_FOUND` for this condition. Keep the ordinary successful-cancel path unchanged.
7. Check whether the existing live order/position stream already reconciles the view. If explicit invalidation is needed, use existing Extension mechanisms and test it. Do not fabricate a fill/cancel status or mutate/close positions based solely on this code.
8. Use a Core preview/artifact containing this fix when validating the integration. A dependency on an older preview lacking the new code is not sufficient validation. Record the exact package version/artifact and revisions tested.

### Required regression tests

Helper tests:

- Structured result with `errorCode: ORDER_NO_LONGER_OPEN`.
- `new Error('ORDER_NO_LONGER_OPEN')` and a code-valued string; these cover the current wrapper/transport path.
- Legacy prefixed Hyperliquid sentence if its fallback remains supported.
- False for `UNKNOWN_ERROR`, network errors, nonce/rate-limit failures, partial-fill text, unrelated structured failures, and nullish inputs.

Modal tests:

- Background resolves with the normalized Core shape above: informational already-closed toast, modal closes, no generic failure toast, no UI `Perp Error`, no extra cancellation-success analytics.
- Background rejects with the normalized stable-code error: same UX.
- Legacy already-gone prose still works if supported.
- Unknown normalized error and a real cancellation failure still show an error and leave the modal retryable.
- Ordinary successful cancellation retains its existing success behavior.

Run the focused helper and modal suites, relevant translation tests if changed, and Extension's prescribed lint/type checks. Report the exact commands and outcomes. Core tests alone are not an Extension integration test.

## Core validation

Core regression tests were written first and observed failing: 20 expected failures, all caused by the missing classification. After implementation, the focused normalization/provider suites passed all 208 tests with no type errors.

Final Core validation passed:

- `yarn workspace @metamask/perps-controller run test:coverage`: 141 files passed; 7,676 tests passed, 40 skipped; no type errors. Coverage thresholds passed: 92.39% statements, 87.59% branches, 91.11% functions, 92.48% lines.
- `yarn lint:tsc:check`: no new type errors against repository suppressions; not a claim that the repository has no pre-existing suppressed errors.
- Package Oxlint and Oxfmt checks on all changed files: passed.
- `yarn changelog:validate`: passed across the monorepo.
- `git diff --check`: passed.

No Extension source was modified or Extension tests run as part of this Core task. The Core patch and this handoff are left uncommitted; no push, release, or remote PR edit was performed.

## Expected output

Start with your independent findings and recommendation, including whether the migration remains necessary. Then summarize the scoped patch or a better alternative, report exact checks actually run and their outcomes, and name any remaining dependency-preview/release coordination. Distinguish source inspection from integration-test evidence. Do not claim this handoff's Core test run proves Extension compatibility.
