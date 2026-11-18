# Lighter capabilities

What `LighterProvider` declares and implements. Lighter is a POC provider; how it is enabled is in [architecture.md](../../architecture.md).

## `getOrderCapabilities`

| Status                                    | When                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| `unavailable`, `invalid_symbol`           | Blank symbol                                            |
| `unavailable`, `provider_unavailable`     | Provider disconnected, or market metadata reload failed |
| `unavailable`, `market_not_found`         | Symbol not in the market list                           |
| `unavailable`, `order_market_unsupported` | Market not active, or not a perpetual                   |
| `ready`                                   | Otherwise, with the fields below                        |

| Field                          | Value                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supportedStrategies`          | `scale`; `scale` and `chase` when the Chase probe is on, on testnet, with a signer bridge                                                                                                    |
| `supportedMarginModes`         | `cross`, `isolated`                                                                                                                                                                          |
| `supportedTriggerOrderTypes`   | `stop_market`, `stop_limit`, `take_profit_market`, `take_profit_limit`                                                                                                                       |
| `attachedTpsl`                 | `submission: 'native-oto-otoco'`, `childCoverage: 'venue-native-zero-size'`, `partialSizes: false`, `lifecycleVerification: 'pending'`, `cancellation: 'explicit-exact-owned-orders'`        |
| `positionTpsl`                 | `supportsExpectedPosition: true`, `childOrderIds: 'request-correlated'`, TP `take_profit_market`, SL `stop_market`, `defaultCoverage: 'position-snapshot'`                                   |
| `positionTpsl.partialCoverage` | `single: true`, `pair: 'equal-quantity-oco'`, `supportedPairs` `equal-quantity-oco` and `independent`, `replacement: 'cancel-before-create'`, `recovery: 'explicit-current-position-intent'` |

- An equal-quantity pair is a native OCO. Independent legs have no sibling cancellation.
- Snapshot coverage does not resize with the position.
- TWAP is not advertised. `PerpsController.getOrderCapabilities` returns `not_implemented` for a provider without the method.

Code: `src/providers/LighterProvider.ts` `getOrderCapabilities`; `src/utils/orderTypes.ts` `TRIGGER_ORDER_TYPES`; `src/PerpsController.ts` `getOrderCapabilities`.

## Order rules

| Order                               | Lighter time in force                                                                   | Expiry                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Market                              | Immediate or cancel                                                                     | None (0)                                        |
| Limit                               | Good till time; `timeInForce: 'ALO'` sends post-only; `'IOC'` sends immediate or cancel | Signer default (−1, 28 days) for resting orders |
| `stop_market`, `take_profit_market` | Immediate or cancel once triggered                                                      | Signer default; triggers stay pending           |
| `stop_limit`, `take_profit_limit`   | Good till time                                                                          | Signer default                                  |

Other order types and strategies, except the ones below, are rejected with the provider's not-supported error.

Code: `src/providers/LighterProvider.ts` `placeOrder`, `isLighterMakerOrder`; `src/constants/lighterConfig.ts` `LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL`, `LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME`, `LIGHTER_TIME_IN_FORCE_POST_ONLY`, `LIGHTER_ORDER_EXPIRY_NONE`.

## Strategies

| Strategy | Rules                                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scale    | Advertised. Cancellations in one group share a 10 s settlement window (`LIGHTER_SCALE_SETTLEMENT_WINDOW_MS`).                                                                                                                                                                                                                      |
| Chase    | Testnet only, signer required. `chaseTestnetProbe` throws on mainnet and the controller passes it only on testnet. Opening orders only, at existing 1x leverage, notional at most $20 (`LIGHTER_NATIVE_PROBE_MAX_NOTIONAL`). Defaults 15 s interval, 60 s duration, 1 repricing, 100 bps distance; limits 300 s and 20 repricings. |
| TWAP     | Only behind the testnet-only `nativeTwapTestnetProbe` constructor option, which `PerpsController` does not pass                                                                                                                                                                                                                    |

Code: `src/providers/LighterProvider.ts` constructor, `#placeChaseProbe`, `#placeNativeTwapProbe`; `src/PerpsController.ts` `registerLighterProvider`; `src/constants/lighterConfig.ts` `LIGHTER_CHASE_*`, `LIGHTER_NATIVE_PROBE_MAX_NOTIONAL`, `LIGHTER_SCALE_SETTLEMENT_WINDOW_MS`.

## Other features

| Feature                 | Status                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accounts                | Standard accounts only. Premium and unverified accounts are refused across the account-bound surface.                                                                                      |
| Writes                  | Need a `signerBridge`; without one the provider is read-only                                                                                                                               |
| Close                   | Whole position, or partial by `size` or `usdAmount`                                                                                                                                        |
| Edit                    | Native edit of the same active, unfilled, ordinary perpetual limit (GTC or post-only) with no linked or trigger protection. The ABI has no order version, so the final venue race remains. |
| `updateMargin`          | Implemented                                                                                                                                                                                |
| `previewPositionModify` | Returns `{ status: 'unsupported', reason: 'provider' }`                                                                                                                                    |
| Deposits                | `getDepositRoutes()` returns `[]`                                                                                                                                                          |
| Withdrawals             | Mainnet USDC bridge route only; testnet returns `[]`                                                                                                                                       |
| Live data               | WebSocket market, account, position, order, fill, order-book and candle streams; REST price polling every 5 s (`LIGHTER_PRICE_POLLING_INTERVAL_MS`) when no WebSocket exists               |

Code: `src/providers/LighterProvider.ts` `#assertStandardAccount`, `closePosition`, `editOrder`, `updateMargin`, `previewPositionModify`, `getDepositRoutes`, `getWithdrawalRoutes`; `src/utils/lighterNativeEdit.ts`.

## Fees

`calculateFees` first resolves the account and refuses a non-Standard one, so a Premium account is never quoted zero. The rate is the market's `makerFee` or `takerFee` from venue metadata (`'0'` when absent). `metamaskFeeRate` is 0 and `chargesMetamaskBuilderFee` is false; no partner or integrator fee is wired.

Code: `src/providers/LighterProvider.ts` `calculateFees`.
