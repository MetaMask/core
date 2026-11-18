# HyperLiquid trading rules in code

Only the venue rules our code encodes. Everything else (margin tiers, HIP-1 tokens, open-interest caps, venue error strings) is on the official pages linked from [README.md](./README.md).

## Fees

| Rule                                 | Constant                                                                                                     | Value                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Base taker rate, Tier 0              | `FEE_RATES.taker`                                                                                            | 0.045%                                           |
| Base maker rate, Tier 0              | `FEE_RATES.maker`                                                                                            | 0.015%                                           |
| HIP-3 multiplier                     | `deployerFeeScale < 1 ? scale + 1 : scale × 2`, times `HIP3_FEE_CONFIG.GrowthModeScale` (0.1) in growth mode | 2× at scale 1.0 without growth mode              |
| HIP-3 scale when `perpDexs` has none | `HIP3_FEE_CONFIG.DefaultDeployerFeeScale`                                                                    | 1.0                                              |
| MetaMask builder fee ceiling         | `BUILDER_FEE_CONFIG.MaxFeeTenthsBps`                                                                         | 100 tenths of a bp (10 bps), sent as `builder.f` |

- `calculateFees` charges the maker rate only for a limit-executing maker order or a chase, otherwise the taker rate, then applies the HIP-3 multiplier.
- The builder fee sent with an order is the ceiling reduced by the discount from the unified fee resolution (`RewardsIntegrationService.resolveFee`: rewards, grant or subscription), floored to whole tenths of a bp (`#getDiscountedBuilderFee`, `quantizeBuilderFeeTenthsBps`).

Code: `src/constants/hyperLiquidConfig.ts` `FEE_RATES`, `HIP3_FEE_CONFIG`, `BUILDER_FEE_CONFIG`; `src/providers/HyperLiquidProvider.ts` `calculateFees`, `#calculateHip3FeeMultiplier`, `#getDiscountedBuilderFee`, `setUserFeeResolution`; `src/services/TradingService.ts`; `src/services/RewardsIntegrationService.ts` `resolveFee`; `src/utils/subscriptionFeeWaiver.ts` `quantizeBuilderFeeTenthsBps`.

## Slippage

| Use                                                | Constant                                         | Value                                   |
| -------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Market orders, batch close, USD-sizing price guard | `ORDER_SLIPPAGE_CONFIG.DefaultMarketSlippageBps` | 300 bps (3%)                            |
| SL child and market-executing triggers             | `ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps`   | 1000 bps (10%)                          |
| Limit orders                                       | `ORDER_SLIPPAGE_CONFIG.DefaultLimitSlippageBps`  | 100 bps (1%); defined, not read by Core |

A caller's `maxSlippageBps` replaces the default. For an order sized from `usdAmount` with `priceAtCalculation`, a price move larger than the tolerance since the calculation throws a price-moved error before signing.

Code: `src/constants/perpsConfig.ts` `ORDER_SLIPPAGE_CONFIG`; `src/utils/orderCalculations.ts` `calculateFinalPositionSize`, `calculateOrderPriceAndSize`.

## Order validation

| Rule                                                                                                                 | Constant                                                            | Error                           |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Minimum order value $10, every DEX                                                                                   | `TRADING_DEFAULTS.amount.mainnet`, `.testnet`                       | `ORDER_SIZE_MIN`                |
| Maximum order value by market max leverage: ≥ 25x $15M, ≥ 20x $5M, ≥ 10x $2M, else $500K; limit-executing orders 10× | `HYPERLIQUID_ORDER_LIMITS`                                          | `ORDER_MAX_VALUE_EXCEEDED`      |
| TWAP duration 5 to 1440 minutes                                                                                      | `HYPERLIQUID_TWAP_LIMITS.MinDurationMinutes`, `.MaxDurationMinutes` | `ORDER_TWAP_DURATION_INVALID`   |
| TWAP total at least $100                                                                                             | `HYPERLIQUID_TWAP_LIMITS.MinNotionalUsd`                            | `ORDER_TWAP_NOTIONAL_TOO_SMALL` |

- The minimum checks `usdAmount` when given, else size × `currentPrice`. Without `currentPrice` it uses the limit price for limit-executing orders and the trigger price for market triggers. A full close skips it.
- The venue's "Order must have minimum value of $10" rejection maps to `ORDER_SIZE_MIN` for opening orders. Reduce-only and strategy orders keep the venue error.
- The maximum is checked when `currentPrice` and `leverage` are given.

Code: `src/providers/HyperLiquidProvider.ts` `validateOrder`, `#placeOrder`, `#placeTwapOrder`; `src/utils/hyperLiquidValidation.ts` `getMaxOrderValue`; `src/constants/hyperLiquidConfig.ts` `TRADING_DEFAULTS`; `src/constants/perpsConfig.ts` `HYPERLIQUID_ORDER_LIMITS`, `HYPERLIQUID_TWAP_LIMITS`.

## Price and size format

| Rule                                                                                     | Constant                                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Integer prices pass through unchanged                                                    |                                                      |
| Other prices keep at most 6 − `szDecimals` decimals                                      | `DECIMAL_PRECISION_CONFIG.MaxPriceDecimals` (6)      |
| Then at most 5 significant figures                                                       | `DECIMAL_PRECISION_CONFIG.MaxSignificantFigures` (5) |
| Sizes keep `szDecimals`, trailing zeros removed; TP/SL and reduce-only sizes are floored |                                                      |

`formatHyperLiquidPrice` does not check tick divisibility. It is exported from the package.

Code: `src/utils/hyperLiquidAdapter.ts` `formatHyperLiquidPrice`, `formatHyperLiquidSize`; `src/utils/orderCalculations.ts` `floorToSizeDecimals`, `formatPartialTpslSize`.

## Asset IDs

| Market         | Asset ID                                                       | Constant                                             |
| -------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Main DEX perps | Universe index                                                 |                                                      |
| HIP-3 perps    | 100000 + `perpDexIndex` × 10000 + index (xyz index 0 → 110000) | `HIP3_ASSET_ID_CONFIG.BaseAssetId`, `.DexMultiplier` |
| Spot           | 10000 + pair index                                             | `SPOT_ASSET_ID_OFFSET`                               |

Code: `src/utils/hyperLiquidAdapter.ts` `calculateHip3AssetId`; `src/constants/hyperLiquidConfig.ts` `HIP3_ASSET_ID_CONFIG`, `SPOT_ASSET_ID_OFFSET`.

## Margin and collateral

- Cross margin is offered on main-DEX and HIP-3 markets unless the venue marks them `onlyIsolated` or sets a `marginMode` other than `normal` (`noCross`, `strictIsolated`).
- Without Unified Account, adding to an isolated HIP-3 position transfers the whole position's margin before the order, because the venue checks it against the full position. Adding to a Cross position transfers only the new order's margin.
- HIP-3 DEXs whose collateral is not USDC are excluded from market data and order placement.
- With Unified Account or portfolio margin, HyperLiquid moves HIP-3 collateral itself. Otherwise `#handleHip3PreOrder` moves it with `exchangeClient.sendAsset` before the order.

Code: `src/providers/HyperLiquidProvider.ts` `#isCrossMarginSupported`, `#isUsdcCollateralDex`, `#excludeNonUsdcCollateralResults`, `#handleHip3PreOrder`, `#transferBetweenDexs`.
