<!-- CURSOR_AGENT_PR_BODY_BEGIN -->
## Explanation

Hyperliquid failures are now normalized at every provider result boundary. Known account, order, liquidity, margin, nonce, rate-limit and transport failures return a stable `PerpsErrorCode` with provider-tagged `HyperLiquidErrorDetails`. Unknown failures return `UNKNOWN_ERROR`. Venue text is never copied into result fields. The normalized error is attached to the result as non-enumerable metadata, with the original failure on its `cause`, so services that report the failure still log it.

- `createErrorResult` always calls `normalizeHyperLiquidError`. Order placement, cancellation, `editOrder`, `updatePositionTPSL`, `closePosition`, `closePositions`, `updateMargin`, withdrawal, transfer, initialize, disconnect and testnet toggle results no longer return venue text.
- `isReadyToTrade` and `prepareTradingWallet` return the same provider-tagged contract on every failure path, including the early `KEYRING_LOCKED` and `EXCHANGE_ACCOUNT_NOT_FOUND` returns. A pending setup step still returns `{ ready: false }` with no error. A builder-fee refusal that signing again cannot fix returns `UNKNOWN_ERROR`. The venue sentence stays on the cause and in the debug log and is not sent to Sentry.
- A non-OK `withdraw3` status stays debug-only, as before this PR, and its result is normalized. A thrown withdrawal error is still reported.
- `TradingService` logs the attached cause for failed `closePosition`, `cancelOrder` and `flipPosition` results, and for a mixed `closePositions` batch. Several per-position causes are wrapped in an `AggregateError`.
- Service-unavailable matching recognizes only explicit outage and status forms, so `503` digits inside addresses, asset IDs or prices stay unknown. A builder-wallet refusal is not classified as the user's `INSUFFICIENT_BALANCE`.
- `docs/architecture.md` (Errors) describes the result contract.

### Contract impact

| Surface | Change |
| --- | --- |
| State | None |
| Methods | No signature changes. On failure, a Hyperliquid result's `error` holds the stable code instead of venue text. Optional `errorCode`/`errorDetails` are added to `MarginResult`, `WithdrawResult`, `TransferBetweenDexsResult`, `InitializeResult`, `ReadyToTradeResult`, `DisconnectResult`, `ToggleTestnetResult`, `ClosePositionsResult` and its `results` entries |
| Events | None |
| Exports | **BREAKING:** new `HyperLiquidErrorDetails`, and `PerpsErrorDetails` widened to `PriceMovedErrorDetails \| HyperLiquidErrorDetails`. `createErrorResult` now normalizes every input |
| Constants | `PERPS_ERROR_CODES.ORDER_POST_ONLY_WOULD_CROSS` and `ORDER_POST_ONLY_WINDOW` (additive; clients need a catch-all) |

### Client compatibility

| Client | Status | Evidence |
| --- | --- | --- |
| Mobile | Migrated in [metamask-mobile#39018](https://github.com/MetaMask/metamask-mobile/pull/39018) (open, `0fb47c4`) | `isNoPositionFoundError` checks `POSITION_NOT_FOUND` before the legacy message match. Close and TP/SL already-closed reconciliation are tested on the code. Both post-only codes are mapped, and `isPerpsErrorDetails` accepts `HyperLiquidErrorDetails` |
| Extension | Migrated in [metamask-extension#47686](https://github.com/MetaMask/metamask-extension/pull/47686) (open, `4247c76`) | `translate-perps-error.ts` maps both post-only codes and `POSITION_NOT_FOUND`. Close, TP/SL and edit-margin modals are updated |
| Terminal | Unaffected until it upgrades (pins `^23.1.0`) | Order and close refusals already read `errorCode`. On upgrade it must map both post-only codes and translate the `editOrder`, `cancelOrder` and `withdraw` results, which forward `error` directly |

Verification:
- Full `@metamask/perps-controller` suite: 7,436 passed, 40 skipped, no type errors
- `yarn changelog:validate`, oxfmt and oxlint on the changed files

## References

* Related to [TAT-3085](https://consensyssoftware.atlassian.net/browse/TAT-3085)

## Checklist

- [x] I've updated the test suite for new or updated code as appropriate
- [x] I've updated documentation (JSDoc, Markdown, etc.) for new or updated code as appropriate
- [x] I've communicated my changes to consumers by [updating changelogs for packages I've changed](https://github.com/MetaMask/core/tree/main/docs/processes/updating-changelogs.md)
- [x] I've introduced [breaking changes](https://github.com/MetaMask/core/tree/main/docs/processes/breaking-changes.md) in this PR and have prepared draft pull requests for clients and consumer packages to resolve them

<!-- CURSOR_AGENT_PR_BODY_END -->
