# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **BREAKING:** Add `ordersSideFilter`, `ordersSortField`, and `ordersSortDirection` to the flat `ProLayoutPreferences` object (defaults `'all'`, `'time'`, `'desc'`) so Pro Orders panel side-filter and sort preferences persist independently of Positions across markets and app restarts via the existing `getProLayoutPreferences()` / `setProLayoutPreferences(patch)` API; export `ProOrdersSideFilter`, `ProOrdersSortField`, and `ProOrdersSortDirection` ([#9862](https://github.com/MetaMask/core/pull/9862))
  - Consumers that construct a full `ProLayoutPreferences` object (instead of using `DEFAULT_PRO_LAYOUT_PREFERENCES`, the getter, or the patch setter) must include the new fields. Persisted state that predates them remains valid at runtime because the getter/selector merge over defaults.
  - Orders side filter (`all` | `long` | `short`) is independent of `positionsSideFilter`. Orders sort fields are `orderValue` | `size` | `price` | `time`.
- Add `PERPS_EVENT_PROPERTY.PERPS_MODE` (`perps_mode`) for Lite/Pro interface mode analytics (`'lite' | 'pro'`), distinct from existing `PERPS_EVENT_PROPERTY.MODE` (`mode`) which is search intent (`discovery` / `intent` / `browse`) ([#9819](https://github.com/MetaMask/core/pull/9819))
- **BREAKING:** Add `positionsSideFilter`, `positionsSortField`, and `positionsSortDirection` to the flat `ProLayoutPreferences` object (defaults `'all'`, `'positionValue'`, `'desc'`) so Pro Positions/Orders panel sort and side-filter preferences persist across markets and app restarts via the existing `getProLayoutPreferences()` / `setProLayoutPreferences(patch)` API; export `ProPositionsSideFilter`, `ProPositionsSortField`, and `ProPositionsSortDirection` ([#9838](https://github.com/MetaMask/core/pull/9838))
  - Consumers that construct a full `ProLayoutPreferences` object (instead of using `DEFAULT_PRO_LAYOUT_PREFERENCES`, the getter, or the patch setter) must include the new fields. Persisted state that predates them remains valid at runtime because the getter/selector merge over defaults.
- **BREAKING:** Add strategy placement order types to `OrderType`: `twap`, `scale`, and `chase`, placeable through `placeOrder` alongside the existing `market`, `limit`, and trigger types ([#9832](https://github.com/MetaMask/core/pull/9832))
  - `OrderType` is a wider union again, so — exactly as for the trigger types added in 11.0.0 — any consumer signature that narrows it back to a smaller set no longer accepts a value typed `OrderType`. Such signatures must widen to `OrderType` or narrow explicitly at the call site.
  - A strategy placement expands one request into an execution schedule rather than a single resting order, so `OrderResult.orderId` carries a _handle_ — a venue TWAP id, or a client-generated group/session id — rather than an exchange order id. Its documentation says so; the individual exchange ids are in `childOrderIds`.
  - `twap` slices the size over `OrderParams.twapDuration` whole minutes, optionally randomizing slice timing with `OrderParams.twapRandomize`. On HyperLiquid it is submitted through the venue's own TWAP action, not the order book, and `HYPERLIQUID_TWAP_LIMITS` bounds the window to 5–1440 minutes.
  - `scale` fans out `OrderParams.scaleNumOrders` limit orders on an inclusive price ladder between `OrderParams.scaleMinPrice` and `OrderParams.scaleMaxPrice`, submitted as a single batch. Sizes are split in whole units of the asset's size grid, so the rungs sum to exactly the submitted size. The batch is not atomic — the venue can rest some rungs and reject others — so `OrderResult.submittedSize` reports only the rungs that actually rested.
  - The venue applies its minimum order value to what it receives, not to the strategy total: a `scale` ladder's notional must leave every submitted rung above the per-order minimum, and a `twap`'s total must clear the venue's own minimum TWAP size (`HYPERLIQUID_TWAP_LIMITS.MinNotionalUsd`). Both are rejected locally rather than by the exchange. The ladder check needs the asset's size grid, so it runs during placement — before anything is signed — rather than in `validateOrder`, which cannot see the grid and could only guess.
  - A `chase` verifies its order is still live whenever its own price stops showing on the book, so an order that fills without the loop noticing ends the session and releases its concurrency slot instead of holding both until the window closes.
  - A `chase` interrupted by `disconnect` resolves as a failure with `ORDER_CHASE_ABANDONED` rather than a success, because no strategy is running behind it. Interrupted anywhere before its submission it signs nothing at all. Interrupted while that submission is in flight — the one window it cannot check ahead of — it tries to take the order back before returning, through the client it signed with rather than one asked for after the teardown, so an account switch cannot strand it. That attempt is best-effort: the venue can refuse the cancel, and the transport underneath the client may already be closing. When it does not take, the order is reported in `OrderResult.childOrderIds`, where the ordinary single-order cancel can still reach it for as long as the provider signs as the account that placed it.
  - `chase` prices against a book with _every_ chase this provider is running on that side netted out, not only its own order. Two chases each netting only themselves would read the other as the external touch and improve on it in turn, walking each other across an unchanged market. Resting inside the spread makes the chase its own best bid or ask, so reading the raw book would show its own quote as the touch and stop it re-pricing.
  - At most `CHASE_ORDER_CONFIG.MaxActiveSessions` chases run at once, matching the venue's documented cap; a further placement is refused with `ORDER_CHASE_LIMIT_REACHED` before any signing setup or leverage change, and a placement reserves its slot for the round trips before its session registers so concurrent placements cannot overshoot.
  - `chase` re-prices by cancelling and re-placing, and sizes each replacement from what the cancelled order left unfilled — read after the cancel has landed, when no further fill can reach it — so a child that partially filled is not re-placed at the original size.
  - `chase` rests a post-only order one tick inside the spread — above the best bid for a buy, below the best ask for a sell, joining the touch when the spread is a single tick — and re-prices it as the touch moves, bounded by `OrderParams.chaseIntervalMs`, `OrderParams.chaseMaxDurationMs`, and `OrderParams.chaseMaxRepricings` (see the newly exported `CHASE_ORDER_CONFIG` for the defaults). No supported venue exposes a native chase action, so it is emulated client-side; the re-pricing loop is stopped by `cancelOrder` and by `disconnect`.
  - The params model stays provider-agnostic: no protocol vocabulary appears in `OrderParams`, so a second provider can map the same fields onto its own execution primitives.
- **BREAKING:** Narrow `CalculateOrderPriceAndSizeParams.orderType` and `BuildOrdersArrayParams.orderType` to the new `OrdinaryOrderType` (`Exclude<OrderType, StrategyOrderType>`) ([#9832](https://github.com/MetaMask/core/pull/9832))
  - These helpers resolve a single order the exchange can be handed directly. A strategy placement derives its own prices and sizes and never reaches them; passing one would price a `chase` as a limit order it carries no price for, and serialize a `twap` or `scale` as an ordinary market order.
- **BREAKING:** Narrow `ClosePositionParams.orderType` to `Exclude<OrderType, StrategyOrderType>` ([#9832](https://github.com/MetaMask/core/pull/9832))
  - `closePosition` has no path that executes a strategy placement and `ClosePositionParams` carries none of the fields one needs, so the strategy types are refused at the type level rather than at runtime. A consumer passing a value typed `OrderType` into this field must narrow it at the call site.
- **BREAKING:** Add nineteen `PERPS_ERROR_CODES` entries covering strategy placement, editing and cancellation: `ORDER_STRATEGY_PARAMS_NOT_SUPPORTED`, `ORDER_STRATEGY_FIELD_UNSUPPORTED`, `ORDER_STRATEGY_MARKET_UNSUPPORTED`, `ORDER_STRATEGY_HANDLE_UNKNOWN`, `ORDER_STRATEGY_CANCEL_INCOMPLETE`, `ORDER_EDIT_STRATEGY_UNSUPPORTED`, `ORDER_TWAP_DURATION_REQUIRED`, `ORDER_TWAP_DURATION_INVALID`, `ORDER_TWAP_NOTIONAL_TOO_SMALL`, `ORDER_SCALE_RANGE_REQUIRED`, `ORDER_SCALE_RANGE_INVALID`, `ORDER_SCALE_COUNT_INVALID`, `ORDER_SCALE_SIZE_TOO_SMALL`, `ORDER_SCALE_NOTIONAL_TOO_SMALL`, `ORDER_CHASE_INTERVAL_INVALID`, `ORDER_CHASE_DURATION_INVALID`, `ORDER_CHASE_LIMIT_REACHED`, `ORDER_CHASE_ABANDONED`, and `ORDER_CHASE_TOUCH_UNAVAILABLE` ([#9832](https://github.com/MetaMask/core/pull/9832))
  - Like `EXCHANGE_ACCOUNT_NOT_FOUND` and the multi-sig codes in 11.0.0, this widens the exported `PerpsErrorCode` union, so consumers that key an exhaustive `Record<PerpsErrorCode, …>` stop compiling until they add an entry for every new code. Both first-party clients do: Mobile's `app/components/UI/Perps/utils/translatePerpsError.ts` and Extension's `ui/components/app/perps/utils/translate-perps-error.ts`.
  - These cover the rejections this package decides for itself: each is a typed code rather than an opaque exchange error, and none of them reaches the venue as a signed request. Most are decided before any request at all. The exceptions are the ladder's `ORDER_SCALE_SIZE_TOO_SMALL` and `ORDER_SCALE_NOTIONAL_TOO_SMALL`, which need the asset's size precision and so follow one read of its metadata, and `ORDER_CHASE_TOUCH_UNAVAILABLE`, which follows the order-book read — all still before anything is signed. A submission the venue itself rejects is not among them: as for an ordinary order, that surfaces through the provider's existing error mapping carrying the venue's own message. `ORDER_STRATEGY_CANCEL_INCOMPLETE` and `ORDER_CHASE_ABANDONED` describe what happened after a request and are not rejections at all.
  - What the non-parameter codes mean: `ORDER_STRATEGY_MARKET_UNSUPPORTED` — a strategy was requested on a market the provider cannot run it on (on HyperLiquid, a HIP-3 sub-exchange). `ORDER_EDIT_STRATEGY_UNSUPPORTED` — `editOrder` cannot modify a strategy placement. `ORDER_STRATEGY_HANDLE_UNKNOWN` — `cancelOrder` was given a strategy handle this provider does not hold. `ORDER_STRATEGY_CANCEL_INCOMPLETE` — a cancel left part of the placement resting, and the handle stays valid for a retry. `ORDER_CHASE_TOUCH_UNAVAILABLE` — the order book had no price on the side a chase must rest at. `ORDER_CHASE_LIMIT_REACHED` — the venue's cap on simultaneous chases is already in use. `ORDER_CHASE_ABANDONED` — the provider was torn down while a chase was being placed.
- Add `CancelOrderParams.orderType`, which selects the cancellation path for a strategy handle: the venue's TWAP cancel action for `twap`, a batch cancel of every child for `scale`, and stopping the session plus cancelling its live order for `chase` ([#9832](https://github.com/MetaMask/core/pull/9832))
  - Omitting it — what every existing caller does — cancels a single resting order exactly as before.
  - A cancel that leaves part of a strategy resting returns `ORDER_STRATEGY_CANCEL_INCOMPLETE` and keeps the handle valid, so the caller can retry with it.
- `editOrder` now rejects a strategy placement with `ORDER_EDIT_STRATEGY_UNSUPPORTED` instead of submitting it as an ordinary order modification ([#9832](https://github.com/MetaMask/core/pull/9832))
  - A strategy placement is not a single resting order, so there is nothing to rewrite: the edit would have gone through as a plain market/limit modification and quietly dropped the TWAP schedule, the ladder, or the chase loop. Cancel by the strategy handle and place again.
- A cancel refused because the order had already filled or been cancelled now completes rather than reporting `ORDER_STRATEGY_CANCEL_INCOMPLETE` ([#9832](https://github.com/MetaMask/core/pull/9832))
  - The venue answers a cancel it cannot match with a rejection, but nothing of that order is resting, which is what the caller asked for. Only a rejection that leaves the order on the book keeps the strategy handle open for a retry.
- Add `OrderResult.childOrderIds`, the exchange ids a strategy placement expanded into ([#9832](https://github.com/MetaMask/core/pull/9832))
  - For a `scale` ladder these stay valid — the rungs are placed once and never replaced — so a consumer that has lost the session-scoped handle can still cancel them through the existing batch cancel.
  - For a `chase` this is only the order resting at placement time. The strategy cancels and re-places as the touch moves, and each replacement's id is held in the session rather than reported here, so the value goes stale on the first re-price; cancel a live chase by its handle.
- Add `OrderParams.twapDuration`, `OrderParams.twapRandomize`, `OrderParams.scaleMinPrice`, `OrderParams.scaleMaxPrice`, `OrderParams.scaleNumOrders`, `OrderParams.chaseIntervalMs`, `OrderParams.chaseMaxDurationMs`, and `OrderParams.chaseMaxRepricings` ([#9832](https://github.com/MetaMask/core/pull/9832))
  - Each field is required by the placement that owns it and rejected on every other one, so a stray field can never be silently dropped. A strategy placement also rejects `price`, `triggerPrice`, `timeInForce`, `clientOrderId`, and attached TP/SL, all of which the strategy decides for itself or cannot express — a TWAP action carries no client id, a scale ladder is many orders where a client id must be unique per order, and a chase replaces its order on every re-price.
  - Invalid parameters are rejected with a typed `PERPS_ERROR_CODES` value, and nothing invalid is ever signed; see the new error codes entry below for the full list and for which few are decided after a read rather than before any request.
- Add `twap`, `scale` and `chase` to `PERPS_EVENT_VALUE.ORDER_TYPE`, which dashboards key on and which `TradingService` emits verbatim ([#9832](https://github.com/MetaMask/core/pull/9832))
- Add the `StrategyOrderType` and `OrdinaryOrderType` types, plus `STRATEGY_ORDER_TYPES`, `isStrategyOrderType`, `SCALE_ORDER_COUNT`, `computeScalePriceLadder`, `splitScaleSizes`, `computeChaseQuotePrice`, `getPriceTick`, `CHASE_ORDER_CONFIG`, and `HYPERLIQUID_TWAP_LIMITS` ([#9832](https://github.com/MetaMask/core/pull/9832))
- Add an optional schema-v2 Terminal market snapshot path with strict identity, freshness, completeness, unit, and payload validation before falling back to HyperLiquid ([#9815](https://github.com/MetaMask/core/pull/9815)).
- Add `PerpsController.getUserDataSnapshot()` to fetch and cache positions, open orders, and account state as one account- and DEX-scoped result ([#9815](https://github.com/MetaMask/core/pull/9815)).
- Add a subscription fee-waiver source to the MetaMask builder fee, wired through the optional `PerpsPlatformDependencies.subscription.getPerpsBenefits()` dependency, along with the `PerpsSubscriptionBenefits`, `PerpsSubscriptionUsage`, `PerpsSubscriptionFeeWaiverStatus`, `PerpsFeeSource`, and `PerpsFeeResolution` types and the `SUBSCRIPTION_BENEFITS_CACHE` constant ([#9857](https://github.com/MetaMask/core/pull/9857))
  - `RewardsIntegrationService.resolveFee()` returns the lowest fee across the default, rewards (VIP and season, already collapsed by `RewardsController`), and subscription sources, together with the winning source and the subscription gate outcome. The subscription source contributes `0` bips only when the eligibility gate — `status=active`, `perpsFeeWaiver` entitled, `usage=available`, not exhausted — passes on the cached benefits snapshot.
  - `RewardsIntegrationService.resolveFee()` and `getSubscriptionFeeWaiverStatus()` are pure cache consumers and never start a subscription request on the order-signing path. `PerpsController.calculateFees()` owns preview hydration through `refreshSubscriptionBenefits()`. A snapshot older than `SUBSCRIPTION_BENEFITS_CACHE.MaxStaleMs` can no longer grant the waiver, and a failed or unreachable refresh falls back to the next-lowest source instead of erroring or over-granting.
  - Refreshes are throttled on the last read _attempt_ rather than the last success, so a benefits outage retries at most once per `FreshMs` window instead of once per preview.
  - `PerpsController.invalidateSubscriptionBenefits()` (also exposed as the `PerpsController:invalidateSubscriptionBenefits` messenger action) drops the cached snapshot. Call it on sign-out or a profile switch: the snapshot carries no profile identity, so without it the previous profile's benefits keep answering until the next successful refresh. A read already in flight when it is called is discarded rather than written back, so it cannot repopulate the cache for the previous identity.
  - Clients that do not wire `subscription` are unaffected: the resolver keeps returning the rewards or default fee.
- Add `FeeCalculationResult.subscription`, surfacing the subscription waiver's `eligible`, `reason`, and `remainingNotionalUsd` on `PerpsController.calculateFees()` from the same cached benefits snapshot ([#9857](https://github.com/MetaMask/core/pull/9857))
  - The preview refreshes the benefits cache when needed, but does not adjust the quoted fee rates or mutate the notional cap. The field is omitted entirely when no `subscription` dependency is wired.

### Changed

- `RewardsIntegrationService.calculateUserFeeDiscount()` now returns the unified resolver's winning discount instead of the rewards discount alone, while preserving `undefined` when no source has resolved. TradingService passes the full `PerpsFeeResolution` to providers, isolates it across concurrent operations, and applies it to flip orders. HyperLiquid uses the configured subscription builder only after account-scoped approval through `PerpsController.approveSubscriptionBuilderFee()`; otherwise it uses the ordinary builder at the standard fee ([#9857](https://github.com/MetaMask/core/pull/9857))

- `getTriggerExecution` now reports `'limit'` for `scale` and `chase`, which rest limit orders on the book without carrying an `OrderParams.price`, and `'market'` for `twap`, whose suborders cross it ([#9832](https://github.com/MetaMask/core/pull/9832))
  - This is what decides the fee tier and the max order value, so a scale ladder and a chase are no longer quoted at the taker rate or held to the tighter market-order cap. `calculateFees` additionally quotes `chase` at the maker rate regardless of `isMaker`, because a post-only order can only fill as a maker.
  - `isLimitExecutionOrderType` is unchanged: it answers the narrower question of whether `OrderParams.price` carries a real limit price, which for a strategy placement it does not.
- `TriggerOrderType` is now spelled out as `'stop_market' | 'stop_limit' | 'take_profit_market' | 'take_profit_limit'` instead of being derived as `Exclude<OrderType, 'market' | 'limit'>` ([#9832](https://github.com/MetaMask/core/pull/9832))
  - The resolved type is unchanged for existing consumers. Deriving it meant that any order type added to `OrderType` that was neither `market` nor `limit` was pulled into the trigger union automatically and started demanding a trigger price it had no concept of.
- Reuse provider DEX discovery for subscriptions, and start account preloading independently from market preloading to reduce cold-start blocking ([#9815](https://github.com/MetaMask/core/pull/9815)).
- Require a selected EVM address and the current Hyperliquid network/HIP-3/DEX identity before returning cached account data; legacy or mismatched entries now fail closed and refresh ([#9815](https://github.com/MetaMask/core/pull/9815)).

### Fixed

- Prevent `CLIENT_NOT_INITIALIZED` errors during cold-start and reconnection by awaiting in-flight initialization in trading action methods (`placeOrder`, `editOrder`, `cancelOrder`, `closePosition`, `deposit`, `withdraw`, etc.) ([#9032](https://github.com/MetaMask/core/pull/9032))
- Fix compound error string (`CLIENT_NOT_INITIALIZED: <reason>`) breaking i18n translation lookup — now always throws the plain `CLIENT_NOT_INITIALIZED` code ([#9032](https://github.com/MetaMask/core/pull/9032))
- Recreate all four SDK clients (including `ExchangeClient` and HTTP `InfoClient`) during WebSocket reconnection so `isInitialized()` returns `true` after reconnect ([#9032](https://github.com/MetaMask/core/pull/9032))
- Bring the HyperLiquid SDK clients up before the provider's first asset-metadata read, so a trading action taken during cold start or after a disconnect waits for the clients instead of failing with `CLIENT_NOT_INITIALIZED` ([#9865](https://github.com/MetaMask/core/pull/9865))
  - `placeOrder` resolves asset info before it ensures trading readiness, so waiting for controller initialization alone was not enough: the metadata read still hit an uninitialized `InfoClient` and the order failed. Warm reads are unaffected — the cached path returns before the client check.
- Publish WebSocket-backed SDK clients only after reconnection succeeds, while keeping HTTP-backed metadata and trading clients available during retries ([#9868](https://github.com/MetaMask/core/pull/9868))

## [11.0.0]

### Added

- **BREAKING:** Add trigger placement order types to `OrderType`: `stop_market`, `stop_limit`, `take_profit_market`, and `take_profit_limit`, placeable through `placeOrder` alongside the existing `market` and `limit` types ([#9674](https://github.com/MetaMask/core/pull/9674))
  - `OrderType` is a wider union, so any consumer signature that narrows it back to `'market' | 'limit'` no longer accepts a value typed `OrderType` — including anything fed from `OrderFormState.type` or `selectPendingTradeConfiguration`. Mobile has six such signatures (`usePerpsOrderFees`, `usePerpsTPSLForm`, `PerpsLeverageBottomSheet`, `usePerpsClosePosition`, the `PerpsTPSL` route params in `types/navigation.ts`, and `determineMakerStatus` in `utils/orderUtils.ts`); they must widen to `OrderType` (or narrow explicitly at the call site) in the client update that adopts this release.
  - `OrderParams.triggerPrice` sets the price at which the resting order activates. It is required for the four trigger types and rejected for `market`/`limit` orders, so a stray trigger price can never be silently dropped.
  - `*_limit` types execute at `OrderParams.price` once triggered; `*_market` types execute as market orders, with a limit price derived from the trigger price and capped by `OrderParams.maxSlippageBps`, falling back to `ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps` when the caller does not set a tolerance.
  - The params model stays provider-agnostic: no protocol vocabulary (HyperLiquid's `tpsl`, `triggerPx`, `isMarket`) appears in `OrderParams`, so a second provider can map the same fields.
- Add partial (quantity-scoped) TP/SL via `OrderParams.takeProfitSize` / `OrderParams.stopLossSize` and `UpdatePositionTPSLParams.takeProfitSize` / `UpdatePositionTPSLParams.stopLossSize`; omitting a size keeps the previous whole-order/whole-position behavior ([#9674](https://github.com/MetaMask/core/pull/9674))
  - On HyperLiquid, a size cannot be expressed under `positionTpsl` grouping, so `updatePositionTPSL` submits partial TP/SL as standalone reduce-only trigger orders with `na` grouping and explicit sizes. In both the partial and whole-position paths the pre-cancel sweep clears previously placed standalone reduce-only triggers for the symbol so repeated calls stay idempotent, but never a TP/SL child of another pending order. Note that this includes standalone triggers the caller placed independently through `placeOrder` (for example a manual reduce-only stop on the same market), which are cancelled as part of the replace.
- Add `Position.takeProfitOrders` and `Position.stopLossOrders` (`PositionTriggerOrder[]`), the complete view of the trigger orders attached to a position — including partial ones, which the scalar `takeProfitPrice`/`stopLossPrice` fields cannot represent. Each entry carries `orderId`, `direction`, `orderType`, `triggerPrice`, `size` (resolved to the position size when the protocol encodes "whole position"), `isPartial`, and `reduceOnly` ([#9674](https://github.com/MetaMask/core/pull/9674))
  - `direction` (`'stop' | 'take_profit'`) is always present and is what sorts a trigger into one array or the other. `orderType` is optional: HyperLiquid sometimes reports a bare `Trigger`, naming neither direction nor execution, and while the direction is recoverable from the trigger price against the entry, the execution mode is not — so it is left unstated rather than guessed. Such an order is still reported, in both the arrays and the counts derived from them.
  - A trigger sitting exactly at the entry price is classified as a stop on both sides, matching the legacy price fallback the scalar `takeProfitPrice`/`stopLossPrice` fields use, so the arrays and the scalars cannot disagree about the same order.
- Add `Order.triggerOrderType`, the normalized placement type of an open trigger order, so open-orders state round-trips the placement type alongside the existing `triggerPrice`, `reduceOnly`, and size fields ([#9674](https://github.com/MetaMask/core/pull/9674))
- Add `OrderParams.tpslLinkage` (`'none' | 'order' | 'position'`), a provider-agnostic way to say how an attached TP/SL is linked — to this order, to the resulting position, or absent — replacing the HyperLiquid-shaped `grouping` without removing it ([#9674](https://github.com/MetaMask/core/pull/9674))
  - `grouping` (`'na' | 'normalTpsl' | 'positionTpsl'`) is deprecated but still honoured for `'normalTpsl'`, so those callers keep working. `tpslLinkage` takes precedence; supplying both with different meanings is rejected with the new `ORDER_TPSL_LINKAGE_CONFLICT` error rather than silently resolved. `'positionTpsl'` is no longer accepted on `placeOrder` at all, and `'na'` is no longer accepted when the order carries an attached TP/SL — see the breaking entry under Changed.
  - `adaptTpslLinkageToGrouping` maps the linkage onto HyperLiquid's grouping inside the adapter layer, keeping protocol wording out of `OrderParams`.
- Add the `TriggerOrderType`, `OrderExecution`, `TriggerDirection`, `TpslLinkage`, and `PositionTriggerOrder` types ([#9674](https://github.com/MetaMask/core/pull/9674))
- Add order-type helpers `TRIGGER_ORDER_TYPES`, `isTriggerOrderType`, `isLimitExecutionOrderType`, `getTriggerExecution`, `getTriggerDirection`, `buildTriggerOrderType`, and `buildPositionTriggerOrderFromOrder`, plus the HyperLiquid mappers `adaptTriggerOrderTypeFromSDK` and `adaptPositionTriggerOrderFromSDK` ([#9674](https://github.com/MetaMask/core/pull/9674))
- Add an executable proof of the advanced order-type contract under `tests/`: a case matrix shared by a Jest guard (`tests/src/e2e/advanced-orders.contract.test.ts`, simulated, runs in CI) and a script (`tests/e2e/advanced-orders.e2e.ts`) that replays it against HyperLiquid testnet. The matrix also probes the venue behaviours the controller's refusals rest on — that a `positionTpsl` batch containing a plain order is rejected, that a zero `triggerPx` or zero cap price is rejected, that a zero-size trigger is read as whole-position, and that `na`-grouped children outlive a cancelled parent — so each guard is justified by observed behaviour rather than assumption ([#9674](https://github.com/MetaMask/core/pull/9674))
- Add order validation error codes `ORDER_TRIGGER_PRICE_REQUIRED`, `ORDER_TRIGGER_PRICE_POSITIVE`, `ORDER_TRIGGER_PRICE_NOT_SUPPORTED`, `ORDER_TRIGGER_TPSL_UNSUPPORTED`, `ORDER_TPSL_SIZE_INVALID`, `ORDER_EDIT_TRIGGER_UNSUPPORTED`, `ORDER_EDIT_ORDER_UNVERIFIABLE`, `ORDER_TPSL_LINKAGE_CONFLICT`, `ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED`, `ORDER_TPSL_LINKAGE_REQUIRED`, and `ORDER_TIME_IN_FORCE_NOT_SUPPORTED` ([#9674](https://github.com/MetaMask/core/pull/9674))
- Add `floorToSizeDecimals(size, szDecimals)` (exported from `@metamask/perps-controller/utils/*`), which rounds an order size down onto an asset's size grid, snapping values that floating-point error leaves just below a grid point. The result is never greater than the input: a value genuinely below a grid point is truncated rather than snapped up ([#9719](https://github.com/MetaMask/core/pull/9719))
- **BREAKING:** Add `EXCHANGE_ACCOUNT_NOT_FOUND` to `PERPS_ERROR_CODES`, returned by `HyperLiquidProvider.placeOrder` when the wallet has no HyperLiquid account yet (TAT-3343) ([#9709](https://github.com/MetaMask/core/pull/9709))
  - This widens the exported `PerpsErrorCode` union, so consumers that key an exhaustive `Record<PerpsErrorCode, …>` stop compiling until they add an entry for the new code. Both first-party clients do: Mobile's `app/components/UI/Perps/utils/translatePerpsError.ts` and Extension's `ui/components/app/perps/utils/translate-perps-error.ts`.
  - To migrate: add a translation entry for `EXCHANGE_ACCOUNT_NOT_FOUND`. It signals that the wallet has no HyperLiquid account yet, so the message should direct the user to fund the account before trading.
- **BREAKING:** Add `EXCHANGE_MULTI_SIG_REQUIRED` and `EXCHANGE_INVALID_NONCE` to `PERPS_ERROR_CODES` for HyperLiquid exchange rejections that previously surfaced as raw `"multi-sig required"` / `"invalid nonce"` strings (TAT-3633) ([#9750](https://github.com/MetaMask/core/pull/9750))
  - Like `EXCHANGE_ACCOUNT_NOT_FOUND` above, this widens the exported `PerpsErrorCode` union, so consumers that key an exhaustive `Record<PerpsErrorCode, …>` stop compiling until they add entries for both new codes — including Mobile's `app/components/UI/Perps/utils/translatePerpsError.ts` and Extension's `ui/components/app/perps/utils/translate-perps-error.ts`.
  - To migrate: add translation entries for both codes before bumping. `EXCHANGE_MULTI_SIG_REQUIRED` means the account requires a multi-sig wrapper for exchange writes; `EXCHANGE_INVALID_NONCE` means the action nonce was stale or reused and the request should be retried.
- Add `isHyperLiquidMultiSigRequiredError(error)` (exported from `@metamask/perps-controller/utils/*`), which classifies HyperLiquid's `Multi-sig required` rejection — matching the hyphenated spelling observed in the wild and the unhyphenated variant defensively (TAT-3214) ([#9769](https://github.com/MetaMask/core/pull/9769))

### Changed

- Bump `@metamask/account-tree-controller` from `^7.5.5` to `^7.6.0` ([#9779](https://github.com/MetaMask/core/pull/9779))
- Bump `@metamask/network-controller` from `^35.0.0` to `^35.0.1` ([#9758](https://github.com/MetaMask/core/pull/9758))
- **BREAKING:** `placeOrder` now rejects `OrderParams.grouping: 'positionTpsl'` (and the equivalent `tpslLinkage: 'position'`) with `ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED`, where it was previously accepted and passed through to the exchange ([#9674](https://github.com/MetaMask/core/pull/9674))
  - The rejection is not new behaviour so much as an earlier, clearer one: HyperLiquid requires every order in a `positionTpsl` batch to be a trigger, and the parent being placed is an ordinary market or limit order, so the venue rejected the whole batch. This was confirmed against HyperLiquid testnet rather than assumed. A caller that previously sent this combination did not get position-bound TP/SL; it got a failed submission, further from the call site and without a typed error.
  - To bind TP/SL to the position, call `updatePositionTPSL` once the parent has filled — a position must exist before anything can be bound to it. To attach TP/SL to the order itself, use `tpslLinkage: 'order'` (legacy `grouping: 'normalTpsl'`), which is unchanged.
  - `grouping: 'na'` with an attached TP/SL is rejected on the same grounds with `ORDER_TPSL_LINKAGE_REQUIRED`: it submits the children bound to nothing, so an unfilled parent leaves orphan reduce-only triggers that fire against whatever position happens to exist.
- `validateOrderParams` accepts the new placement fields (`triggerPrice`, `takeProfitPrice`, `stopLossPrice`, `takeProfitSize`, `stopLossSize`) and enforces them: trigger types need a positive trigger price, `*_limit` types need a limit price, `market`/`limit` orders reject a trigger price, a trigger placement cannot carry attached TP/SL, and a partial TP/SL size must be positive, no larger than the order size, and paired with its price ([#9674](https://github.com/MetaMask/core/pull/9674))
- `getMaxOrderValue`, `calculateOrderPriceAndSize`, `buildOrdersArray`, and `FeeCalculationParams` accept the full `OrderType` union; trigger types follow their execution mode (`*_limit` is treated as a limit order, `*_market` as a market order) for order-value limits and fee tiers ([#9674](https://github.com/MetaMask/core/pull/9674))
- `validateOrder` falls back to the trigger price when validating the notional of a market-executing trigger order that has no current or limit price ([#9674](https://github.com/MetaMask/core/pull/9674))
- `editOrder` rejects modifying a resting order into a trigger placement with `ORDER_EDIT_TRIGGER_UNSUPPORTED` instead of dropping the trigger, since HyperLiquid's `modify` rebuilds the order as a plain limit/market order ([#9674](https://github.com/MetaMask/core/pull/9674))
  - The resting side of the edit is verified too, and fails closed: when the WebSocket order cache cannot confirm the order's placement type, `editOrder` queries `frontendOpenOrders` and rejects with `ORDER_EDIT_TRIGGER_UNSUPPORTED` for a resting trigger, or `ORDER_EDIT_ORDER_UNVERIFIABLE` when the order is no longer listed. Previously an unverifiable order was edited anyway, which could rebuild a protective stop as a plain order and report success. Both refusals happen before the trading setup that may prompt for a signature and write builder-fee and referral approvals, so a refused edit costs the caller nothing.
- `validateOrderParams` rejects position linkage on an order placement (`tpslLinkage: 'position'` or `grouping: 'positionTpsl'`) with `ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED`, whether or not a TP/SL is attached; every order in a `positionTpsl` batch must be a trigger order, and no order placement produces one — with an attached TP/SL the batch carries the ordinary parent order, and without one it is that parent alone, so HyperLiquid rejected both. Use `updatePositionTPSL` on the position instead ([#9674](https://github.com/MetaMask/core/pull/9674))
- `validateOrderParams` also rejects an attached TP/SL with no linkage (`tpslLinkage: 'none'` or `grouping: 'na'` alongside `takeProfitPrice`/`stopLossPrice`) with `ORDER_TPSL_LINKAGE_REQUIRED`; `na` grouping submits the TP/SL as standalone triggers bound to neither the parent order nor the position, so an unfilled parent left them behind as orphan reduce-only triggers ([#9674](https://github.com/MetaMask/core/pull/9674))
- `adaptOrderToSDK` now throws where it previously never threw: `ORDER_TRIGGER_PRICE_REQUIRED` when a trigger placement has no trigger price, and `ORDER_TIME_IN_FORCE_NOT_SUPPORTED` when a market order or trigger placement carries a time in force ([#9674](https://github.com/MetaMask/core/pull/9674))
- `PERPS_EVENT_VALUE.ORDER_TYPE` lists the four trigger placement types, which `TradingService` emits verbatim in the `order_type` analytics property ([#9674](https://github.com/MetaMask/core/pull/9674))
- `Order.parentOrderId` is now populated for real TP/SL child orders on the WebSocket order stream (previously only ever set by clients for synthetic display rows), which is what lets position state tell a position's own triggers apart from another order's ([#9674](https://github.com/MetaMask/core/pull/9674))
- Bump `@metamask/superstruct` from `^3.1.0` to `^3.4.1` ([#9754](https://github.com/MetaMask/core/pull/9754))

### Fixed

- Hydrate trading readiness before coin validation in `HyperLiquidProvider.cancelOrder`, so a cold start with an empty prefetch asset map self-heals instead of returning `ORDER_UNKNOWN_COIN` for valid markets (TAT-3633) ([#9750](https://github.com/MetaMask/core/pull/9750))
- Map HyperLiquid `"multi-sig required"` and `"invalid nonce"` exchange rejections to `EXCHANGE_MULTI_SIG_REQUIRED` and `EXCHANGE_INVALID_NONCE` across `placeOrder`, `cancelOrder`, and `cancelOrders`, attaching cached abstraction mode to account-mode error log context (TAT-3633) ([#9750](https://github.com/MetaMask/core/pull/9750))
  - `cancelOrder` now reads the per-status error HyperLiquid returns when it rejects a cancel without throwing, so `CancelOrderResult.error` carries the mapped code instead of the generic `'Order cancellation failed'` string. That generic string is still returned when the status entry carries no error text.
  - `cancelOrders` maps both thrown batch failures and per-status rejections the same way, so `CancelOrdersResult.results[].error` carries a `PerpsErrorCode` rather than the raw exchange message for recognized rejections.
- **BREAKING:** `OrderParams.timeInForce` now controls the HyperLiquid time-in-force for plain limit orders instead of being ignored; `GTC`, `IOC`, and post-only `ALO` map to their corresponding SDK values ([#9674](https://github.com/MetaMask/core/pull/9674))
  - Order shapes that cannot carry a time in force — market orders and trigger placements, whose execution is decided when they fire — now reject it with `ORDER_TIME_IN_FORCE_NOT_SUPPORTED`, where previously the field was accepted and ignored for every order type. Callers passing `timeInForce` on anything other than a `limit` order must drop it.
  - The rejection happens in `validateOrderParams`, before `placeOrder` changes leverage on-chain or moves margin to a HIP-3 DEX, so a rejected order leaves no side effects behind.
- Streamed `takeProfitCount` / `stopLossCount` can no longer disagree with the arrays they summarize. A symbol whose triggers produced no array entry fell back to the legacy count, so a position could report a count of 1 beside an empty array — a state no subscriber can render ([#9674](https://github.com/MetaMask/core/pull/9674))
- `getPositions` now populates `takeProfitCount` / `stopLossCount` on the REST path, which previously always reported `0` there while the WebSocket path counted them. Both counts and the new trigger arrays use one definition on both transports: reduce-only triggers on the market that are not a child of another pending order, de-duplicated by order ID. The WebSocket path derives its counts from the same arrays, so a standalone or partial trigger is counted identically on both transports; orders whose placement type HyperLiquid does not name (its ambiguous `Trigger`) are absent from both, where the legacy WebSocket count included them. The legacy scalar `takeProfitPrice` / `stopLossPrice` fields keep their previous behaviour and may still reflect a pending order's TP/SL child, so they can disagree with the arrays and counts; this is documented on the `Position` fields ([#9674](https://github.com/MetaMask/core/pull/9674))
- `updatePositionTPSL` now cancels standalone reduce-only triggers left by an earlier partial update when replacing whole-position TP/SL, where previously those leftovers survived the replace and could fire beside the new position-bound orders ([#9674](https://github.com/MetaMask/core/pull/9674))
- `editOrder` no longer reports the edited order's ID back as `OrderResult.orderId`. HyperLiquid does not edit in place: it cancels the target and rests a replacement under a new order ID, which the SDK's modify response does not carry, so the returned ID named an order the venue had already cancelled ([#9674](https://github.com/MetaMask/core/pull/9674))
  - The replacement is now resolved from the open orders read after the modify, and is returned only when exactly one newly-rested order carries the submitted market, side and size. Novelty is judged against a snapshot taken before the modify, so an order that was already resting with the same attributes cannot be mistaken for the replacement.
  - When the replacement cannot be identified unambiguously — a market edit that filled rather than rested, a read that has not yet caught up, or more than one candidate — the result stays successful and the optional `orderId` is omitted rather than reporting an ID that may be wrong. Callers reading `orderId` after an edit must handle it being absent.
- A partial TP/SL size that rounds away at the asset's precision (for example `0.0004` against `szDecimals: 3`) is now rejected with `ORDER_TPSL_SIZE_INVALID` in both `placeOrder` and `updatePositionTPSL`. Validation only saw the requested size, so such a size passed and was then submitted as `'0'` — which HyperLiquid reads as covering the whole position, silently turning a partial TP/SL into a full close ([#9674](https://github.com/MetaMask/core/pull/9674))
  - The check runs before either method takes a side effect, so a rejected update leaves the account as it found it: `updatePositionTPSL` rejects before its pre-cancel sweep, so the position keeps the triggers it already had, and `placeOrder` rejects before signing prompts, the leverage change, and any HIP-3 margin transfer.
- A price that rounds away at the asset's precision is rejected the same way, and at the same point, as a size that does. An asset quotes to `DECIMAL_PRECISION_CONFIG.MaxPriceDecimals - szDecimals` places, so a positive price below that tick was formatted to `'0'` and submitted as a zero `triggerPx`, which the SDK rejects — previously only after `placeOrder` had completed trading setup, the leverage change, and any HIP-3 margin handling. `OrderParams.triggerPrice` is rejected with `ORDER_TRIGGER_PRICE_POSITIVE`; an attached or position `takeProfitPrice` / `stopLossPrice` with `ORDER_PRICE_POSITIVE` ([#9674](https://github.com/MetaMask/core/pull/9674))
- `updatePositionTPSL` now runs its trading setup — the step that can prompt a hardware wallet and write the referral and builder-fee approvals — only after every validation has passed, where previously it ran first. A rejected update (invalid partial size, a size missing its price, a size that rounds away) no longer leaves those writes behind ([#9674](https://github.com/MetaMask/core/pull/9674))
- `adaptOrderToSDK` derives the slippage cap price for `stop_market` / `take_profit_market` orders from the trigger price when the caller supplies none, instead of emitting `p: '0'`, which the SDK rejects before the request is made ([#9674](https://github.com/MetaMask/core/pull/9674))
  - The cap follows the order's own `maxSlippageBps` (or the deprecated decimal `slippage`), falling back to `ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps` only when neither is set, so the same order priced through this helper and through `placeOrder` gets the same execution bound.
- Streamed positions now emit when a standalone or partial trigger order is placed or cancelled: the position change hash covers `takeProfitOrders` / `stopLossOrders`, where previously such a change altered neither the scalar TP/SL fields nor the counts and so was never delivered to position subscribers ([#9674](https://github.com/MetaMask/core/pull/9674))
- `Position.takeProfitOrders` / `stopLossOrders` re-resolve a position-bound trigger's size against the current position instead of reporting the size it was resolved to when the order was first adapted. A position-bound TP/SL covers whatever the position is, so after the position was resized the entry reported a stale size — and, when the position had grown, wrongly reported `isPartial: true` for a trigger that still covered the whole position ([#9674](https://github.com/MetaMask/core/pull/9674))
  - That hash covers each trigger's placement type too, so a trigger modified in place from market to limit execution — keeping its order ID, trigger price, and size — is delivered rather than leaving subscribers on stale execution semantics.
- `Order.orderType` now reports how a trigger order executes rather than always reporting `limit`: HyperLiquid sets `limitPx` on trigger orders as a slippage cap, so a `Stop Market`/`Take Profit Market` order was previously read back as a limit order ([#9674](https://github.com/MetaMask/core/pull/9674))
- Stop `closePosition` from submitting reduce-only orders that HyperLiquid rejects with "Reduce only order would increase position" ([#9719](https://github.com/MetaMask/core/pull/9719))
  - The position snapshot callers pass (to avoid a `getPositions()` REST call) is now re-validated against the freshest WebSocket position cache, so the order side and size follow the live position instead of a snapshot that a concurrent TP/SL fill, liquidation, or repeated close has already invalidated. No additional network request is made when the cache covers the symbol's DEX: a missing entry there means the position is already closed, so the close now fails fast with `No position found for <symbol>` instead of submitting a doomed order. When the cache does not cover that DEX — a HIP-3 DEX whose subscription has not published this session — the absence proves nothing, so a single `clearinghouseState` request for that DEX alone supplies live data, which keeps the outcome attributable to the symbol's own DEX: if the DEX answers without this symbol — including when it reports no positions at all — the position is genuinely closed and the close fails with `No position found for <symbol>`; only if that request fails does the caller's snapshot stand, since a failed lookup proves nothing and must not block a position that is open and closable. `HyperLiquidSubscriptionService` exposes the new `getCachedPositionsForDex(dexName)` method this uses, which returns that DEX's own cached positions rather than the cross-DEX aggregate: the aggregate is only rebuilt once every expected DEX has published, so after a WebSocket reconnect it can sit frozen at pre-reconnect contents while the per-DEX slices keep updating.
  - A caller-supplied close size is clamped to the live position size, and that clamp is binding: for a partial close the `usdAmount` clients also send can no longer recompute the size above it. A close size that is supplied but not a positive number (e.g. `'0'` or `'abc'`) now fails with `ORDER_SIZE_POSITIVE`; only an omitted or empty `size` means "close 100%".
  - The batch `closePositions` path also rounds each reduce-only size down onto the asset's size grid, instead of letting `formatHyperLiquidSize`'s half-up rounding push it above the position. A position smaller than one size increment is skipped rather than submitted as a zero-size order, and the remaining positions still close. Each skipped position is reported in `results` with `success: false` and `error: ORDER_SIZE_POSITIVE` and counted in `failureCount`, so a caller cannot read "closed everything" from a batch that left one open. `results` keeps the order of the requested positions, so a consumer correlating results to positions by index is unaffected by a skip.
  - A close that covers the whole position — no `size`, or a `size` that reaches (or was clamped to) the position size — now submits exactly the live position size. The `usdAmount` clients send for slippage protection is no longer forwarded for such a close, because `placeOrder` treats it as the source of truth and would recompute the size from it, discarding the clamp and rounding the size up. Genuine partial closes still use `usdAmount`. As a result, a close of the entire position requested via an explicit `size` is now treated as a full close for validation too, so it skips the USD/$10-minimum check as an omitted `size` already did. The `priceAtCalculation` staleness check is unaffected: `calculateFinalPositionSize` now runs it whenever a caller supplies that field, rather than only inside its `usdAmount` branch, so a full close that drifted past `maxSlippageBps` is still rejected with "Price moved too much" even though its size no longer comes from `usdAmount`.
  - `placeOrder` no longer retries **any** reduce-only order that the exchange rejected for the $10 minimum order value with a 1.5% larger size; the minimum-value error is surfaced instead. This covers reduce-only limit and TP/SL orders submitted directly through `placeOrder`, not just closes. **It is a behaviour change for partial closes**, which previously recovered from that rejection by closing ~1.5% more than requested: a reduce-only order can no longer grow past the position (full close) or past the size the caller asked to close (partial close), so the retry could only be rejected again or resubmit an identical order.
  - `calculateFinalPositionSize` throws `ORDER_SIZE_POSITIVE` when a `reduceOnly` call supplies a `size` that is not a positive number, in both its `usdAmount` and legacy-size branches, instead of capping the USD-derived size to that value or passing it through to be formatted as a zero or negative size.
  - `calculateFinalPositionSize` accepts an optional `reduceOnly` flag. When set, the size is rounded down onto the asset's size grid and the "add one increment to meet the requested USD" adjustment is skipped, so a reduce-only size can never round up past the position. If rounding down leaves a size of `0` (the order is worth less than one size increment), it throws `ORDER_SIZE_POSITIVE` rather than submitting a zero-size order. **This is a behaviour change for a reduce-only close between half an increment and one full increment**: `formatHyperLiquidSize` uses `toFixed`, which rounds half-up, so such a close previously succeeded by closing one whole increment and now fails client-side instead. It is most visible on coarse-grid (low `szDecimals`) assets, and reachable from any partial close that omits `usdAmount` — Mobile limit partial closes do (`usePerpsClosePosition` sends `usdAmount: undefined` for limit orders).
- Map HyperLiquid's `"User or API Wallet 0x... does not exist."` order rejection to `PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND` instead of returning the raw exchange message as `OrderResult.error`, so clients can render an actionable "fund your account" message (TAT-3343) ([#9709](https://github.com/MetaMask/core/pull/9709))
- Stop reporting the `"User or API Wallet 0x... does not exist."` order rejection to the error logger; it is an expected pre-account state, matching the handling already applied to the other user-scoped HyperLiquid exchange writes (TAT-3343) ([#9709](https://github.com/MetaMask/core/pull/9709))
- Size the max order amount off the price a resting limit order is submitted at, fixing `order 0: insufficient margin to place order` rejections on max-size limit orders resting above the market price ([#9694](https://github.com/MetaMask/core/pull/9694))
  - `getMaxAllowedAmount` derived the maximum from the market price, but HyperLiquid reserves initial margin for a resting order against the price that order is submitted at. A max-size limit order resting above the market price - typically a sell - therefore reserved more margin than the account had and the exchange rejected it.
  - `getMaxAllowedAmount` now accepts optional `orderType` and `limitPrice` params. When a limit order rests above the market price the maximum is scaled by `limitPrice / marketPrice`; orders at or below the market price, and market orders, are unchanged. Both params are optional, so existing callers keep the previous behavior.
- Skip the unified-account migration for HyperLiquid multi-sig accounts, fixing the `ApiRequestError: Multi-sig required` error raised on every Perps entry for such an account (TAT-3214) ([#9769](https://github.com/MetaMask/core/pull/9769))
  - HyperLiquid rejects every single-signer exchange write for an account converted to multi-sig, so the silent `agentSetAbstraction` (and user-signed `userSetAbstraction`) migration could never succeed. `HyperLiquidProvider` now reads `userToMultiSigSigners` immediately before the migration write and, for a multi-sig account, skips it, emits the `Perp Account Setup` event with `status: not_applicable` / `error_message: multi_sig_account`, and records `{ attempted: true, enabled: false }` in the trading-readiness cache so the attempt is not repeated. The signer lookup only runs when a migration write would otherwise be made, so accounts already on `unifiedAccount` / `portfolioMargin` and deferred `dexAbstraction` accounts are unaffected.
  - The same rejection is now classified in the migration's error handler, covering the case where the account is converted between the lookup and the write, so it is no longer reported to the error logger as a failed setup.
  - Unified account mode stays off for these accounts; HIP-3 collateral continues to be handled by the existing programmatic transfer fallback.

## [10.0.0]

### Added

- Add `AggregatedOrderBookConnection` service (with the `processAggregatedOrderBook` helper and the `OrderBookConnectionStatus`, `SubscribeAggregatedOrderBookParams`, and `AggregatedOrderBookConnectionOptions` types) for managing a dedicated, reference-counted aggregated order book subscription ([#9549](https://github.com/MetaMask/core/pull/9549))
- Add `BOTTOM_NAV_BAR` to `PERPS_EVENT_VALUE.SOURCE` for bottom navigation bar analytics attribution ([#9551](https://github.com/MetaMask/core/pull/9551))

### Changed

- Bump `@metamask/transaction-controller` from `^69.1.0` to `^69.3.0` ([#9589](https://github.com/MetaMask/core/pull/9589), [#9593](https://github.com/MetaMask/core/pull/9593), [#9693](https://github.com/MetaMask/core/pull/9693))
- Gate HIP-3 markets to USDC collateral only, following HyperLiquid's USDH sunset (TAT-3304) ([#9530](https://github.com/MetaMask/core/pull/9530))
  - Market discovery (`getMarkets`) now filters a HIP-3 DEX out entirely when its collateral token positively resolves to something other than USDC, so such a market can never be surfaced to trade, even via an allowlist entry naming the DEX.
  - `getMarketDataWithPrices` applies the same check before merging each HIP-3 DEX's results (both the initial fetch and the empty-universe retry), and before caching the snapshot used for stale fallbacks, so a non-USDC-collateral HIP-3 DEX can no longer appear in overview data (fresh or stale) while order placement rejects it.
  - Placing an order on a non-USDC-collateral HIP-3 DEX now fails immediately with a new `UNSUPPORTED_COLLATERAL` error code instead of attempting the previous USDC→USDH auto-swap path.
  - The collateral check fails closed: it only treats a DEX as USDC-collateral when the collateral token positively resolves to USDC against spot metadata, so missing or stale metadata never lets a non-USDC-collateral DEX through.
  - Removed the now-unreachable USDH auto-swap machinery this replaces (spot USDH/USDC balance lookups, the USDC→USDH spot swap, and the auto-swap orchestration).
- Subscribe to HyperLiquid's `fastAssetCtxs` WebSocket feed for mark/mid price updates, replacing `assetCtxs` as the latency-sensitive price source now that HyperLiquid has slowed the public `assetCtxs` feed cadence ([#9530](https://github.com/MetaMask/core/pull/9530))
  - `assetCtxs` continues to populate funding, open interest, volume, and oracle price data, and no longer writes prices for any symbol `fastAssetCtxs` covers, so a slower `assetCtxs` batch tick can't overwrite a fresher `fastAssetCtxs` price; it remains the price source only for symbols outside `fastAssetCtxs`' coverage (e.g. HIP-3 DEX markets).
  - `fastAssetCtxs` is a single global subscription (the HyperLiquid SDK exposes no per-DEX variant): the first message is a full snapshot keyed by coin, and later messages contain diffs for only the coins that changed. A coin is only marked as covered by `fastAssetCtxs` (deferring `assetCtxs`) once a usable price has actually been received for it; every coin with a usable price is cached regardless of whether it currently has a subscriber, so a later subscriber gets an immediate baseline, while notifications remain scoped to coins with an active subscriber.
  - Established alongside the global `allMids` subscription, restored together on WebSocket reconnect, and torn down on `clearAll()`. Subscribe attempts use the same 3-attempt/500ms-backoff retry as `assetCtxs` for transient SDK errors.

### Removed

- **BREAKING:** Remove the `USDH_CONFIG` export, following HyperLiquid's USDH sunset (TAT-3304) ([#9530](https://github.com/MetaMask/core/pull/9530))
  - This constant configured the now-removed USDC→USDH auto-swap path; consumers importing it should remove the reference, as USDH-collateral HIP-3 DEXs are no longer supported (see the collateral gating change above).

### Fixed

- Scope `#notifyAllPriceSubscribers` to the symbols that actually changed, instead of always fanning out to every price subscriber ([#9530](https://github.com/MetaMask/core/pull/9530))
  - The `allMids` handler now tracks a per-symbol `changedSymbols` set (replacing the previous all-or-nothing `hasUpdates` boolean) and only notifies subscribers of symbols whose price changed.
  - The `activeAssetCtx` handler now notifies only the subscribers of the symbol it just updated, instead of re-notifying every subscribed symbol on each tick.
  - This eliminates redundant reference-equal `PriceUpdate` deliveries to list-view subscribers (e.g. market overview, watchlist) whenever an unrelated symbol's fast-stream price ticks.

## [9.3.0]

### Added

- Add `proLayoutPreferences` state field (`orderBookExpanded`, `chartExpanded`, `orderBookPosition`, `orderFormPosition`) to `PerpsControllerState` for persisting Pro-mode layout across markets, along with the exported `ProLayoutPreferences` type and `DEFAULT_PRO_LAYOUT_PREFERENCES` constant, `getProLayoutPreferences()` / `setProLayoutPreferences(patch)` controller methods (exposed as messenger actions with exported `PerpsControllerGetProLayoutPreferencesAction` / `PerpsControllerSetProLayoutPreferencesAction` types), and a `selectProLayoutPreferences` selector; the getter and selector merge over defaults so callers always receive a fully-populated object ([#9550](https://github.com/MetaMask/core/pull/9550))
- Add a `PerpsMode` enum (`Lite`/`Pro`) and a persisted `mode` state field (defaulting to `PerpsMode.Lite`) to `PerpsControllerState`, along with an exported `DEFAULT_PERPS_MODE` constant, a `setPerpsMode(mode)` controller method (exposed as a messenger action with an exported `PerpsControllerSetPerpsModeAction` type), and a `selectPerpsMode` selector that falls back to the default mode ([#9550](https://github.com/MetaMask/core/pull/9550))

### Changed

- Bump `@metamask/account-tree-controller` from `^7.5.3` to `7.5.4` ([#9429](https://github.com/MetaMask/core/pull/9429))
- Report the effective leverage (`positionUSD / marginUSD`, rounded to 1 decimal place) on `PERPS_POSITION_CLOSE_TRANSACTION` analytics instead of the configured `leverage.value`, and populate it for every close including TP/SL triggers ([#9471](https://github.com/MetaMask/core/pull/9471))
- Emit an additional `partially_filled` `PERPS_TRADE_TRANSACTION` event with `order_size` (the final submitted size), `amount_filled`, and `remaining_amount` when an open trade fills for less than the size actually submitted to the exchange, mirroring the close path so partial fills are visible in analytics; classification uses the provider's post-normalization submitted size (returned as `OrderResult.submittedSize`) rather than the caller's pre-normalization `size`, so a complete fill of the normalized size is not misreported as partial; full fills are unchanged ([#9471](https://github.com/MetaMask/core/pull/9471))
- Widen the `TradeAction` type to include `flip_long_to_short` and `flip_short_to_long` (already forwarded verbatim at runtime), so clients no longer need casts when deriving flip actions ([#9471](https://github.com/MetaMask/core/pull/9471))
- Add `number_positions_closed` (the successful-close count) to the batch `PERPS_POSITION_CLOSE_TRANSACTION` summary event emitted by `closePositions`, which previously carried only status/completion_duration/bulk_action_id ([#9471](https://github.com/MetaMask/core/pull/9471))

### Fixed

- Emit the failed Perp Risk Management analytics event when `updateMargin` receives a non-throwing `{ success: false }` provider result, which previously lost the terminal event (only the thrown-error path emitted it); the event fires exactly once per operation ([#9471](https://github.com/MetaMask/core/pull/9471))
- Fix the CommonJS build inlining an absolute `file:` path in place of the `@nktkas/hyperliquid` specifier ([#9471](https://github.com/MetaMask/core/pull/9471))
  - `dist/services/HyperLiquidClientService.cjs` and `dist/utils/standaloneInfoClient.cjs` in `9.2.1` emitted `require("file:///home/runner/work/hyperliquid/hyperliquid/src/mod.ts")` instead of `require("@nktkas/hyperliquid")`, breaking any CommonJS/Jest/bundler consumer with "Cannot find module".
  - Root cause: `@nktkas/hyperliquid@0.33.0`+ ships `.d.ts` files carrying `/// <amd-module name="file:///home/runner/work/hyperliquid/hyperliquid/src/mod.ts" />` triple-slash directives (an artifact of its Deno/`dnt` build). `ts-bridge` uses that `amd-module` name as the CommonJS `require()` target, so the absolute path leaks into the emitted `.cjs`. A yarn patch (applied via monorepo `resolutions`) strips those directives so the build emits the bare `@nktkas/hyperliquid` specifier; the published dependency range stays `^0.33.1`.

## [9.2.1]

### Changed

- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

### Fixed

- Fix `adaptOrderFromSDK` dropping `takeProfitPrice`/`stopLossPrice` for child TP/SL orders whose `triggerPx` is an empty string (HyperLiquid's representation of "no trigger price" when the price is instead carried in `limitPx`) ([#9398](https://github.com/MetaMask/core/pull/9398))
  - `??` only falls back on `null`/`undefined`, so an empty-string `triggerPx` was never replaced by `limitPx`, leaving `takeProfitPrice`/`stopLossPrice` (and their order IDs) `undefined` on the resulting `Order`. Switched back to `||`, which correctly treats `''` as falsy.

## [9.2.0]

### Added

- Add optional `description?: string` to `PerpsMarketData` and `TerminalAssetMetadata`, exposing the human-readable asset description sourced from the Terminal API when available ([#9334](https://github.com/MetaMask/core/pull/9334))
  - `TerminalMarketService` now reads the `description` field from Terminal API items (ignoring `null`/empty values) and includes it in per-symbol metadata.
  - `MarketDataService.getMarketDataWithPrices` merges the description into `PerpsMarketData` when the Terminal API backend (`useTerminalApi`) is enabled; markets without a Terminal description keep the field `undefined`.

## [9.1.0]

### Added

- Add Auto Close TP/SL RoE sign toggle analytics constants to `PERPS_EVENT_PROPERTY` and `PERPS_EVENT_VALUE` so mobile and extension can import them from `@metamask/perps-controller` instead of local mirrors ([#9322](https://github.com/MetaMask/core/pull/9322))
  - New `PERPS_EVENT_PROPERTY` key: `ROE_SIGN` (`roe_sign`)
  - New `PERPS_EVENT_VALUE.INTERACTION_TYPE` entry: `TPSL_ROE_SIGN_TOGGLED` (`tpsl_roe_sign_toggled`)
- Add `listedAt` (epoch ms) to `PerpsMarketData` and `TerminalAssetMetadata`, sourced from the Terminal API and normalized from either a numeric epoch value or an ISO 8601 string. Clients can use this field to surface recently added markets (e.g. markets listed within the last 30 days). ([#9308](https://github.com/MetaMask/core/pull/9308))
- Add recently viewed markets tracking to `PerpsController`: ([#9308](https://github.com/MetaMask/core/pull/9308))
  - New `recentlyViewedMarkets` persisted state (per-network: `testnet`/`mainnet`), containing `{ symbol, viewedAt }` entries ordered newest-first and capped at 10.
  - New `recordMarketViewed(symbol)` method — call when the user opens a market. Deduplicates and prepends the entry; no remote sync.
  - New `getRecentlyViewedMarkets()` method — returns up to 10 symbol strings for the current network, filtered to entries within the last 24 hours, ordered newest-first. Returns `[]` when none qualify.
  - New `selectRecentlyViewedMarkets` selector that applies the same TTL/limit/ordering logic for Redux subscribers.
  - New `PerpsControllerRecordMarketViewedAction` and `PerpsControllerGetRecentlyViewedMarketsAction` messenger action types.
- Consolidate the Perps analytics contract so clients import a single source of truth from `@metamask/perps-controller` ([#9311](https://github.com/MetaMask/core/pull/9311))
  - Add five new `PerpsAnalyticsEvent` members: `TransactionConsidered` (`Perp Transaction Considered`), `TradeQuoteReceived` (`Perp Trade Quote Received`), `SearchQuery` (`Perp Search Query`), `SearchResultTapped` (`Perp Search Result Tapped`), `SearchAbandoned` (`Perp Search Abandoned`)
  - Add new `PERPS_EVENT_PROPERTY` keys: `entry_point`, `discovery_source`, `perp_discovery_source`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `watchlisted`, `hl_fee_rate`, `bulk_action_id`, `environment_type`, `order_context`, `order_size_percent`, `limit_price_input_type`, `limit_price_input_preset`, `order_has_tp`, `order_has_sl`, `quote_latency_ms`, `error_reason`, `saved_order`, `default_payment_token`, `default_size_amount`, `default_leverage`, `default_auto_close`, `order_execution_latency_ms`, `screen_context`, `from_token`, `from_chain`, `to_token`, `to_chain`, `search_query`, `results_count`, `result_rank`, `mode`, `current_token`, `sort_field`, `sort_direction`, `filter_category`, `time_on_screen_ms`
  - Add new `PERPS_EVENT_VALUE` entries: `INTERACTION_TYPE.{SORT_APPLIED, FILTER_APPLIED, SEARCH_RESULT_TAPPED, SEARCH_CHIP_TAPPED, SEARCH_SIGNAL_TILE_TAPPED, PAYMENT_TOKEN_SELECTOR_DISMISSED}`, `ACTION.ABANDON_ORDER`, `BUTTON_CLICKED.{PLACE_ORDER, CLOSE, REDUCE_EXPOSURE}`, `SCREEN_TYPE.{SEARCH_RESULTS_SHOWN, SEARCH_NO_RESULTS}`
  - Add `PerpsAttributionContext` type and `setAttributionContext` / `getAttributionContext` / `clearAttributionContext` / `mergeAttributionContext` on `PerpsController` (with matching messenger actions) for transient UTM attribution propagation
  - Extend `TrackingData` with `entryPoint`, `discoverySource`, `perpDiscoverySource`, `hlFeeRate`; extend `TPSLTrackingData` with `entryPoint`, `discoverySource`, `perpDiscoverySource`; add optional `trackingData` to `CancelOrderParams`
- Add Perps Advanced Chart analytics constants to `PERPS_EVENT_PROPERTY` and `PERPS_EVENT_VALUE` so mobile can import chart instrumentation keys from `@metamask/perps-controller` instead of maintaining a local mirror ([#9221](https://github.com/MetaMask/core/pull/9221))
  - New `PERPS_EVENT_PROPERTY` keys: `CHART_LIBRARY`, `ASSET_TYPE`
  - New `PERPS_EVENT_VALUE.CHART_LIBRARY` group: `lightweight`, `advanced`
  - New `PERPS_EVENT_VALUE.ASSET_TYPE` group: `spot`, `perp`
- Add `fast?: boolean` to `SubscribeOrderBookParams`: when set to `true`, the order book subscription uses Hyperliquid's fast l2Book mode (5 levels @ ~0.5 s cadence) instead of the default (20 levels @ ~2 s) ([#9160](https://github.com/MetaMask/core/pull/9160))
  - No change to `#processOrderBookData` or cumulative-total math; callers opting into `fast: true` receive up to 5 levels per side instead of 20.

### Changed

- Consolidate the Perps transaction analytics pipeline in `TradingService` ([#9311](https://github.com/MetaMask/core/pull/9311))
  - Emit a `status: 'submitted'` event before the provider round-trip for trade (`placeOrder`), close (`closePosition`), cancel (`cancelOrder`) and risk-management (`updatePositionTPSL`) operations
  - Populate `metamask_fee` on successful `flipPosition` trades from `trackingData`
  - Add `leverage` to `Perp Position Close Transaction` event properties
  - Add `hl_fee_rate` to trade and close events when present in `trackingData`; omit it entirely when unavailable
  - Generate a `bulk_action_id` UUID for `closePositions` / `cancelOrders` and attach it to each per-item event and the batch summary event
  - Propagate `entry_point`, `discovery_source`, `perp_discovery_source` from `trackingData` onto trade/close/cancel/risk events; the legacy `source` field on `TPSLTrackingData` is now deprecated
- On `subscribeToPrices` calls with `includeMarketData: true` (focused detail/ticket screens), the `price` field in each `PriceUpdate` is now driven by the per-symbol `activeAssetCtx` WebSocket stream (`midPx`, falling back to `markPx`) rather than the main-DEX `allMids` snapshot, which Hyperliquid throttles to a ~5 s push cadence ([#9160](https://github.com/MetaMask/core/pull/9160))
  - Price source selection is **per-subscriber**: focused (`includeMarketData: true`) callbacks receive the fast-stream price; list/overview (`includeMarketData: false`) callbacks always receive the raw `allMids` baseline, even when both subscriber types share the same symbol.
  - The fast-stream price is preferred only while it is fresh (within a 10 s staleness window); `allMids` takes back over automatically once the `activeAssetCtx` stream goes quiet.
  - A startup guard prevents any `'0'` price from being emitted: if `activeAssetCtx` fires before `allMids` with no `midPx`/`markPx`, no notification is sent until a usable price arrives from either source.
  - No new WebSocket subscriptions are created; `activeAssetCtx` was already established for `includeMarketData: true` subscriptions.
- Bump `@nktkas/hyperliquid` from `^0.32.2` to `^0.33.1`: adds support for the `fast` field on `l2Book` subscriptions ([#9160](https://github.com/MetaMask/core/pull/9160))

## [9.0.0]

### Added

- **BREAKING:** Sync `watchlistMarkets` with `AuthenticatedUserStorageService` so the watchlist is persisted server-side per authenticated user account ([#9010](https://github.com/MetaMask/core/pull/9010))
- `toggleWatchlistMarket` now performs an optimistic local-state update followed by an async AUS read-merge-write; on failure the local state is reverted.
- On `init()`, `state.watchlistMarkets` is hydrated from AUS (source of truth). If no remote watchlist exists yet for the active exchange, any existing local markets are migrated to AUS in a one-time push.
- When unauthenticated, or when the active provider is not mapped to an AUS exchange key (e.g. `'aggregated'`), the controller falls back to local-only state without surfacing errors to callers.
- `toggleWatchlistMarket` return type changed from `void` to `Promise<void>` to allow callers to await the remote write.
- Add `resolveWatchlistExchangeKey(activeProvider)` helper that maps a `PerpsActiveProviderMode` to the corresponding `PerpsWatchlistMarkets` exchange key, returning `null` for unsupported modes ([#9010](https://github.com/MetaMask/core/pull/9010))

### Fixed

- Fix `#syncWatchlistFromRemote` to use exchange-key presence instead of symbol count when deciding whether to hydrate from AUS, so an intentionally cleared remote watchlist is honored rather than overwritten by stale local favorites ([#9010](https://github.com/MetaMask/core/pull/9010))

## [8.3.0]

### Added

- Add Terminal API integration for market data, controlled via `useTerminalApi` parameter on `GetMarketsParams` / `GetMarketDataWithPricesParams` ([#9137](https://github.com/MetaMask/core/pull/9137))
  - `TerminalMarketService` fetches structured market metadata from the injected `terminalApiUrl` with a 5-minute cache TTL.
  - When enabled, `getMarkets()` attempts the Terminal API first; on failure or empty response, falls back silently to HyperLiquid. Terminal results respect the same allowlist/blocklist filtering as the provider path.
  - `getMarketDataWithPrices()` enriches provider data with Terminal API metadata (name, keywords, tags, categories).
  - `PerpsPlatformDependencies` gains an optional `terminalApiUrl?: string` field and an optional `terminalMarketService?: PerpsTerminalMarketService` field; clients can inject a pre-built service instance or let the controller create one from the URL.
  - `PerpsMarketData` gains optional `keywords`, `tags`, and `categories` fields.
  - Market search (`getMarketMatchRank`, `rankMarketsByQuery`) now indexes the `keywords` field for richer search results.
  - `HYPERLIQUID_ASSET_NAMES` and `HIP3_ASSET_MARKET_TYPES` remain intact as fallback for assets absent from the Terminal API.
- Surface per-market trading availability so clients can warn before placing an order that would be rejected ([#9205](https://github.com/MetaMask/core/pull/9205))
  - Add an `isTradable` boolean to `PriceUpdate` that defaults to `true`. It is `false` when a market's mid price has drifted past the protocol's oracle-deviation limit (HyperLiquid rejects orders more than 95% away from the reference price, which most often affects HIP-3 markets); a provider with no such rule, or that cannot yet assess tradability, reports `true`.
  - Add an optional, protocol-agnostic `fallbackPriceDeviationLimit` to `PerpsControllerConfig` so clients can tune the deviation threshold; each provider applies its own default when omitted.
  - Export the pure `isMarketTradable` helper and add `HYPERLIQUID_CONFIG.OraclePriceDeviationLimit` (`0.95`, the HyperLiquid default).

### Changed

- Bump `@metamask/controller-utils` from `^12.2.0` to `^12.3.0` ([#9218](https://github.com/MetaMask/core/pull/9218))

### Fixed

- Add a 10-second fetch timeout to `TerminalMarketService` so a stalled Terminal API degrades to the provider promptly instead of blocking indefinitely ([#9224](https://github.com/MetaMask/core/pull/9224))
- Only override the provider display name when Terminal supplies a non-null value, preventing symbol fallback from replacing good provider names ([#9224](https://github.com/MetaMask/core/pull/9224))

## [8.2.0]

### Added

- Add Perps Discovery analytics constants to `PERPS_EVENT_PROPERTY` and `PERPS_EVENT_VALUE` so mobile can import them from `@metamask/perps-controller` instead of maintaining a local mirror ([#9178](https://github.com/MetaMask/core/pull/9178))
  - New `PERPS_EVENT_PROPERTY` keys: `SOURCE_SECTION`, `RESULT_COUNT`, `SECTION_NAME`, `SECTION_INDEX`, `SECTIONS_DISPLAYED`, `WATCHLIST_COUNT`, `WATCHLIST_MARKETS`
  - New `PERPS_EVENT_VALUE.SOURCE_SECTION` group: values for home sections (`positions`, `orders`, `watchlist`, `whats_happening`, `products`, `top_gainers`, `top_losers`, `crypto`, `commodity`, `stock`, `forex`), explore sections (`perps_movers`, `perps_crypto`, `perps_stocks_commodities`, `perps_markets`), and market-list sections (`all_markets`, `new`, `active_search`)
  - New `PERPS_EVENT_VALUE.SECTION_NAME` group: `balance`, `positions`, `orders`, `watchlist`, `whats_happening`, `products`, `top_movers`, `explore_crypto`, `explore_commodities`, `explore_stocks`, `explore_forex`, `recent_activity`
  - Extended `PERPS_EVENT_VALUE.INTERACTION_TYPE` with `MARKET_LIST_FILTER`
  - Extended `PERPS_EVENT_VALUE.BUTTON_CLICKED` with `WATCHLIST`, `TOP_MOVERS`, `WHATS_HAPPENING`
  - Extended `PERPS_EVENT_VALUE.BUTTON_LOCATION` with `ASSET_DETAILS`

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))

## [8.1.0]

### Added

- Add observational hard timeout for order submission: tag the `Perps Order Submission` trace and emit a breadcrumb when a provider round-trip exceeds `PlaceOrderTimeoutMs` (60s), without cancelling the in-flight order ([#8994](https://github.com/MetaMask/core/pull/8994))
- Add `HYPERLIQUID_ASSET_NAMES` (a curated `symbol → human-readable name` map, e.g. `BTC → 'Bitcoin'`, `xyz:AAPL → 'Apple'`, `xyz:GOLD → 'Gold'`) and the `getHyperLiquidAssetName(symbol, names?)` helper, both exported from `@metamask/perps-controller/constants`, so clients can match and display markets by full name ([#9082](https://github.com/MetaMask/core/pull/9082))
  - HyperLiquid does not expose a per-asset human-readable name; this map is maintained client-side and keyed like `HIP3_ASSET_MARKET_TYPES` (bare `SYMBOL` for crypto, `dex:SYMBOL` for HIP-3). Unmapped assets fall back to their ticker.
- Add `rankMarketsByQuery(markets, query)` and `getMarketMatchRank(market, query)` helpers (and the `MarketMatchRank` enum) for relevance-ranked market search by ticker symbol or human-readable name (exact > prefix > substring, stable within a rank) ([#9082](https://github.com/MetaMask/core/pull/9082))
  - Complements the existing unranked `filterMarketsByQuery`; same match semantics (case-insensitive substring on `symbol` and `name`), but ordered by relevance. No fuzzy/phonetic matching.

### Changed

- Deliver HyperLiquid positions, orders, and account/spot balance via per-DEX `clearinghouseState` and `openOrders` subscriptions on all paths, removing the dependency on the deprecated `webData2` snapshot channel ([#9081](https://github.com/MetaMask/core/pull/9081))
  - The non-HIP-3 (main-DEX-only) user data path previously used `webData2`, which HyperLiquid is throttling to a 15s push interval and deprecating. It now uses the same sub-second per-DEX subscriptions as the HIP-3 path, with `webData3` retained only for open-interest caps (not latency-sensitive).
- Surface late order completions via trace `reason: 'late_success' | 'late_error'` ([#8994](https://github.com/MetaMask/core/pull/8994))
- `PerpsMarketData.name` returned by `getMarketDataWithPrices()` is now the human-readable market name (resolved via `HYPERLIQUID_ASSET_NAMES`) instead of a copy of the ticker symbol; unmapped assets are unchanged (still equal the symbol) ([#9082](https://github.com/MetaMask/core/pull/9082))
  - `transformMarketData` gains an optional `assetNames` parameter (defaults to the bundled map) to override the name source.
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.2.0` ([#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083))

### Removed

- Remove unused `Perps Order Submission Toast` trace name from the `PerpsTraceName` union ([#8994](https://github.com/MetaMask/core/pull/8994))

### Fixed

- Fix `late_error` never being emitted in the `placeOrder` catch path when a provider call succeeded past `PlaceOrderTimeoutMs` but a subsequent step threw; the trace `reason` now correctly reflects `'late_error'` whenever the submission threshold was exceeded, regardless of where the exception originated ([#8994](https://github.com/MetaMask/core/pull/8994))

## [8.0.0]

### Added

- Centralise market category classification so consumers share one model instead of re-deriving it per client ([#9009](https://github.com/MetaMask/core/pull/9009))
  - Export `getMarketTypeFilter` (resolves a market to its UI category filter with singular values aligned to `MarketCategory`) and `isHip3Market`. `getMarketTypeFilter` and `matchesCategory` treat a `marketSource` DEX id as a HIP-3 signal consistently, so partial (route-param) markets classify the same way in both.
  - Export the pure `matchesCategory` and `applyMarketFilters` helpers (moved from `MarketDataService`).

### Changed

- **BREAKING:** Align `MarketTypeFilter` and `MARKET_CATEGORIES` values with `MarketCategory` singular values ([#9009](https://github.com/MetaMask/core/pull/9009))
  - Replace `stocks` with `stock`, `indices` with `index`, `etfs` with `etf`, and `commodities` with `commodity`.
- Reclassify `xyz:CBRS` (Cerebras) from `stock` to `pre-ipo` and add `xyz:IPOP` (Quantinuum) as `pre-ipo` in `HIP3_ASSET_MARKET_TYPES`, so all three Pre-IPO Perpetual markets on trade.xyz (CBRS, SPCX, IPOP) display under the Pre-IPO category ([#9038](https://github.com/MetaMask/core/pull/9038))

## [7.0.0]

### Added

- Add `MarketCategory` enum, `MARKET_CATEGORIES` ordered array (7 data-model category pills), and `getMarketCategories` messenger action ([#8892](https://github.com/MetaMask/core/pull/8892))
- Expand `HIP3_ASSET_MARKET_TYPES` with new stock, ETF, pre-IPO, forex, and commodity markets ([#8892](https://github.com/MetaMask/core/pull/8892))
- Add `categories`, `sortBy`, `direction`, `limit`, and `excludeSymbols` optional params to `GetMarketDataWithPricesParams` and `getMarketDataWithPrices()` for post-processing filtering, sorting, and pagination of market data ([#8892](https://github.com/MetaMask/core/pull/8892))
- Export `SortField`, `SortDirection`, and `GetMarketDataWithPricesParams` types from the package root ([#8892](https://github.com/MetaMask/core/pull/8892))

### Changed

- **BREAKING:** Replace `'equity'` with granular `MarketType` values: `'stock'`, `'pre-ipo'`, `'index'`, and `'etf'` ([#8892](https://github.com/MetaMask/core/pull/8892))
  - Update any code matching `marketType === 'equity'` to use the specific sub-type.

## [6.3.0]

### Added

- Add slippage controls so users can configure per-order slippage tolerance for market trades ([#8871](https://github.com/MetaMask/core/pull/8871))
- Track `vip_tier` and `vip_discount` properties on perps trading events for fee analytics ([#8871](https://github.com/MetaMask/core/pull/8871))
- Surface an in-app banner during an ongoing HyperLiquid outage so users see degraded trading status ([#8871](https://github.com/MetaMask/core/pull/8871))
- Expose subpath `exports` for `./constants`, `./constants/*`, `./types`, and `./utils/*` so consumers using legacy `node` module resolution can deep-import compiled entry points without losing tree-shaking ([#8883](https://github.com/MetaMask/core/pull/8883))

### Fixed

- Prefer the currently selected EVM account when resolving the trading account so account switching is honored across providers ([#8871](https://github.com/MetaMask/core/pull/8871))
- Suppress `User or API Wallet does not exist` Sentry noise from unfunded wallets that have not interacted with HyperLiquid ([#8871](https://github.com/MetaMask/core/pull/8871))
- Approve the HyperLiquid builder fee when missing so order submission succeeds after fresh wallet setup ([#8871](https://github.com/MetaMask/core/pull/8871))

## [6.2.0]

### Changed

- Pass `isInternal: true` to all internal `addTransaction` calls to adopt the explicit `isInternal` flag introduced in `@metamask/transaction-controller` ([#8633](https://github.com/MetaMask/core/pull/8633))
- Bump `@metamask/transaction-controller` from `^65.4.0` to `^66.0.0` ([#8848](https://github.com/MetaMask/core/pull/8848))

## [6.1.0]

### Changed

- Pass the perps builder base fee into rewards discount resolution and treat unhydrated rewards subscription state as retryable instead of a definitive no-discount result ([#8803](https://github.com/MetaMask/core/pull/8803))
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/transaction-controller` from `^65.3.0` to `^65.4.0` ([#8796](https://github.com/MetaMask/core/pull/8796))

### Fixed

- Defer signing-backed HyperLiquid unified-account setup for hardware wallets across migratable abstraction modes, including Ledger, Trezor, OneKey, Lattice, and QR keyrings, to avoid repeated signing prompts while browsing ([#8803](https://github.com/MetaMask/core/pull/8803))
- Improve logging and retry classification for failed cancel/close/TP-SL operations and SDK-wrapped keyring-locked errors ([#8803](https://github.com/MetaMask/core/pull/8803))

## [6.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [6.0.0]

### Changed

- **BREAKING:** Rename `AccountState.availableBalance` to `spendableBalance` and `AccountState.availableToTradeBalance` to `withdrawableBalance` for clearer semantics across abstraction modes ([#8678](https://github.com/MetaMask/core/pull/8678))
- Mode-aware spot fold: `addSpotBalanceToAccountState` now folds free spot USDC into both `spendableBalance` and `withdrawableBalance` for Unified/Portfolio modes, while Standard/DEX-abstraction modes keep spot separate ([#8678](https://github.com/MetaMask/core/pull/8678))
- Add throttled WS-driven `userAbstraction` refresh so HL-web mode flips propagate back without requiring a restart or account switch ([#8678](https://github.com/MetaMask/core/pull/8678))
- Fix position direction display for flipped positions ([#8707](https://github.com/MetaMask/core/pull/8707))

## [5.0.0]

### Added

- **BREAKING:** `HyperLiquidClientService` now forces the `dexAbstraction → unifiedAccount` migration via a new internal flow, deferred until first `withdraw`, `placeOrder`, or other action entry point so users see unified collateral on their first trade/withdrawal ([#8658](https://github.com/MetaMask/core/pull/8658))
- **BREAKING:** `addSpotBalanceToAccountState` and `HyperLiquidSubscriptionService` are now mode-aware: spot USDC is only folded into tradeable collateral for `unifiedAccount` / `portfolioMargin` modes, and `userAbstraction` is propagated through subscriptions ([#8658](https://github.com/MetaMask/core/pull/8658))

### Changed

- Bump `@nktkas/hyperliquid` from `^0.30.2` to `^0.32.2` for `userAbstraction` / `userSetAbstraction` / `agentSetAbstraction` API surface ([#8658](https://github.com/MetaMask/core/pull/8658))
- Replace `agentSetAbstraction` wire-code magic string with a typed constant ([#8658](https://github.com/MetaMask/core/pull/8658))
- Bump `@metamask/keyring-controller` from `^25.3.0` to `^25.4.0` ([#8665](https://github.com/MetaMask/core/pull/8665))
- Bump `@metamask/account-tree-controller` from `^7.1.0` to `^7.2.0` ([#8665](https://github.com/MetaMask/core/pull/8665))
- Bump `@metamask/transaction-controller` from `^64.4.0` to `^65.0.0` ([#8613](https://github.com/MetaMask/core/pull/8613))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))

### Fixed

- Keep users on `portfolioMargin` mode and recover the resolved abstraction mode after migration instead of evicting it ([#8658](https://github.com/MetaMask/core/pull/8658))
- Retry abstraction mode after transient `userAbstraction` failures and reset the memoized readiness promise after silent migration failures ([#8658](https://github.com/MetaMask/core/pull/8658))
- Close WebSocket-vs-REST race that could fold spot for Standard users and preserve abstraction REST results across active subscribers ([#8658](https://github.com/MetaMask/core/pull/8658))
- Drop the pre-fetch generation guard so `userAbstraction` always resolves; treat cached balances as an unambiguous spot owner ([#8658](https://github.com/MetaMask/core/pull/8658))
- Restore HyperLiquid withdrawal for Unified Account Mode users and support arb USDC withdraw balance in unified mode ([#8658](https://github.com/MetaMask/core/pull/8658))
- Harden unified-account migration handling and close MM Pay `$0` + analytics gaps ([#8658](https://github.com/MetaMask/core/pull/8658))

## [4.0.0]

### Added

- Add `coalescePerpsRestRequest` utility for deduplicating concurrent REST requests with account-scoped cache keys ([#8560](https://github.com/MetaMask/core/pull/8560))
- Add `accountUtils` helpers for resolving the active perps account id and pinning it to forwarded provider params ([#8560](https://github.com/MetaMask/core/pull/8560))

### Changed

- Account-scope the REST cache and guard cache writes so mount load stays cacheable without cross-account bleed ([#8560](https://github.com/MetaMask/core/pull/8560))
- Make `forceRefresh` provider-agnostic and align rate-limit handling with the extension ([#8560](https://github.com/MetaMask/core/pull/8560))
- Regenerate `PerpsController` method action types; shrink rate-limit diff and drop verbose history logs ([#8560](https://github.com/MetaMask/core/pull/8560))

### Removed

- **BREAKING:** Drop the dead `spotState` parameter from `adaptAccountStateFromSDK`. Spot balances are layered on by `addSpotBalanceToAccountState`, which enforces the USDC-only policy via `SPOT_COLLATERAL_COINS`; removing the dormant branch keeps one source of truth and prevents a future caller from silently getting ALL-coins behavior ([#8560](https://github.com/MetaMask/core/pull/8560))

### Fixed

- HyperLiquid Unified-mode live balance: subscribe to `spotState` WS and compute tradeable/total balance from on-chain math ([#8560](https://github.com/MetaMask/core/pull/8560))
- Complete spot-balance parity with the extension consumer ([#8560](https://github.com/MetaMask/core/pull/8560))
- Preserve integer trailing zeros when `szDecimals=0` in `perpsFormatters` ([#8560](https://github.com/MetaMask/core/pull/8560))
- Preserve candle pagination cancellation and skip coalesce for explicit-`endTime` candle paging to avoid stale pages ([#8560](https://github.com/MetaMask/core/pull/8560))
- Defer account resolution on the non-paginated cache path to prevent race conditions ([#8560](https://github.com/MetaMask/core/pull/8560))
- Force-refresh on activity mount and evict expired coalesce entries so stale promises cannot resolve to cache ([#8560](https://github.com/MetaMask/core/pull/8560))
- Normalize `event.user` to lowercase when caching the spot-state WS address so `#ensureSpotState` hits the cache instead of triggering a redundant REST `spotClearinghouseState` refetch when HyperLiquid returns a checksummed address ([#8560](https://github.com/MetaMask/core/pull/8560))

## [3.2.0]

### Added

- Add `isAbortError` utility export from `utils` for distinguishing expected cancellation errors from real failures ([#8515](https://github.com/MetaMask/core/pull/8515))

### Changed

- `TradingService.flipPosition()` no longer passes stale position `entryPrice` as `currentPrice` on reverse-position orders; providers now validate and price flips against live market data ([#8515](https://github.com/MetaMask/core/pull/8515))

### Removed

- Remove unused `ESTIMATED_FEE_RATE` export from `constants/hyperLiquidConfig` (dead code after reverse-position fee precheck was removed) ([#8515](https://github.com/MetaMask/core/pull/8515))

### Fixed

- Suppress noisy Sentry reports from expected historical-candle fetch cancellations (`AbortError`) during navigation, while preserving real error reporting in `HyperLiquidClientService` and `MarketDataService` ([#8515](https://github.com/MetaMask/core/pull/8515))

## [3.1.1]

### Fixed

- Preserve the `webpackIgnore` safeguard on the `MYXProvider` dynamic import in built dist files so extension consumers do not statically resolve the intentionally-unpublished MYX provider module ([#8473](https://github.com/MetaMask/core/pull/8473))
- Use HTTP transport for HyperLiquid candle snapshots and refresh DEX discovery cache handling to avoid rapid market-switching 429s after syncing the latest mobile perps controller state ([#8473](https://github.com/MetaMask/core/pull/8473))

## [3.1.0]

### Added

- Add disk-backed cold-start cache for instant data display on launch ([#8460](https://github.com/MetaMask/core/pull/8460))
- Add `skipTTL` option to `getCachedMarketDataForActiveProvider` and `getCachedUserDataForActiveProvider` ([#8460](https://github.com/MetaMask/core/pull/8460))
- Add perps decimal formatters (`perpsFormatters`) for shared formatting utilities ([#8460](https://github.com/MetaMask/core/pull/8460))
- Add `FUNDING_RATE_CONFIG` constants for funding rate display formatting ([#8460](https://github.com/MetaMask/core/pull/8460))
- Add `buildProviderCacheKey` and `getProviderNetworkKey` helper exports ([#8460](https://github.com/MetaMask/core/pull/8460))

### Changed

- Bump `@metamask/transaction-controller` from `^64.0.0` to `^64.1.0` ([#8432](https://github.com/MetaMask/core/pull/8432))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

### Fixed

- Fix TP/SL orders disappearing after creating a market order by filtering on `isPositionTpsl` ([#8460](https://github.com/MetaMask/core/pull/8460))
- Fix missing latest funding payments by using paginated fetch with auto-split ([#8460](https://github.com/MetaMask/core/pull/8460))
- Fix WebSocket reconnection on foreground return when socket is still alive ([#8460](https://github.com/MetaMask/core/pull/8460))

## [3.0.0]

### Added

- Export `PerpsControllerGetStateAction` type ([#8352](https://github.com/MetaMask/core/pull/8352))
- Expose missing public `PerpsController` methods through its messenger ([#8352](https://github.com/MetaMask/core/pull/8352))
  - The following actions are now available:
    - `PerpsController:calculateLiquidationPrice`
    - `PerpsController:calculateMaintenanceMargin`
    - `PerpsController:clearDepositResult`
    - `PerpsController:clearWithdrawResult`
    - `PerpsController:completeWithdrawalFromHistory`
    - `PerpsController:depositWithConfirmation`
    - `PerpsController:depositWithOrder`
    - `PerpsController:fetchHistoricalCandles`
    - `PerpsController:flipPosition`
    - `PerpsController:getActiveProvider`
    - `PerpsController:getActiveProviderOrNull`
    - `PerpsController:getAvailableDexs`
    - `PerpsController:getBlockExplorerUrl`
    - `PerpsController:getCachedMarketDataForActiveProvider`
    - `PerpsController:getCachedUserDataForActiveProvider`
    - `PerpsController:getCurrentNetwork`
    - `PerpsController:getMarketDataWithPrices`
    - `PerpsController:getMaxLeverage`
    - `PerpsController:getWatchlistMarkets`
    - `PerpsController:getWebSocketConnectionState`
    - `PerpsController:getWithdrawalProgress`
    - `PerpsController:getWithdrawalRoutes`
    - `PerpsController:init`
    - `PerpsController:isCurrentlyReinitializing`
    - `PerpsController:isFirstTimeUserOnCurrentNetwork`
    - `PerpsController:isWatchlistMarket`
    - `PerpsController:reconnect`
    - `PerpsController:setLiveDataConfig`
    - `PerpsController:startMarketDataPreload`
    - `PerpsController:stopMarketDataPreload`
    - `PerpsController:subscribeToAccount`
    - `PerpsController:subscribeToCandles`
    - `PerpsController:subscribeToConnectionState`
    - `PerpsController:subscribeToOICaps`
    - `PerpsController:subscribeToOrderBook`
    - `PerpsController:subscribeToOrderFills`
    - `PerpsController:subscribeToOrders`
    - `PerpsController:subscribeToPositions`
    - `PerpsController:subscribeToPrices`
    - `PerpsController:switchProvider`
    - `PerpsController:toggleWatchlistMarket`
    - `PerpsController:updateMargin`
    - `PerpsController:updatePositionTPSL`
    - `PerpsController:updateWithdrawalProgress`
    - `PerpsController:updateWithdrawalStatus`
    - `PerpsController:validateClosePosition`
    - `PerpsController:validateOrder`
    - `PerpsController:validateWithdrawal`
  - Corresponding action types are available as well.
- Add `completeWithdrawalFromHistory` method for FIFO-based withdrawal completion matching ([#8333](https://github.com/MetaMask/core/pull/8333))
- Add `lastCompletedWithdrawalTimestamp` and `lastCompletedWithdrawalTxHashes` state fields ([#8333](https://github.com/MetaMask/core/pull/8333))

### Changed

- Refactor pending withdraw/deposit tracking to FIFO queue design ([#8333](https://github.com/MetaMask/core/pull/8333))
- Centralize Arbitrum network check in deposit hooks to prevent missing network errors ([#8333](https://github.com/MetaMask/core/pull/8333))
- Provider credentials, builder fee injection, and env var centralization ([#8333](https://github.com/MetaMask/core/pull/8333))
- Reduce max order amount by 0.5% buffer to avoid insufficient margin rejections ([#8333](https://github.com/MetaMask/core/pull/8333))
- Bump `@metamask/account-tree-controller` from `^6.0.0` to `^7.0.0` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/profile-sync-controller` from `^28.0.1` to `^28.0.2` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Move `@myx-trade/sdk` from `dependencies` to `optionalDependencies` so consumers (extension, mobile) do not install it automatically ([#8398](https://github.com/MetaMask/core/pull/8398))
  - Combined with the MYX adapter export removal below, this prevents `@myx-trade/sdk` from entering the consumer's static webpack/metro import graph
  - `MYXProvider` continues to load `@myx-trade/sdk` via dynamic `import()` when `MM_PERPS_MYX_PROVIDER_ENABLED=true`
- Add `/* webpackIgnore: true */` magic comment to the `MYXProvider` dynamic import so webpack (extension) skips static resolution of the intentionally-unshipped module ([#8398](https://github.com/MetaMask/core/pull/8398))

### Removed

- **BREAKING:** Remove `adaptMarketFromMYX`, `adaptPriceFromMYX`, `adaptMarketDataFromMYX`, `filterMYXExclusiveMarkets`, `isOverlappingMarket`, `buildPoolSymbolMap`, `buildSymbolPoolsMap`, and `extractSymbolFromPoolId` from the public package exports to prevent `@myx-trade/sdk` from being included in the static webpack bundle ([#8398](https://github.com/MetaMask/core/pull/8398))
  - These functions are still used internally by `MYXProvider`, which is loaded via dynamic import
  - Consumers that imported these utilities directly should instead import from `@metamask/perps-controller/src/utils/myxAdapter` or duplicate the logic locally

### Fixed

- Preserve `/* webpackIgnore: true */` magic comment in built dist files by using a variable for the MYXProvider dynamic import path, preventing ts-bridge from rewriting the AST node and stripping the comment ([#8424](https://github.com/MetaMask/core/pull/8424))
- Fix incorrect fee estimate when flipping a position ([#8333](https://github.com/MetaMask/core/pull/8333))
- Fix incorrect PnL and order size displayed after SL execution ([#8333](https://github.com/MetaMask/core/pull/8333))
- Fix stop loss not showing up in recent activity ([#8333](https://github.com/MetaMask/core/pull/8333))
- Fix incorrect market categories ([#8333](https://github.com/MetaMask/core/pull/8333))
- Fix TP/SL decimal precision for PUMP ([#8333](https://github.com/MetaMask/core/pull/8333))
- Fix missing decimal on price input when using preset on limit price ([#8333](https://github.com/MetaMask/core/pull/8333))

## [2.0.0]

### Changed

- Sync mobile perps code to core (mobile branch `feat/perps/core-resolver`) ([#8291](https://github.com/MetaMask/core/pull/8291))
- Add `@metamask/geolocation-controller` dependency for eligibility geolocation checks ([#8291](https://github.com/MetaMask/core/pull/8291))
- Exclude `MYXWalletService` from published package files ([#8291](https://github.com/MetaMask/core/pull/8291))
- MYX provider improvements: enhanced error handling, wallet service integration ([#8291](https://github.com/MetaMask/core/pull/8291))
- HyperLiquid provider improvements: subscription reliability, order book processing ([#8291](https://github.com/MetaMask/core/pull/8291))
- Eligibility service refactored for geolocation-based region blocking ([#8291](https://github.com/MetaMask/core/pull/8291))
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [1.3.0]

### Changed

- Exclude `@myx-trade/sdk` from build output by default, reducing bundled size by ~57% ([#8234](https://github.com/MetaMask/core/pull/8234))
- MYX provider files are excluded from the package when publishing
- Static import of `MYXProvider` replaced with dynamic `import()` that depends upon `MM_PERPS_MYX_PROVIDER_ENABLED=true` to break the eager dependency chain

## [1.2.0]

### Added

- Add `stopEligibilityMonitoring()` method to pause geo-blocking eligibility checks when basic functionality is disabled ([#8214](https://github.com/MetaMask/core/pull/8214))

## [1.1.0]

### Added

- feat: defer eligibility to allow for onboarding to proceed without le… ([#8197](https://github.com/MetaMask/core/pull/8197))

## [1.0.1]

### Changed

- Bump `@metamask/profile-sync-controller` from `^27.1.0` to `^28.0.0` ([#8162](https://github.com/MetaMask/core/pull/8162))
- Bump `@metamask/account-tree-controller` from `^5.0.0` to `^5.0.1` ([#8162](https://github.com/MetaMask/core/pull/8162))

## [1.0.0]

### Added

- Initial release ([#7654](https://github.com/MetaMask/core/pull/7654), [#7941](https://github.com/MetaMask/core/pull/7941))
  - Add full `PerpsController` with multi-provider architecture, state management, and messenger integration
  - Add `HyperLiquidProvider` with complete DEX integration: trading, market data, order book, WebSocket subscriptions, wallet operations, and HIP-3 builder-deployed perpetuals support
  - Add `MYXProvider` with DEX integration: trading, market data, and account management
  - Add `AggregatedPerpsProvider` for multi-provider aggregation and unified market/position views
  - Add `ProviderRouter` for routing operations to the appropriate provider based on market configuration
  - Add `SubscriptionMultiplexer` for real-time WebSocket data aggregation across providers
  - Add `TradingService` for order placement, modification, cancellation, and position management
  - Add `MarketDataService` for market listing, pricing, funding rates, and order book data
  - Add `AccountService` for account state, balances, positions, and open orders
  - Add `DepositService` for deposit flow handling
  - Add `EligibilityService` for user eligibility verification
  - Add `FeatureFlagConfigurationService` for runtime feature flag management
  - Add `HyperLiquidClientService`, `HyperLiquidSubscriptionService`, and `HyperLiquidWalletService` for HyperLiquid-specific operations
  - Add `MYXClientService` for MYX-specific API operations
  - Add `DataLakeService` for data lake integration
  - Add `RewardsIntegrationService` for rewards system integration
  - Add `TradingReadinessCache` for caching trading readiness state
  - Add `ServiceContext` for service dependency injection
  - Add comprehensive type definitions for perps, HyperLiquid, MYX, configuration, tokens, and transactions
  - Add utility functions for market data transformation, order calculations, account operations, validation, and adapters
  - Add state selectors for accessing controller state
  - Add error code definitions for structured error handling
  - Add configuration constants for HyperLiquid, MYX, charts, order types, and performance metrics
  - Add platform-agnostic design via `PerpsPlatformDependencies` injection interface
  - Add generated method action types for messenger-exposed methods

### Changed

- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@11.0.0...HEAD
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@10.0.0...@metamask/perps-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@9.3.0...@metamask/perps-controller@10.0.0
[9.3.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@9.2.1...@metamask/perps-controller@9.3.0
[9.2.1]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@9.2.0...@metamask/perps-controller@9.2.1
[9.2.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@9.1.0...@metamask/perps-controller@9.2.0
[9.1.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@9.0.0...@metamask/perps-controller@9.1.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@8.3.0...@metamask/perps-controller@9.0.0
[8.3.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@8.2.0...@metamask/perps-controller@8.3.0
[8.2.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@8.1.0...@metamask/perps-controller@8.2.0
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@8.0.0...@metamask/perps-controller@8.1.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@7.0.0...@metamask/perps-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@6.3.0...@metamask/perps-controller@7.0.0
[6.3.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@6.2.0...@metamask/perps-controller@6.3.0
[6.2.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@6.1.0...@metamask/perps-controller@6.2.0
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@6.0.1...@metamask/perps-controller@6.1.0
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@6.0.0...@metamask/perps-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@5.0.0...@metamask/perps-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@4.0.0...@metamask/perps-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@3.2.0...@metamask/perps-controller@4.0.0
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@3.1.1...@metamask/perps-controller@3.2.0
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@3.1.0...@metamask/perps-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@3.0.0...@metamask/perps-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@2.0.0...@metamask/perps-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.3.0...@metamask/perps-controller@2.0.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.2.0...@metamask/perps-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.1.0...@metamask/perps-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.0.1...@metamask/perps-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.0.0...@metamask/perps-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/perps-controller@1.0.0
