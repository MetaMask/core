# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6823](https://github.com/MetaMask/core/pull/6823))
  - Previously, `AccountActivityService` and `BackendWebSocketService` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.

### Removed

- **BREAKING:** Remove exported type aliases and constants that were specific to controller messenger integration ([#6823](https://github.com/MetaMask/core/pull/6823))
  - Removed type exports: `BackendWebSocketServiceAllowedActions`, `BackendWebSocketServiceAllowedEvents`, `AccountActivityServiceAllowedActions`, `AccountActivityServiceAllowedEvents`
  - Removed constant exports: `ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS`, `ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS`
  - These types and constants were internal implementation details that should not have been exposed. Consumers should use the service-specific messenger types directly.

## [1.0.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/profile-sync-controller` from `^25.1.0` to `^25.1.1` ([#6810](https://github.com/MetaMask/core/pull/6810))

## [1.0.0]

### Added

- **Initial release of `@metamask/core-backend` package** - Core backend services for MetaMask serving as the data layer between Backend services and Frontend applications ([#6722](https://github.com/MetaMask/core/pull/6722))
- **BackendWebSocketService** - WebSocket client providing authenticated real-time data delivery with:
  - Connection management and automatic reconnection with exponential backoff
  - Message routing and subscription management
  - Authentication integration with `AuthenticationController`
  - Type-safe messenger-based API for controller integration
- **AccountActivityService** - High-level service for monitoring account activity with:
  - Real-time account activity monitoring via WebSocket subscriptions
  - Balance update notifications for integration with `TokenBalancesController`
  - Chain status change notifications for dynamic polling coordination
  - Account subscription management with automatic cleanup
- **Type definitions** - Comprehensive TypeScript types for transactions, balances, WebSocket messages, and service configurations
- **Logging infrastructure** - Structured logging with module-specific loggers for debugging and monitoring

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/core-backend@1.0.1...HEAD
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/core-backend@1.0.0...@metamask/core-backend@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/core-backend@1.0.0
