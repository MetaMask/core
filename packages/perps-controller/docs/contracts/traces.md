# Perps traces and measurements

Core starts traces and sets measurements through the injected `tracer` dependency (`trace`, `endTrace`, `setMeasurement`). The client maps them to its tracing SDK. Mobile's UI, stream, connection and session traces are in [metamask-mobile/docs/perps/instrumentation.md](https://github.com/MetaMask/metamask-mobile/blob/main/docs/perps/instrumentation.md).

Code: `src/types/index.ts` `PerpsPlatformDependencies`

## Operations

| Constant                                  | Value                       | Core use                                    |
| ----------------------------------------- | --------------------------- | ------------------------------------------- |
| `PerpsTraceOperations.OrderSubmission`    | `perps.order_submission`    | Place, edit and cancel order                |
| `PerpsTraceOperations.PositionManagement` | `perps.position_management` | Close, TP/SL, margin, flip                  |
| `PerpsTraceOperations.Operation`          | `perps.operation`           | Withdraw, data fetches, preloads, data lake |
| `PerpsTraceOperations.MarketData`         | `perps.market_data`         | Unused                                      |

Code: `src/types/index.ts` `PerpsTraceOperations`

## Traces Core starts

| Trace name                          | Constant                  | Op                          | Started in                                                                       | Tags                                                                                      |
| ----------------------------------- | ------------------------- | --------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Perps Place Order`                 | `PlaceOrder`              | `perps.order_submission`    | `TradingService.placeOrder`                                                      | `provider`, `orderType`, `market`, `leverage`, `isTestnet`, `pay_token_symbol`            |
| `Perps Edit Order`                  | `EditOrder`               | `perps.order_submission`    | `TradingService.editOrder`                                                       | `provider`, `orderType`, `market`, `leverage`, `isTestnet`                                |
| `Perps Cancel Order`                | `CancelOrder`             | `perps.order_submission`    | `TradingService.cancelOrder`, `cancelOrders`                                     | `provider`, `market`, `isTestnet`. Batch: `provider`, `isBatch`, `isTestnet`              |
| `Perps Close Position`              | `ClosePosition`           | `perps.position_management` | `TradingService.closePosition`, `closePositions`                                 | `provider`, `symbol`, `closeSize`, `isTestnet`. Batch: `provider`, `isBatch`, `isTestnet` |
| `Perps Update TP/SL`                | `UpdateTpsl`              | `perps.position_management` | `TradingService.#writePositionTpsl`, `PerpsController.resolveRecoveryProtection` | `provider`, `market`, `isTestnet`. Recovery: `provider`                                   |
| `Perps Update Margin`               | `UpdateMargin`            | `perps.position_management` | `TradingService.updateMargin`                                                    | `provider`, `symbol`, `isAdd`, `isTestnet`                                                |
| `Perps Flip Position`               | `FlipPosition`            | `perps.position_management` | `TradingService.flipPosition`                                                    | `provider`, `symbol`, `isTestnet`                                                         |
| `Perps Withdraw`                    | `Withdraw`                | `perps.operation`           | `AccountService.withdraw`                                                        | `assetId`, `provider`, `isTestnet`                                                        |
| `Perps Get Positions`               | `GetPositions`            | `perps.operation`           | `MarketDataService.getPositions`                                                 | `provider`, `isTestnet`                                                                   |
| `Perps Order Fills Fetch`           | `OrderFillsFetch`         | `perps.operation`           | `MarketDataService.getOrderFills`                                                |                                                                                           |
| `Perps Orders Fetch`                | `OrdersFetch`             | `perps.operation`           | `MarketDataService.getOrders`, `getOpenOrders`                                   |                                                                                           |
| `Perps Funding Fetch`               | `FundingFetch`            | `perps.operation`           | `MarketDataService.getFunding`                                                   |                                                                                           |
| `Perps Get Account State`           | `GetAccountState`         | `perps.operation`           | `MarketDataService.getAccountState`                                              |                                                                                           |
| `Perps Get Historical Portfolio`    | `GetHistoricalPortfolio`  | `perps.operation`           | `MarketDataService.getHistoricalPortfolio`                                       |                                                                                           |
| `Perps Get Markets`                 | `GetMarkets`              | `perps.operation`           | `MarketDataService.getMarkets`                                                   |                                                                                           |
| `Perps Get Market Data With Prices` | `GetMarketDataWithPrices` | `perps.operation`           | `MarketDataService.getMarketDataWithPrices`                                      |                                                                                           |
| `Perps Fetch Historical Candles`    | `FetchHistoricalCandles`  | `perps.operation`           | `MarketDataService.fetchHistoricalCandles`                                       |                                                                                           |
| `Perps Market Data Preload`         | `MarketDataPreload`       | `perps.operation`           | `PerpsController.#performMarketDataPreload`                                      | `provider`, `isTestnet`                                                                   |
| `Perps User Data Preload`           | `UserDataPreload`         | `perps.operation`           | `PerpsController.#performUserDataPreload`                                        | `provider`, `isTestnet`                                                                   |
| `Perps Data Lake Report`            | `DataLakeReport`          | `perps.operation`           | `DataLakeService.reportOrder`                                                    | `action`, `symbol`, `provider`, `isTestnet`                                               |

