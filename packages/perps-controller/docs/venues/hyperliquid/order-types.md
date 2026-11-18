# HyperLiquid order types

How `HyperLiquidProvider` turns `OrderParams` into HyperLiquid SDK orders. HyperLiquid's own order types and time-in-force rules are on the exchange endpoint page linked from [README.md](./README.md).

## Order shape

Each order is `{ a, b, p, s, r, t, c }`.

| Field | Value                                                 |
| ----- | ----------------------------------------------------- |
| `a`   | Asset ID (see [trading-rules.md](./trading-rules.md)) |
| `b`   | `isBuy`                                               |
| `p`   | Price formatted by `formatHyperLiquidPrice`           |
| `s`   | Size formatted by `formatHyperLiquidSize`             |
| `r`   | `reduceOnly ?? false`                                 |
| `t`   | Order type, below                                     |
| `c`   | `clientOrderId`, when given                           |

The request also carries `grouping` (`na`, `normalTpsl`, `positionTpsl`) and, when a builder fee applies, `builder: { b, f }` with `f` in tenths of a basis point. The types come from the SDK `OrderParameters`.

Code: `src/utils/orderCalculations.ts` `buildOrdersArray`; `src/types/hyperliquid-types.ts` `SDKOrderParams`; `src/providers/HyperLiquidProvider.ts` `#submitOrderWithRollback`, `#getBuilderOrderContext`.

## Main order type

| `orderType`                         | SDK `t`                                                                                               | `p`                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `market`                            | `{ limit: { tif: 'FrontendMarket' } }`                                                                | Live price moved by `maxSlippageBps` (default `DefaultMarketSlippageBps`, 300)   |
| `limit`                             | `{ limit: { tif } }`, `tif` from `timeInForce`: `GTC` → `Gtc` (default), `IOC` → `Ioc`, `ALO` → `Alo` | Limit price, no slippage                                                         |
| `stop_market`, `take_profit_market` | `{ trigger: { isMarket: true, triggerPx, tpsl } }`                                                    | Trigger price moved by `maxSlippageBps` (default `DefaultTpslSlippageBps`, 1000) |
| `stop_limit`, `take_profit_limit`   | `{ trigger: { isMarket: false, triggerPx, tpsl } }`                                                   | Limit price                                                                      |

- There is no pure market order. A market order is an aggressive limit at the slippage-adjusted price with `FrontendMarket`.
- A buy moves the price up by the slippage, a sell moves it down.
- `tpsl` is `sl` for stop types and `tp` for take-profit types.

| Error                               | When                                                         |
| ----------------------------------- | ------------------------------------------------------------ |
| `ORDER_TIME_IN_FORCE_NOT_SUPPORTED` | `timeInForce` on anything but `limit`                        |
| `ORDER_LIMIT_PRICE_REQUIRED`        | `limit`, `stop_limit` or `take_profit_limit` without a price |
| `ORDER_TRIGGER_PRICE_REQUIRED`      | Trigger type without `triggerPrice`                          |
| `ORDER_TRIGGER_PRICE_POSITIVE`      | Trigger price not positive, or zero at the asset's precision |

Code: `src/utils/orderCalculations.ts` `calculateOrderPriceAndSize`, `buildMainOrderTypeField`, `formatTriggerPrice`; `src/utils/orderTypes.ts` `toSDKTimeInForce`, `isTriggerOrderType`, `isLimitExecutionOrderType`, `TRIGGER_ORDER_TYPES`.

## Other placement paths

| Path                      | Order type                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attached TP/SL            | TP child limit trigger, SL child market trigger. See [tpsl.md](../../tpsl.md).                                                                                                                    |
| `updatePositionTPSL` legs | See [tpsl.md](../../tpsl.md)                                                                                                                                                                      |
| `closePosition`           | Through `#placeOrder` with `reduceOnly: true`; `orderType` defaults to `market`, so `FrontendMarket`                                                                                              |
| `closePositions` (batch)  | `{ limit: { tif: 'Ioc' } }`, `r: true`, price moved by `DefaultMarketSlippageBps`                                                                                                                 |
| Scale ladder              | `Gtc` limit per rung                                                                                                                                                                              |
| Chase                     | `Alo` (post-only), so it rests at the touch instead of crossing                                                                                                                                   |
| `editOrder`               | Limit keeps `timeInForce` through `toSDKTimeInForce`; market uses `FrontendMarket`. Trigger and strategy edits are rejected (`ORDER_EDIT_TRIGGER_UNSUPPORTED`, `ORDER_EDIT_STRATEGY_UNSUPPORTED`) |
| TWAP                      | `exchangeClient.twapOrder` with duration and randomize; no time in force                                                                                                                          |

The SDK's `LiquidationMarket` time in force is not used.

Code: `src/providers/HyperLiquidProvider.ts` `closePosition`, `closePositions`, `#placeScaleOrder`, `#restChaseOrder`, `editOrder`, `#placeTwapOrder`.
