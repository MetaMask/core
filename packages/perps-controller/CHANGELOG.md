# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Complete PerpsController implementation migrated from MetaMask Mobile ([#7749](https://github.com/MetaMask/core/pull/7749))
  - `PerpsController` - Main controller class with full trading functionality (~3,000 lines)
  - `selectors.ts` - 8 state selectors for UI integration
  - `types/` - Comprehensive TypeScript type definitions
  - `constants/` - Configuration constants (perpsConfig, hyperLiquidConfig, errorCodes)
  - `utils/` - 18 utility modules for calculations, formatting, validation
  - `services/` - 8 service modules (Trading, MarketData, Eligibility, etc.)
  - `providers/` - HyperLiquidProvider, AggregatedPerpsProvider
  - `platform-services/` - HyperLiquid client, subscription, and wallet services
  - `routing/` - ProviderRouter for multi-provider support
  - `aggregation/` - SubscriptionMultiplexer for WebSocket management

[Unreleased]: https://github.com/MetaMask/core/