- `pay_token_symbol` is `perps_balance`, the selected token symbol, or `unknown_token`.
- Batch close and batch cancel reuse the single-operation trace name and add the `isBatch: 'true'` tag. Batch close adds `closeAll` to the trace data. Batch cancel adds `cancelAll`.
- `startMarketDataPreload` runs both preloads at once, then every 5 minutes. Each preload skips a run when its cached entry is younger than 30 seconds. The user data preload also skips when a matching cache exists and the WebSocket is connected.

Code: `src/types/index.ts` `PerpsTraceNames`; `src/services/TradingService.ts`; `src/services/AccountService.ts` `withdraw`; `src/services/MarketDataService.ts`; `src/services/DataLakeService.ts` `reportOrder`; `src/PerpsController.ts` `startMarketDataPreload`, `#performMarketDataPreload`, `#performUserDataPreload`, `resolveRecoveryProtection`

## Measurements Core sets

All values are in milliseconds.

| Measurement                                      | Constant                                       | Set in                                                |
| ------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| `perps.operation.get_positions`                  | `PerpsGetPositionsOperation`                   | `TradingService.#loadPositionData`                    |
| `perps.operation.get_open_orders`                | `PerpsGetOpenOrdersOperation`                  | `MarketDataService.getOpenOrders`                     |
| `perps.operation.market_data_preload`            | `PerpsMarketDataPreload`                       | `PerpsController.#performMarketDataPreload`           |
| `perps.operation.user_data_preload`              | `PerpsUserDataPreload`                         | `PerpsController.#performUserDataPreload`             |
| `perps.api.data_lake_call`                       | `PerpsDataLakeApiCall`                         | `DataLakeService.reportOrder`                         |
| `perps.api.rewards_order_execution_fee_discount` | `PerpsRewardsOrderExecutionFeeDiscountApiCall` | `TradingService.#calculateFeeDiscountWithMeasurement` |

Code: `src/constants/performanceMetrics.ts` `PerpsMeasurementName`; `src/services/TradingService.ts`; `src/services/MarketDataService.ts` `getOpenOrders`; `src/services/DataLakeService.ts` `reportOrder`; `src/PerpsController.ts`

## Defined, not used by Core

Core defines these names and never starts or sets them.

| Kind                                  | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traces                                | `Perps Connection Establishment`, `Perps WebSocket First Positions`, `Perps WebSocket First Orders`, `Perps WebSocket First Account`, `Perps Account Switch Reconnection`, `Perps Deposit` (`Deposit`), `Perps WebSocket Connected` (`WebsocketConnected`), `Perps Rewards API Call` (`RewardsApiCall`), `Perps Market Data Update`                                                                                                                                                                                           |
| Operation                             | `perps.market_data` (`MarketData`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| WebSocket and connection measurements | `perps.websocket.connection_establishment`, `perps.websocket.connection_with_preload`, `perps.websocket.account_switch_reconnection`, `perps.websocket.health_check`, `perps.websocket.reconnection_health_check`, `perps.websocket.first_position_data`, `perps.connection.provider_init`, `perps.connection.subscriptions_preload`, `perps.connection.cleanup`, `perps.connection.controller_reinit`, `perps.connection.reconnection_preload`, `perps.connection.account_state_fetch`, `perps.connection.new_account_fetch` |
| API measurements                      | `perps.api.rewards_points_estimation`, `perps.api.rewards_fee_discount`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Screen measurements                   | `perps.screen.withdrawal_loaded`, `perps.screen.markets_loaded`, `perps.screen.asset_loaded`, `perps.screen.trade_loaded`, `perps.screen.close_loaded`, `perps.screen.transaction_history_loaded`, `perps.screen.tab_loaded`                                                                                                                                                                                                                                                                                                  |
| UI measurements                       | `perps.ui.leverage_bottom_sheet_loaded`, `perps.ui.order_submission_toast_loaded`, `perps.ui.order_confirmation_toast_loaded`, `perps.ui.close_order_submission_toast_loaded`, `perps.ui.close_order_confirmation_toast_loaded`                                                                                                                                                                                                                                                                                               |

Core also never starts `Perps WebSocket Disconnected`. The `PerpsTraceName` type also lists `Perps Open Position` and the UI view names (`Perps Order View`, `Perps Market List View` and others). Core starts none of them.

Code: `src/types/index.ts` `PerpsTraceName`, `PerpsTraceNames`, `PerpsTraceOperations`; `src/constants/performanceMetrics.ts` `PerpsMeasurementName`

## Adding a trace or measurement

1. Add the trace name to `PerpsTraceName` and `PerpsTraceNames`, or the measurement to `PerpsMeasurementName`. Measurement names follow `perps.<category>.<metric>`.
2. Start it in Core code through `this.#deps.tracer`.
3. Mirror a new trace name in the client's own trace-name list.

Code: `src/types/index.ts` `PerpsTraceName`, `PerpsTraceNames`; `src/constants/performanceMetrics.ts` `PerpsMeasurementName`
