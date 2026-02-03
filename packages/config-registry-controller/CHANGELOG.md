# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `selectNetworks` and `selectFeaturedNetworks` selectors for filtering networks downstream ([#7809](https://github.com/MetaMask/core/pull/7809))
- Initial release of `@metamask/config-registry-controller` ([#7668](https://github.com/MetaMask/core/pull/7668))
  - Controller for fetching and managing network configurations from a remote API
  - ConfigRegistryApiService with ETag support, retries, circuit breaker, and timeout handling
  - Feature flag integration using `config_registry_api_enabled` to enable/disable API fetching
  - Fallback configuration support when API is unavailable or feature flag is disabled
  - State persistence for configs, version, lastFetched, and etag
  - Uses StaticIntervalPollingController for periodic updates (default: 24 hours)

### Changed

- **BREAKING:** `configs.networks` is now `Record<string, RegistryNetworkConfig>`; stores full API response including `isFeatured`, `isTestnet`, etc. Use `selectFeaturedNetworks` selector for the default network list (featured, active, non-testnet) ([#7809](https://github.com/MetaMask/core/pull/7809))
- Simplified controller state and API service structure ([#7809](https://github.com/MetaMask/core/pull/7809))
  - **BREAKING:** Removed `fetchError` from state; errors are reported via `messenger.captureException` instead
  - Renamed `transformers.ts` to `filters.ts` in config-registry-api-service
  - Simplified `filterNetworks` implementation

[Unreleased]: https://github.com/MetaMask/core/
