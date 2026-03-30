# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Refactor pending withdraw/deposit tracking to FIFO queue design ([#8333](https://github.com/MetaMask/core/pull/8333))
- Add `completeWithdrawalFromHistory` method for FIFO-based withdrawal completion matching ([#8333](https://github.com/MetaMask/core/pull/8333))
- Add `lastCompletedWithdrawalTimestamp` and `lastCompletedWithdrawalTxHashes` state fields ([#8333](https://github.com/MetaMask/core/pull/8333))

### Changed

- Centralize Arbitrum network check in deposit hooks to prevent missing network errors ([#8333](https://github.com/MetaMask/core/pull/8333))
- Provider credentials, builder fee injection, and env var centralization ([#8333](https://github.com/MetaMask/core/pull/8333))
- Reduce max order amount by 0.5% buffer to avoid insufficient margin rejections ([#8333](https://github.com/MetaMask/core/pull/8333))
- Bump `@metamask/account-tree-controller` from `^6.0.0` to `^7.0.0` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/profile-sync-controller` from `^28.0.1` to `^28.0.2` ([#8325](https://github.com/MetaMask/core/pull/8325))

### Fixed

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.3.0...@metamask/perps-controller@2.0.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.2.0...@metamask/perps-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.1.0...@metamask/perps-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.0.1...@metamask/perps-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/perps-controller@1.0.0...@metamask/perps-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/perps-controller@1.0.0
