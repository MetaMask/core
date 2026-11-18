# TP/SL linkage

There are two mechanisms for putting a take-profit or stop-loss on a position. They are not interchangeable. They size differently and fail differently.

|                               | Order-linked                                                                 | Position-linked                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HyperLiquid grouping          | `normalTpsl`                                                                 | `positionTpsl`; `na` when a partial size is given                                                                                                           |
| Controller entry point        | `placeOrder` with `takeProfitPrice` / `stopLossPrice` in `OrderParams`       | `updatePositionTPSL`                                                                                                                                        |
| Submitted                     | in the same exchange batch as the parent order                               | as a separate request, after a position exists                                                                                                              |
| Size sent                     | the parent order size, frozen at submission; a partial size is clamped to it | `'0'` (the whole position) when `TP_SL_CONFIG.UsePositionBoundTpsl` is on and no partial size is given; otherwise an explicit size floored to the size grid |
| Requires an existing position | no                                                                           | yes                                                                                                                                                         |
| Races the position stream     | no                                                                           | yes                                                                                                                                                         |

How the venue resizes or rejects triggers after a scale-in or a partial fill is HyperLiquid behaviour; the controller does not encode it.

Code: `src/utils/orderCalculations.ts` `buildOrdersArray`; `src/providers/HyperLiquidProvider.ts` `placeOrder`, `updatePositionTPSL`, `#replacePositionTpsl`.

## Order-linked (`placeOrder`)

- Linkage comes from `OrderParams.tpslLinkage` (`order`, `position`, `none`), mapped by `adaptTpslLinkageToGrouping`. It wins over the deprecated `grouping`.
- With neither set, `buildOrdersArray` applies the default `grouping ?? ((takeProfitPrice ?? stopLossPrice) ? 'normalTpsl' : 'na')`. Omitting the field selects order-linked placement.
- Children are reduce-only (`r: true`) on the opposite side.
  - The TP child is a limit trigger (`isMarket: false`) with `p` = TP price.
  - The SL child is a market trigger (`isMarket: true`) with `p` = SL price moved 10% against the close (`ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps`, 1000 bps).
- `formatTpslSize` returns the parent's `formattedSize` for a whole-order TP/SL. A partial `takeProfitSize` / `stopLossSize` is clamped to the parent and floored to `szDecimals`.

| Error                                     | When                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED` | `tpslLinkage: 'position'` or `grouping: 'positionTpsl'` on `placeOrder`, with or without a TP/SL. HyperLiquid requires every order in a `positionTpsl` batch to be a trigger, and the parent is not. |
| `ORDER_TPSL_LINKAGE_REQUIRED`             | `tpslLinkage: 'none'` or `grouping: 'na'` with a TP/SL. It would leave orphan reduce-only triggers if the parent never fills.                                                                        |
| `ORDER_TPSL_LINKAGE_CONFLICT`             | `tpslLinkage` and `grouping` both set and disagree                                                                                                                                                   |
| `ORDER_TPSL_SIZE_INVALID`                 | Partial size without its price, not positive, larger than the order, or zero after flooring                                                                                                          |

Code: `src/utils/hyperLiquidAdapter.ts` `adaptTpslLinkageToGrouping`; `src/utils/orderCalculations.ts` `buildOrdersArray`, `formatTpslSize`, `formatPartialTpslSize`; `src/utils/hyperLiquidValidation.ts` `validateOrderParams`; `src/types/index.ts` `OrderParams.tpslLinkage`, `OrderParams.grouping`.

## Position-linked (`updatePositionTPSL`)

### Lookup

`updatePositionTPSL` and `replacePositionTPSLLeg` share `#replacePositionTpsl`, which reads the position through `#getPositionsForOperation(dex, { revalidateMissingSymbol: symbol })`. Errors below come back as an `OrderResult` with `success: false` and the code in `error`; the methods do not throw them.

| Current DEX slice                            | Result                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Published on this connection, symbol present | WebSocket slice, no request                                            |
| Published on this connection, symbol missing | One REST read of that DEX (since 16.1.0)                               |
| Not published on this connection             | REST read of that DEX. Close and margin operations take this path too. |
| REST read gets no answer                     | `PROVIDER_NOT_AVAILABLE`                                               |
| Position still absent                        | `POSITION_NOT_FOUND`                                                   |

