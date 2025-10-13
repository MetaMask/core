# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING**: `BackendWebSocketService` - Simplified connection management and added KeyringController event integration ([#6819](https://github.com/MetaMask/core/pull/6819))
  - Added `KeyringController:lock` and `KeyringController:unlock` event subscriptions to automatically manage WebSocket connections based on wallet lock state
  - Renamed internal method `setupAuthentication()` to `subscribeEvents()` to reflect broader event handling responsibilities
  - Simplified reconnection logic: auto-reconnect on any unexpected disconnect, stay disconnected on manual disconnects (tracked via `#manualDisconnect` flag)
  - Updated `connect()` to reset manual disconnect flag, allowing reconnection after previous manual disconnects
  - Updated `disconnect()` to set manual disconnect flag, preventing automatic reconnection
  - Improved error handling in `connect()` to properly rethrow errors to callers
- **BREAKING**: `AccountActivityService` - Replaced API-based chain support detection with system notification-driven chain tracking ([#6819](https://github.com/MetaMask/core/pull/6819))
  - Added internal `#chainsUp` Set to track chains reported as 'up' via system notifications
  - Updated system notification handler to dynamically track chain status (add to set when 'up', remove when 'down')
  - Updated WebSocket state change handler to flush all tracked chains as 'down' on disconnect/error (instead of using hardcoded list)
  - Chain status is now entirely driven by backend system notifications rather than proactive API calls
- **BREAKING**: Updated `Transaction` type definition - renamed `hash` field to `id` for consistency with backend API ([#6819](https://github.com/MetaMask/core/pull/6819))
- **BREAKING**: Updated `Asset` type definition - added required `decimals` field for proper token amount formatting ([#6819](https://github.com/MetaMask/core/pull/6819))
- `BackendWebSocketService` - Added optional `traceFn` parameter to constructor for performance tracing integration (e.g., Sentry)
  - Enables tracing of WebSocket operations including connect, disconnect methods
  - Trace function receives operation metadata and callback to wrap for performance monitoring
- Updated documentation (README.md) to reflect new connection management model and chain tracking behavior ([#6819](https://github.com/MetaMask/core/pull/6819))
  - Added "WebSocket Connection Management" section explaining connection requirements and behavior
  - Updated sequence diagram to show system notification-driven chain status flow
  - Updated key flow characteristics to reflect internal chain tracking mechanism

### Removed

- **BREAKING**: Removed `getSupportedChains()` public method and all related API fetching logic
- **BREAKING**: Removed hardcoded `DEFAULT_SUPPORTED_CHAINS` fallback list and cache expiration mechanism

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
