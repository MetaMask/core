# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#7654](https://github.com/MetaMask/core/pull/7654))
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
- Add generated method action types for messenger-exposed methods ([#7941](https://github.com/MetaMask/core/pull/7941))

### Changed

- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

[Unreleased]: https://github.com/MetaMask/core/
