# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `BOTTOM_NAV_BAR` to `PERPS_EVENT_VALUE.SOURCE` for bottom navigation bar analytics attribution ([#9551](https://github.com/MetaMask/core/pull/9551))

### Changed

- Bump `@metamask/transaction-controller` from `^69.1.0` to `^69.2.1` ([#9589](https://github.com/MetaMask/core/pull/9589), [#9593](https://github.com/MetaMask/core/pull/9593))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@9.3.0...HEAD
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
