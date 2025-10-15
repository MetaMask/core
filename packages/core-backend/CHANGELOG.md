# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Added

- **BREAKING:** Add required argument `channelType` to `BackendWebSocketService.subscribe` method ([#6819](https://github.com/MetaMask/core/pull/6819))
  - Add `channelType` to argument of the `BackendWebSocketService:subscribe` messenger action
  - Add `channelType` to `WebSocketSubscription` type
- **BREAKING**: Update `Asset` type definition: add required `decimals` field for proper token amount formatting ([#6819](https://github.com/MetaMask/core/pull/6819))
- Add optional `traceFn` parameter to `BackendWebSocketService` constructor for performance tracing integration (e.g., Sentry) ([#6819](https://github.com/MetaMask/core/pull/6819))
  - Enables tracing of WebSocket operations including connect, disconnect methods
  - Trace function receives operation metadata and callback to wrap for performance monitoring
- Add optional `timestamp` property to `ServerNotificationMessage` and `SystemNoticationData` types ([#6819](https://github.com/MetaMask/core/pull/6819))
- Add optional `timestamp` property to `AccountActivityService:statusChanged` event and corresponding event type ([#6819](https://github.com/MetaMask/core/pull/6819))

### Changed

- **BREAKING:** Update `BackendWebSocketService` to automatically manage WebSocket connections based on wallet lock state ([#6819](https://github.com/MetaMask/core/pull/6819))
  - `KeyringController:lock` and `KeyringController:unlock` are now required events in the `BackendWebSocketService` messenger
- **BREAKING**: Update `Transaction` type definition: rename `hash` field to `id` for consistency with backend API ([#6819](https://github.com/MetaMask/core/pull/6819))
- **BREAKING:** Add peer dependency on `@metamask/keyring-controller` (^23.0.0) ([#6819](https://github.com/MetaMask/core/pull/6819))
- Update `BackendWebSocketService` to simplify reconnection logic: auto-reconnect on any unexpected disconnect (not just code 1000), stay disconnected when manually disconnecting via `disconnect` ([#6819](https://github.com/MetaMask/core/pull/6819))
- Improve error handling in `BackendWebSocketService.connect()` to properly rethrow errors to callers ([#6819](https://github.com/MetaMask/core/pull/6819))
- Update `AccountActivityService` to replace API-based chain support detection with system notification-driven chain tracking ([#6819](https://github.com/MetaMask/core/pull/6819))
  - Instead of hardcoding a list of supported chains, assume that the backend has the list
  - When receiving a system notification, capture the backend-tracked status of each chain instead of assuming it is up or down
  - Flush all tracked chains as 'down' on disconnect/error (instead of using hardcoded list)
- Update documentation in `README.md` to reflect new connection management model and chain tracking behavior ([#6819](https://github.com/MetaMask/core/pull/6819))
  - Add "WebSocket Connection Management" section explaining connection requirements and behavior
  - Update sequence diagram to show system notification-driven chain status flow
  - Update key flow characteristics to reflect internal chain tracking mechanism

### Removed

- **BREAKING**: Remove `getSupportedChains` method from `AccountActivityService` ([#6819](https://github.com/MetaMask/core/pull/6819))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/core-backend@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@1.0.1...@metamask/core-backend@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/core-backend@1.0.0...@metamask/core-backend@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/core-backend@1.0.0
