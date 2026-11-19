# Client contract helpers

Shared answers clients used to keep their own copies of. Each one is exported from `@metamask/perps-controller`; use it instead of a local constant, formula or map.

## Price precision and order limits

`getOrderCapabilities({ symbol, providerId })` can include two optional fields on a `ready` result. An omitted field means its metadata is unavailable or unusable.

`pricePrecision` is the price grid the market accepts:

| `type`                | Venue       | Fields                                  | A price is valid when                                                                                   |
| --------------------- | ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `significant_figures` | HyperLiquid | `maxSignificantFigures`, `maxDecimals`  | it has at most `maxSignificantFigures` significant figures and `maxDecimals` decimals, or is an integer |
| `fixed_decimals`      | Lighter     | `decimals`, `tickSize` (decimal string) | it is a positive multiple of `tickSize` with a wire price at most 2³² − 1                               |

`orderLimits`:

| Field                 | HyperLiquid               | Lighter                   |
| --------------------- | ------------------------- | ------------------------- |
| `sizeDecimals`        | market `szDecimals`       | `supported_size_decimals` |
| `minOrderNotionalUsd` | per-order minimum ($10)   | `min_quote_amount`        |
| `minOrderSize`        | not reported              | `min_base_amount`         |
| `minimumAppliesTo`    | `all_orders`              | `resting_limit_orders`    |
| `scaleOrderCount`     | `SCALE_ORDER_COUNT`       | `SCALE_ORDER_COUNT`       |
| `twap`                | `HYPERLIQUID_TWAP_LIMITS` | not reported (no TWAP)    |

Apply the reported minimums to the orders named by `minimumAppliesTo`. On Lighter, market and IOC orders can go down to one size step. Lighter reports `resting_limit_orders` even when maker minimums are unavailable. It omits both minimums if either is missing or invalid, if either grid is unavailable, or if the maker bounds cannot be met within the venue's wire limits. The largest base size is `(2^48 − 1) × 10^(-sizeDecimals)`, and the largest quote notional is that size times the largest wire price expressed in quote units. A valid grid remains available independently.

A verified full close can qualify for an exception to the normal minimum notional. The close must still satisfy the venue's size grid. For example, a HyperLiquid batch close refuses a position whose size rounds down to zero, with `ORDER_SIZE_POSITIVE` on that row.

## Order-book grouping

`aggregateOrderBookLevels(levels, grouping, side)` buckets one side of the book; `groupOrderBook(book, grouping, maxLevels)` does both sides, trims them and returns `maxTotal` / `maxSize` for depth bars. The grouping preference itself stays in state (`selectOrderBookGrouping`).

- Bids round down to their bucket, asks round up, so a bucket never shows a better price than the orders in it.
- Bucketing is exact decimal arithmetic: 100.1 at a grouping of 0.1 stays in the 100.1 bucket (a float `Math.floor(100.1 / 0.1)` puts it in 100.0).
- Sizes and notionals are summed per bucket (a level without a readable notional counts `price * size`); `total` and `totalNotional` are rebuilt from the best price outward.
- A `null` grouping only trims, for a stream the venue already aggregated.

## Cross-margin liquidation

Beside the isolated estimates in `hyperLiquidPositionPreview`:

- `estimateCrossMaintenanceMargin(positions)`: the maintenance margin of every cross position, `notional * mmr - deduction` at each position's tier. `null` when any notional or tier set is unknown.
- `estimateCrossLiquidationPrice({ isLong, markPrice, positionSize, accountValue, maintenanceMargin, marginTiers })`: the price at which cross account value reaches maintenance margin, holding other positions at their current value. Within one tier it is HyperLiquid's `mark - side * (accountValue - maintenanceMargin) / size / (1 - mmr * side)`. `null` when no positive price exists (a long that cannot be liquidated) or inputs are unknown; render it as unavailable, never as 0.

Pass tiers from `resolveHyperLiquidMarginTiers`; do not assume a default max leverage.

- `accountValue` is the cross collateral: `getCrossCollateral(crossMarginSummary, spotCollateral)`, which counts spot collateral on a unified account.
- For an existing position, `maintenanceMargin` is `crossMarginSummary.maintenanceMargin` (it already includes the position) or `estimateCrossMaintenanceMargin` over every cross position.
- For an opening order preview, require a current position snapshot confirming there is no existing position in the target market. Keep Mobile's guard for an existing position and for Scale orders. Pass the order price as `markPrice` and the order size as `positionSize`, and add the new position's maintenance at that price to the account's existing maintenance. Show the preview as unavailable when the snapshot is missing or the order adds to, reduces, or flips an existing position.

## Error copy

`PERPS_ERROR_COPY` maps every `PERPS_ERROR_CODES` value to `{ key, defaultMessage }`. Keys are the Mobile locale keys; the default is English. `getPerpsErrorCopy(code)` returns the `UNKNOWN_ERROR` copy for anything that is not a known code, so a code added by a newer controller still renders.

Defaults can carry `{{name}}` placeholders (for example `ORDER_SIZE_MIN` uses `{{amount}}`). `IOC_CANCEL` needs `{{maxSlippage}}`; when the tolerance is unknown, show `perps.errors.iocCancelUnknownTolerance`.

## Order-type labels

`PERPS_ORDER_TYPE_LABELS` maps each normalised `OrderType` (`market`, `limit`, `stop_market`, `stop_limit`, `take_profit_market`, `take_profit_limit`, `twap`, `scale`, `chase`) to `{ key, defaultLabel }`, with keys `perps.order.type.<type>.title`.

## Batch cancel and close results

`cancelOrders` and `closePositions` return `status` alongside the per-item `results`. `success` is true when at least one item succeeded, including a partial failure, so render from `status`:

| `status`  | Meaning                                                     | Render                                                                                       |
| --------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `all`     | Every attempted item succeeded                              | Success                                                                                      |
| `partial` | Some succeeded, some failed (`failureCount > 0` or `error`) | Warning naming failed items and venues; keep the affected items on screen                    |
| `none`    | Nothing succeeded                                           | Show item, venue and discovery errors. With no failures and no batch error, nothing matched. |

Read individual outcomes from `results`, venue execution errors from `failures`, and unresolved cancellation discovery from `discoveryFailures`. Use all three when showing a partial result. An undiscovered cancel target has no per-order result. A tagged close target that is no longer open can return an explicit failure row.

`getBatchOperationStatus(result)` derives the same value from a provider-level result.

Typed controller substitutes and messenger handler mocks for either batch method must return `status`. When adapting a provider result, return `{ ...result, status: getBatchOperationStatus(result) }`.
