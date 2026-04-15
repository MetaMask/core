# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release/910.0.0 ([#8447](https://github.com/MetaMask/core/pull/8447))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Use Oxfmt for import sorting instead of `import-x/order` ([#8438](https://github.com/MetaMask/core/pull/8438))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- Release 906.0.0 ([#8425](https://github.com/MetaMask/core/pull/8425))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- Release/896.0.0 ([#8363](https://github.com/MetaMask/core/pull/8363))
- Release/895.0.0 ([#8359](https://github.com/MetaMask/core/pull/8359))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))
- Release/888.0.0 ([#8313](https://github.com/MetaMask/core/pull/8313))
- Release/884.0.0 ([#8301](https://github.com/MetaMask/core/pull/8301))
- Release/877.0.0 ([#8272](https://github.com/MetaMask/core/pull/8272))
- Release/871.0.0 ([#8239](https://github.com/MetaMask/core/pull/8239))
- Release/869.0.0 ([#8225](https://github.com/MetaMask/core/pull/8225))
- Release 866.0.0 ([#8217](https://github.com/MetaMask/core/pull/8217))
- Release/864.0.0 ([#8211](https://github.com/MetaMask/core/pull/8211))
- Release/855.0.0 ([#8140](https://github.com/MetaMask/core/pull/8140))
- Release/847.0.0 ([#8104](https://github.com/MetaMask/core/pull/8104))
- Release 845.0.0 ([#8099](https://github.com/MetaMask/core/pull/8099))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))

### Changed

- Bump `@metamask/transaction-controller` from `^64.0.0` to `^64.1.0` ([#8432](https://github.com/MetaMask/core/pull/8432))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@2.0.0...@metamask/perps-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.3.0...@metamask/perps-controller@2.0.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.2.0...@metamask/perps-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.1.0...@metamask/perps-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.0.1...@metamask/perps-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.0.0...@metamask/perps-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/perps-controller@1.0.0
