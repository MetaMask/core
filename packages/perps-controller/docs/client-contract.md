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

| Field                     | HyperLiquid                                             | Lighter                   |
| ------------------------- | ------------------------------------------------------- | ------------------------- |
| `sizeDecimals`            | market `szDecimals`                                     | `supported_size_decimals` |
| `minOrderNotionalUsd`     | per-order minimum ($10)                                 | `min_quote_amount`        |
| `minOrderSize`            | not reported                                            | `min_base_amount`         |
| `minimumAppliesTo`        | `all_orders`                                            | `resting_limit_orders`    |
| `scaleOrderCount`         | `SCALE_ORDER_COUNT`                                     | `SCALE_ORDER_COUNT`       |
| `twap`                    | `HYPERLIQUID_TWAP_LIMITS`                               | not reported (no TWAP)    |
| `maxOraclePriceDeviation` | `0.95` (`HYPERLIQUID_CONFIG.OraclePriceDeviationLimit`) | not reported              |

Apply the reported minimums to the orders named by `minimumAppliesTo`. On Lighter, market and IOC orders can go down to one size step. Lighter reports `resting_limit_orders` even when maker minimums are unavailable. It omits both minimums if either is missing or invalid, if either grid is unavailable, or if the maker bounds cannot be met within the venue's wire limits. The largest base size is `(2^48 − 1) × 10^(-sizeDecimals)`, and the largest quote notional is that size times the largest wire price expressed in quote units. A valid grid remains available independently.

A verified full close can qualify for an exception to the normal minimum notional. The close must still satisfy the venue's size grid. For example, a HyperLiquid batch close refuses a position whose size rounds down to zero, with `ORDER_SIZE_POSITIVE` on that row.

Check a limit price against `maxOraclePriceDeviation` with `isPriceOutsideDeviationBand(price, oraclePrice, maxOraclePriceDeviation)`, or show the accepted range from `getPriceDeviationBand`. Both use `|price - oracle| / oracle <= maxOraclePriceDeviation`, the same rule as `isMarketTradable` and `PriceUpdate.isTradable`, and Hyperliquid reports the limit the provider was configured with (`fallbackPriceDeviationLimit`, default `0.95`). Skip the check when the venue omits the limit. Round a price onto the reported grid with `roundPerpsPrice({ price, pricePrecision })`: a HyperLiquid grid gives the same string as `formatHyperLiquidPrice` except that a price rounding to zero returns `undefined` rather than `'0'`, and a Lighter grid rounds the supplied decimal string half up to `tickSize`.

`attachedTpslGroupLimit` (`{ takeProfit, stopLoss }`) is the most take-profit and stop-loss legs one order can attach. HyperLiquid and Lighter both report one of each.

For HyperLiquid markets that prohibit Cross, `getOrderCapabilities` reports `supportedMarginModes: ['isolated']` and `crossMarginUnavailableReason`. The reason is `noCross`, `strictIsolated` or `isolatedOnly` for a legacy or unrecognized restriction. Show the disabled Cross option with the corresponding explanation. A cross-capable market omits the reason.

## Order-book grouping

`aggregateOrderBookLevels(levels, grouping, side)` buckets one side of the book; `groupOrderBook(book, grouping, maxLevels)` does both sides, trims them and returns `maxTotal` / `maxSize` for depth bars. The grouping preference itself stays in state (`selectOrderBookGrouping`).

- Bids round down to their bucket, asks round up, so a bucket never shows a better price than the orders in it.
- Bucketing is exact decimal arithmetic: 100.1 at a grouping of 0.1 stays in the 100.1 bucket (a float `Math.floor(100.1 / 0.1)` puts it in 100.0).
- Sizes and notionals are summed per bucket (a level without a readable notional counts `price * size`); `total` and `totalNotional` are rebuilt from the best price outward.
- A `null` grouping only trims, for a stream the venue already aggregated.