- "Published on this connection" is a connection-epoch check (`stampedEpoch === getConnectionEpoch()`), not a recency check. A stale size on a symbol already in the slice is used as is.
- Only `updatePositionTPSL` and `replacePositionTPSLLeg` opt into the missing-symbol read. `closePosition`, `closePositions` and the margin operations fail closed on a miss in a current slice.
- The `position` argument is diagnostic. A size that differs from the lookup only writes a debug log.
- `expectedPosition` (`size`, `entryPrice`) is enforced. A missing position or a mismatch fails with `TPSL_UPDATE_FAILED`.

### Orders

- A whole-position update sends size `'0'` with grouping `positionTpsl` while `UsePositionBoundTpsl` is on.
- A partial update (`takeProfitSize` / `stopLossSize`) sends an explicit size floored to `szDecimals` with grouping `na`, validated against the position size.
- Legs are reduce-only on the side that closes the position. The TP leg is a limit trigger at its trigger price. A whole-position market SL uses the per-call `maxSlippageBps`, then the saved preference, then `DefaultTpslSlippageBps`. Standalone partial stop losses use their trigger price. A non-finite cap, a cap outside [0, 10,000) bps, or an invalid formatted limit refuses the update before any protection is canceled.
- `replacePositionTPSLLeg` replaces one leg. Its leg is a limit trigger when `limitPrice` is given; otherwise a market trigger capped at the trigger moved by `maxSlippageBps` (default `DefaultTpslSlippageBps`).
- Before placing, the update cancels every standalone reduce-only trigger on the symbol, not only the ones it placed. TP/SL children of a pending order are kept.

Code: `src/providers/HyperLiquidProvider.ts` `updatePositionTPSL`, `#replacePositionTpsl`, `replacePositionTPSLLeg`, `#getPositionsForOperation`; `src/utils/hyperLiquidValidation.ts` `createErrorResult`; `src/services/HyperLiquidSubscriptionService.ts` `getCachedPositionsForDex`, `#isPositionDexFresh`; `src/utils/positionProtection.ts` `assertExpectedPosition`; `src/types/index.ts` `UpdatePositionTPSLParams`.

## Config

| Constant                                       | Value                                              | Effect                                                                           |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `TP_SL_CONFIG.UsePositionBoundTpsl`            | `true`                                             | Whole-position updates send size `'0'`; off, they send the floored position size |
| `ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps` | 1000                                               | SL child limit price; default cap of a market-executing trigger                  |
| `TP_SL_PRECISION_CONFIG`                       | 8 dp below $0.01, 6 below $1, 4 below $100, else 2 | Decimals of a calculated trigger price                                           |

Code: `src/constants/perpsConfig.ts` `TP_SL_CONFIG`, `ORDER_SLIPPAGE_CONFIG`, `TP_SL_PRECISION_CONFIG`.

## Rules for callers

1. Do not rely on the `position` argument to avoid `POSITION_NOT_FOUND`. Pass `expectedPosition` to make the update conditional.
2. Do not pass position linkage to `placeOrder`. It is rejected.
3. Moving a case between the two mechanisms changes sizing, not only timing.

## History

- 15.1.0 ([core#10037](https://github.com/MetaMask/core/pull/10037)) made the lookup cache-first and fail-closed, and the caller snapshot became a log line.
- 16.0.0 ([core#10083](https://github.com/MetaMask/core/pull/10083)) added the provider-neutral code `POSITION_NOT_FOUND`.
- Before 16.1.0, a call fired right after a fill failed with no network read. 16.1.0 ([core#10101](https://github.com/MetaMask/core/pull/10101)) makes `updatePositionTPSL` revalidate once over HTTP when the symbol is missing.

The client decision between the two mechanisms, its hooks and the stream wait are in [metamask-mobile/docs/perps/perps-tpsl-attachment.md](https://github.com/MetaMask/metamask-mobile/blob/main/docs/perps/perps-tpsl-attachment.md).

Code: `CHANGELOG.md`.
