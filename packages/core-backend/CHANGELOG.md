# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Update Release 606.0.0 (#6798)" ([#6798](https://github.com/MetaMask/core/pull/6798))
- Update Release 606.0.0 ([#6798](https://github.com/MetaMask/core/pull/6798))

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

[Unreleased]: https://github.com/MetaMask/core/