`calculateOrderBookGroupingOptions({ midPrice, tickSize, ladder })` builds the grouping ladder (`ORDER_BOOK_GROUPING_CONFIG`). With `tickSize` it is the market tick times 1, 2, 5, 10, 20 and 50, keeping widths the venue's streamed buckets divide; with a bare mid price (or `ladder: 'decade'`) it is Mobile's mid-price decade ladder. `selectDefaultOrderBookGrouping(options)` picks the one a book opens at. Pass `tickSize` as a number from `getPriceTick`, not a parsed `PerpsPricePrecision.tickSize`. The `tick` ladder filters to Hyperliquid's `nSigFigs`/`mantissa` grid, so it is for Hyperliquid books: on Lighter, which streams raw levels, use `ladder: 'decade'` or pass the raw tick widths you group client-side with `groupOrderBook`. On HyperLiquid, `calculateOrderBookAggregationParams(grouping, price)` gives the `nSigFigs`/`mantissa` to subscribe at so the venue aggregates the stream. `calculateOrderBookSpread({ bestBid, bestAsk })` returns the spread, mid and spread percent as numbers. `estimateOrderBookSlippage` sweeps the visible book for a market order's average and worst-level slippage in basis points; compare `worstSlippageBps` with the max-slippage setting for a cap check.

## Market list sorting

`sortMarkets({ markets, sortBy, direction })` sorts on `PerpsMarketData.numericValues` (unformatted price, 24h change in percent, and USD volume and open interest), not on the display strings. A row that has `numericValues` is never read from its display strings, since producers write placeholders such as `-100.00%` or `$0` there; only a row built without `numericValues` falls back to parsing them. `sortBy` is a `MarketSortField`: the `SortField` columns plus `'price'` and `'name'`; `getMarketDataWithPrices` and `applyMarketFilters` accept the same field. `direction` defaults to `'asc'` for `'name'` and `'desc'` otherwise. Markets without a value for the column sort last in either direction; `missing: 'last'` states that placement and is the only one. Lighter open interest is converted from base units to USD at the last trade price.

