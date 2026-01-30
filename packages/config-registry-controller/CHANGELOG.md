# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@metamask/config-registry-controller` ([#7668](https://github.com/MetaMask/core/pull/7668))
  - Controller for fetching and managing network configurations from a remote API
  - ConfigRegistryApiService with ETag support, retries, circuit breaker, and timeout handling
  - Network filtering to only include featured, active, non-testnet networks
  - Feature flag integration using `config_registry_api_enabled` to enable/disable API fetching
  - Fallback configuration support when API is unavailable or feature flag is disabled
  - State persistence for configs, version, lastFetched, and etag
  - Uses StaticIntervalPollingController for periodic updates (default: 24 hours)

[Unreleased]: https://github.com/MetaMask/core/
