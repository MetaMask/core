[Core] perps-controller: give each exchange its own balance, positions and charts

Demo: Account data shows Hyperliquid and Lighter separately, plus a total. Cancel all cancels on each exchange. A Lighter chart shows Lighter's prices, not Hyperliquid's.

Size: L (technical surface, not time). Depends on TAT-4385.

Context
In aggregated mode, list reads (positions, orders, fills, markets) already fan out to every provider and tag rows with providerId. Account-level data doesn't: getAccountState and subscribeToAccount only use the default provider, so the second venue's balance is invisible. perpsBalances is declared in state but never written. Several batch and stream paths also ignore providerId, so a Lighter chart would show HyperLiquid candles.

Scope
getAccountState returns per-provider account states plus a total (packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:479-483).

subscribeToAccount emits per-provider states plus a total, using the multiplexer's per-provider array emit (AggregatedPerpsProvider.ts:1260-1265, src/aggregation/SubscriptionMultiplexer.ts:434-470).

Write perpsBalances[providerId] from account updates (src/PerpsController.ts:391; declared, never written today).

Route cancelOrders and closePositions by grouping the request on providerId (AggregatedPerpsProvider.ts:847-889).

Route subscribeToCandles, subscribeToOICaps and subscribeToOrderBook by providerId (AggregatedPerpsProvider.ts:1267-1280).

getDepositRoutes and getWithdrawalRoutes return routes from every provider, tagged with providerId (AggregatedPerpsProvider.ts:301-307).

Add providerId to deposit and withdrawal request records in state.

CHANGELOG, with a breaking-change note if the AccountState shape changes.

Acceptance criteria
AC1 [state] In aggregated mode, the account total equals the sum of the per-provider states (test).

AC2 [state] perpsBalances holds one entry per enabled provider and updates from the stream.

AC3 [state] A batch cancel or close with orders on both venues sends each order to its own venue (test).

AC4 [state] Candle, OI-cap and order book subscriptions for a Lighter market reach LighterProvider (test).

AC5 [state] Single-provider modes are unchanged.

AC6 [state] A @metamask/perps-controller release containing this change is published, with a CHANGELOG entry.

Links
Depends on: TAT-4385 (default provider and explicit per-trade routing).

Unblocks: TAT-4405 (Mobile default provider and per-trade venue), TAT-4407 (Mobile per-provider streams and balances).

Related: TAT-4329 (cross margin summary and explicit unavailable result for Lighter account reads; merged in core #11148), TAT-4406 (Lighter money movement).