Clients that overlay live values on rows before sorting (Mobile's `usePerpsTopMovers` writes the live `change24hPercent`) must update `numericValues` too, or the sort ranks on the stale numbers while the row shows live ones.

`matchesCategory(market, 'memecoin')` matches a main-DEX market tagged `memecoin`, whatever its `marketType`, and never a HIP-3 market, as Mobile's `isMemecoinMarket`.

## Prices, margin tiers and account balances

- Prices: `PriceUpdate.price` is the mid, `markPrice` is the venue mark (Hyperliquid `markPx`, Lighter `mark_price`), and `oraclePrice` is the oracle/index price (Hyperliquid `oraclePx`, Lighter `index_price`). Show `markPrice` as Mark. Use `oraclePrice` for oracle deviation checks and oracle reference prices. `isTradable` already uses the oracle.
- Margin tiers: `MarketInfo.marginTiers` and ready `getOrderCapabilities(...).marginTiers` give Hyperliquid's tiers (`lowerBound` notional in USD, `maxLeverage`), ascending, resolved from the cached `meta`. Pass them to `estimateCrossLiquidationPrice` and the position preview helpers. Don't fetch `meta` in the client. Market lists from Terminal snapshots omit them, so read `getOrderCapabilities` for the selected market.
- Margin-mode lock: `getMarginModeLock({ symbol })` answers from the live position, order and TWAP streams when they are subscribed and current for the selected account, with no venue request. Otherwise it reads REST. Call it freely while the order form is open. Keep `subscribeToAvailableToTrade` open for the order form's market, and a lock from a resting order needs no venue read either.
- Margin adjustment: `getMarginAdjustmentLimits({ symbol })` gives the Add/Remove maxima for an isolated position. On Hyperliquid Unified accounts the venue reserves Cross margin too: `maxAdd` is spot USDC total minus every margin in use, the amount `updateIsolatedMargin` accepts. Standard accounts use the DEX's perps withdrawable. Show `maxAdd` / `maxRemove` as they are; do not use `withdrawable` or recompute. On `unavailable`, hide or disable the control: `no_isolated_position`, `account_unknown` (retry), `provider`. `account_unknown` also covers an unknown market, margin mode or position figure. `maxRemove` is `'0'` only on a confirmed strict-isolated market. `account_unknown` also covers a failed venue read (retry); `provider` means the account mode or provider has no isolated margin limits (hide the control).
- Market meta: `getMarketMeta({ symbol })` returns `marginTiers` (null when the venue lists no tiered table for the market, or the Hyperliquid table could not be resolved from the cached meta; use `maxLeverage` in both cases), `isDelisted`, `maxLeverage` and `onlyIsolated` (no Cross margin) from the provider's session cache, so two calls make one venue read. Omit `symbol` for every market. Don't read `meta` in the client. Through the messenger, the result is `PerpsMarketMeta | PerpsMarketMeta[]`; narrow with `Array.isArray`. In aggregated mode it reads one venue: `providerId`, else the default. An unregistered `providerId` throws `PROVIDER_NOT_FOUND`, and a failed venue read rejects; neither reports `MARKET_NOT_FOUND`.
- Account balances (Hyperliquid Unified): `totalBalance` is the account value hyperliquid.xyz shows (the spot USDC total, which already includes every DEX's perps account value). `spendableBalance` and `withdrawableBalance` are free USDC (total minus margin in use). On Unified accounts this is the venue's limit for adding margin to an isolated position; don't subtract position margins again. Standard accounts keep perps-plus-spot balances. On Unified, a spot read with a missing or invalid USDC `total` or `hold` keeps the perps figures. Those perps-only figures understate a Unified balance: `getAccountState({ throwOnUnavailable: true })` rejects with `ACCOUNT_STATE_FAILED` instead, and `getMarginAdjustmentLimits` returns `unavailable/account_unknown`.
- Account summary: pass `accountMode` from the `AccountState` to `calculateAccountSummary`. `accountMode` is set by both the stream and `getAccountState`, and absent while the mode is unknown. On a Standard account (`disabled`, `default`), account leverage is cross notional over cross account value (hyperliquid.xyz Cross Account Leverage). On Unified and Portfolio Margin, and when the mode is unknown, it is over total equity.

## Order, fee and position helpers

| Helper                                                                                | Use it for                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calculateCloseSize`                                                                  | Size to close for a percent or USD amount, on the venue's size grid; a full close returns the exact position size. Pass `rounding: 'down'` for split take-profit levels so they never exceed the position; it returns `undefined` when a level rounds down to zero                                                   |
| `calculateFeeNotionalUsd`, `getUndiscountedFeeRate`, `calculateUndiscountedFeeAmount` | Fee notional (a TP/SL pair uses its higher trigger price) and the fee before a MetaMask discount                                                                                                                                                                                                                     |
| `isTriggerPriceOnValidSide`                                                           | Whether a stop or take-profit price sits on the side its order fires from                                                                                                                                                                                                                                            |
| `getOrderFillKey`, `getFillAggregationKey`                                            | Deduplicating REST and live fills, and grouping fills into one trade                                                                                                                                                                                                                                                 |
| `getPositionDirection`                                                                | `long` / `short` from a signed size; `undefined` for zero                                                                                                                                                                                                                                                            |
| `normalizeHyperLiquidScalePriceLadder`, `sizeHyperLiquidScaleLadder`                  | A Hyperliquid scale ladder: grid prices, and rung sizes that meet a USD target (Mobile's rule) or split an exact on-grid size                                                                                                                                                                                        |
| `recomputePositionAtPrice`                                                            | PnL, value and return on equity at a live price between account updates                                                                                                                                                                                                                                              |
| `CROSS_MARGIN_RATIO_THRESHOLDS`, `getCrossMarginRatioTone`                            | Warning and danger levels for `accountRatio`                                                                                                                                                                                                                                                                         |
| `buildProviderCacheKey`                                                               | The `provider:network` key the controller caches per-venue data under                                                                                                                                                                                                                                                |
| `calculateAccountReturnOnEquity`                                                      | Account return on equity in percent from its totals, `ΣunrealizedPnl / ΣmarginUsed`, as REST and aggregated account states report it. The Hyperliquid account stream's `returnOnEquity` is instead the margin-weighted venue position RoE, and venue RoE is over each position's entry margin, so the two can differ |

A missing or unreadable number gives `undefined` rather than 0: the whole result for the scalar helpers, the affected fields for `estimateOrderBookSlippage`, and the position unchanged for `recomputePositionAtPrice`. `isPriceOutsideDeviationBand` fails open instead: it returns `false` for unusable input so an unknown price never blocks an order.

## Leverage display

`formatLeverage(value, options?)` renders account and position leverage with an `x` suffix, at most `PERPS_DISPLAY_PRECISION.Leverage` (2) decimals with trailing zeros dropped ("0.2x", "1.21x"). Pass `minimumFractionDigits` / `maximumFractionDigits` for a fixed precision (`{ minimumFractionDigits: 2 }` renders "0.20x", as hyperliquid.xyz; `{ minimumFractionDigits: 1, maximumFractionDigits: 1 }` matches Mobile's account summary) and `formatters` for the locale. Missing, non-finite or negative leverage renders `--`. Don't build `${leverage}x` or `toFixed` strings in the client.

## Cross-margin liquidation

Beside the isolated estimates in `hyperLiquidPositionPreview`:

- `estimateCrossMaintenanceMargin(positions)`: the maintenance margin of every cross position, `notional * mmr - deduction` at each position's tier. `null` when any notional or tier set is unknown.
- `estimateCrossLiquidationPrice({ isLong, markPrice, positionSize, accountValue, maintenanceMargin, marginTiers })`: the price at which cross account value reaches maintenance margin, holding other positions at their current value. Within one tier it is HyperLiquid's `mark - side * (accountValue - maintenanceMargin) / size / (1 - mmr * side)`. `null` when no positive price exists (a long that cannot be liquidated) or inputs are unknown; render it as unavailable, never as 0. To tell a long that cannot be liquidated from unknown inputs, use `PerpsController.estimateCrossLiquidation`.

Pass tiers from `resolveHyperLiquidMarginTiers`; do not assume a default max leverage.

- `accountValue` is the cross collateral: `getCrossCollateral(crossMarginSummary, spotCollateral)`, which counts spot collateral on a unified account.
- For an existing position, `maintenanceMargin` is `crossMarginSummary.maintenanceMargin` (it already includes the position) or `estimateCrossMaintenanceMargin` over every cross position.
- For an order preview, call `PerpsController.estimateCrossLiquidation`; for an order on an open Cross position, `previewPositionModify` also works. Both replace the position's maintenance with the resulting position's. Keep Mobile's guard for Scale orders.

### Open position liquidation price

`Position.liquidationPrice` is the venue's figure. `null` on a Cross position means no price reachable at the current account value liquidates it: the cross collateral covers the position's maintenance margin at every positive price. Render it as no liquidation risk (for example "None" or an em dash), never as 0 and never as a loading or error state. It can become a price again when account value falls or the position grows.

### Controller liquidation previews

`PerpsController.estimateCrossLiquidation({ symbol, direction, size, entryPrice, leverage, providerId? })` (messenger `PerpsController:estimateCrossLiquidation`) never rejects. Render `{ status: 'price', price }` as the price, `{ status: 'none', reason: 'covered_by_account' }` as no liquidation risk (N/A), and `{ status: 'unavailable', reason }` as "can't estimate": `missing_inputs` (invalid order, unknown market or tiers, an isolated position already open in that market, or the order closes the position), `account_unknown` (the account could not be read or changed during the read), `provider` (Lighter, or a Hyperliquid account mode other than Unified or Standard). Hyperliquid reads the selected wallet's position and prices an opening, add, reduce or flip of it, without the fee. Unified uses shared Cross equity and spot USDC. Standard uses the market's DEX clearinghouse; on a HIP-3 DEX it assumes placement moves margin in when the DEX's withdrawable balance is below the order's required margin and returns the excess above the 0.1 USDC buffer afterwards, only when that excess is over 0.1 USDC, as placement does.

`PerpsController.calculateLiquidationPrice` returns `Promise<string>`. For HyperLiquid Cross (`marginType: 'cross'`, `asset`, `entryPrice`, `direction`, `leverage`, positive `positionSize`) it delegates to `estimateCrossLiquidation`: `price` resolves the price, `none` resolves `'0'` (no liquidation risk, as the isolated estimate), and `unavailable` rejects with `errorCode: 'LIQUIDATION_PRICE_UNAVAILABLE'`. This replaces the old `'0.00'` sentinel on HyperLiquid. Handle the rejection as an unavailable estimate and clear any stale price for that input. Lighter rejects a Cross preview with the same code. New code should call `estimateCrossLiquidation`.

`previewPositionModify` on a HyperLiquid Cross position returns the same `open` / `full_close` / `none` shapes as isolated. `resulting.margin` is the resulting notional at `leverage`, and `resulting.leverage` is `leverage`. An unavailable `resulting.liquidationPrice` carries `reason: 'covered_by_account'` (render N/A) or `'missing_inputs'` (the account's Cross figures, the fee of an add or flip, or the tiers are unknown; the account holds no Cross position in that market (none, or an isolated one), or its position value is unknown). When the account read succeeds, the projection starts from the position the account holds, not the `position` passed in. Isolated previews and `current.*` omit `reason`. HyperLiquid no longer returns `reason: 'cross_margin'`.

Clients that map every `PerpsErrorCode` need entries for `ORDERS_FAILED`, `LIQUIDATION_PRICE_UNAVAILABLE` and `MARKET_NOT_FOUND` when they bump this package. Use `perps.errors.ordersFailed` for an unavailable orders read, `perps.errors.liquidationPriceUnavailable` for an unavailable estimate and `perps.errors.marketNotFound` when `getMarketMeta` finds no market with that symbol. Update Mobile's exhaustive map and Extension's map and coverage test.

## Error copy

`PERPS_ERROR_COPY` maps every `PERPS_ERROR_CODES` value to `{ key, defaultMessage }`. It reuses Mobile locale keys where the messages agree, including `perps.errors.postOnlyWouldCross` and `perps.errors.postOnlyWindow`. Use the reused post-only placement copy for rejected placements. When an edit returns `ORDER_POST_ONLY_WOULD_CROSS`, the original resting order may have been canceled. Keep the client's edit-specific warning and check the order status. The English defaults are provided by Core and may differ from Mobile's text. `getPerpsErrorCopy(code)` returns the `UNKNOWN_ERROR` copy for an unknown code.

The keys `perps.errors.orderValidation.chaseStoppedCheckOpenOrders` and `perps.errors.tpslProtectionLost` have dedicated messages. A stopped chase can leave a child order open. Lost TP/SL protection means the controller could not confirm that the previous protection was restored. Use `defaultMessage` when a locale has no translation for a key.

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

Read individual outcomes from `results`, venue execution errors from `failures`, and unresolved cancellation discovery from `discoveryFailures`. Use these fields for `partial` and `none`. A cancel target absent from discovery has no per-order result. An order that disappears after discovery can return an `ORDER_NO_LONGER_OPEN` failure row. A tagged close target that is no longer open can return an explicit failure row.

`getBatchOperationStatus(result)` derives the same value from a provider-level result.

Typed controller substitutes and messenger handler mocks for either batch method must return `status`. When adapting a provider result, return `{ ...result, status: getBatchOperationStatus(result) }`.
