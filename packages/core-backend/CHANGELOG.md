# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `includeAggregators` option to `V3AssetsQueryOptions` so the tokens v3 assets API can be called with `includeAggregators: true` to return DEX/aggregator integrations in the response ([#8021](https://github.com/MetaMask/core/pull/8021))

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^36.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [6.0.0]

### Added

- Add `ApiPlatformClientService` to expose `ApiPlatformClient` via the messenger without a controller ([#7928](https://github.com/MetaMask/core/pull/7928))
  - Consumers call `messenger.call('ApiPlatformClientService:getApiPlatformClient')` to obtain the shared client for accounts, prices, token, and tokens APIs
- Export TanStack Query options for all API endpoints via `get*QueryOptions` helpers ([#7928](https://github.com/MetaMask/core/pull/7928))
  - Each fetch method (e.g. `fetchV5MultiAccountBalances`) has a corresponding `get*QueryOptions` (e.g. `getV5MultiAccountBalancesQueryOptions`) returning the same options object used internally
  - Enables reuse with `useQuery`, `useInfiniteQuery`, `useSuspenseQuery`, and other TanStack Query APIs
- Extend `FetchOptions` to allow TanStack Query options (e.g. `select`, `initialPageParam`, `retry`, `initialData`) to be passed through to `get*QueryOptions` and merged into the returned query options
  - Export `getQueryOptionsOverrides` helper for stripping `queryKey`/`queryFn` from options when merging
  - All API clients (accounts, prices, token, tokens) merge user overrides first, then apply `staleTime`/`gcTime` defaults so cache timing is consistent and extra options (e.g. `select`) are preserved

### Changed

- **BREAKING:** Merge `fetchV2BalancesWithOptions` into `fetchV2Balances` ([#7928](https://github.com/MetaMask/core/pull/7928))
  - `fetchV2Balances(address, queryOptions?, options?)` now accepts the full query options: `networks`, `filterSupportedTokens`, `includeTokenAddresses`, `includeStakedAssets`
  - `getV2BalancesQueryOptions` accepts the same full query options for use with TanStack Query
  - `fetchV2BalancesWithOptions` and `getV2BalancesWithOptionsQueryOptions` have been removed; use `fetchV2Balances` and `getV2BalancesQueryOptions` with the desired options instead
- **BREAKING:** Align v4 multi-account transactions with API ([#7928](https://github.com/MetaMask/core/pull/7928))
  - First parameter renamed from `accountIds` to `accountAddresses` in `fetchV4MultiAccountTransactions` and `getV4MultiAccountTransactionsQueryOptions`
  - Query options now include: `startTimestamp`, `endTimestamp`, `limit`, `after`, `before`, `maxLogsPerTx`, `lang` in addition to `networks`, `cursor`, `sortDirection`, `includeLogs`, `includeTxMetadata`
  - `includeValueTransfers` has been removed from the options (not in API spec)
- Accounts, prices, and tokens clients: `fetch*` and `get*QueryOptions` now short-circuit on empty required inputs (e.g. empty address, empty account IDs or asset lists) and return empty results without calling the API ([#7928](https://github.com/MetaMask/core/pull/7928))

## [5.1.1]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.2` to `^36.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/profile-sync-controller` from `^27.0.0` to `^27.1.0` ([#7849](https://github.com/MetaMask/core/pull/7849))

## [5.1.0]

### Added

- Add `ApiPlatformClient` for unified access to MetaMask backend APIs with TanStack Query caching ([#7658](https://github.com/MetaMask/core/pull/7658), [#7735](https://github.com/MetaMask/core/pull/7735), [#7686](https://github.com/MetaMask/core/pull/7686))
  - Automatic request deduplication and intelligent caching
  - Automatic retries with exponential backoff for transient failures
  - Support for Accounts API, Price API, Token API, and Tokens API endpoints
  - Export helper functions `shouldRetry` and `calculateRetryDelay` for custom retry logic
  - Export API types for external consumers

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642), [#7713](https://github.com/MetaMask/core/pull/7713))
  - The dependencies moved are:
    - `@metamask/accounts-controller` (^35.0.2)
    - `@metamask/keyring-controller` (^25.1.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.18.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583))

## [5.0.0]

### Changed

- Bump `@metamask/profile-sync-controller` from `^26.0.0` to `^27.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/keyring-controller` from `^24.0.0` to `^25.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^34.0.0` to `^35.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [4.1.0]

### Changed

- Improve WebSocket connection lifecycle tracing in `BackendWebSocketService` ([#7101](https://github.com/MetaMask/core/pull/7101))
  - WebSocket connection duration is now properly reflected in trace span duration instead of only in custom data
  - Trace all disconnections (both manual and unexpected) to provide complete connection lifecycle visibility in traces
  - Omit `connectionDuration_ms` from disconnection traces when connection never established (onClose without onOpen)
- Update `BackendWebSocketService` default exponential backoff options for reconnection ([#7101](https://github.com/MetaMask/core/pull/7101))
  - Increase default `reconnectDelay` from 500 milliseconds to 10 seconds
  - Increase default `maxReconnectDelay` from 30 seconds to 60 seconds
- Simplify WebSocket disconnection code in `BackendWebSocketService` ([#7101](https://github.com/MetaMask/core/pull/7101))
  - Centralize all disconnection logic in `ws.onclose` handler for single source of truth
  - Centralize all state changes within `#establishConnection` method - state transitions only occur in `onopen` (CONNECTING → CONNECTED) and `onclose` (any state → DISCONNECTED)
  - Add `MANUAL_DISCONNECT_CODE` (4999) and `MANUAL_DISCONNECT_REASON` constants to distinguish manual from unexpected disconnects
- Bump `@ts-bridge/cli` from `^0.6.1` to `^0.6.4` ([#7039](https://github.com/MetaMask/core/pull/7039))

### Removed

- Remove `BackendWebSocketService Channel Message` trace as it provided no useful performance insights ([#7101](https://github.com/MetaMask/core/pull/7101))

## [4.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6823](https://github.com/MetaMask/core/pull/6823))
  - Previously, `AccountActivityService` and `BackendWebSocketService` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6823](https://github.com/MetaMask/core/pull/6823))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^33.0.0` to `^34.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/keyring-controller` from `^23.0.0` to `^24.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/profile-sync-controller` from `^25.1.2` to `^26.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

### Removed

- **BREAKING:** Remove exported type aliases and constants that were specific to controller messenger integration ([#6823](https://github.com/MetaMask/core/pull/6823))
  - Removed type exports: `BackendWebSocketServiceAllowedActions`, `BackendWebSocketServiceAllowedEvents`, `AccountActivityServiceAllowedActions`, `AccountActivityServiceAllowedEvents`
  - Removed constant exports: `ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS`, `ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS`
  - These types and constants were internal implementation details that should not have been exposed. Consumers should use the service-specific messenger types directly.
- Bump `@metamask/profile-sync-controller` from `^25.1.1` to `^25.1.2` ([#6940](https://github.com/MetaMask/core/pull/6940))

## [3.0.0]

### Added

- Add `forceReconnection()` method to `BackendWebSocketService` for controlled subscription state cleanup ([#6861](https://github.com/MetaMask/core/pull/6861))
  - Performs a controlled disconnect-then-reconnect sequence with exponential backoff
  - Useful for recovering from subscription/unsubscription issues and cleaning up orphaned subscriptions
  - Add `BackendWebSocketService:forceReconnection` messenger action
- Add stable connection timer to prevent rapid reconnection loops ([#6861](https://github.com/MetaMask/core/pull/6861))
  - Connection must stay stable for 10 seconds before resetting reconnect attempts
  - Prevents issues when server accepts connection then immediately closes it

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))
- Update `AccountActivityService` to use new `forceReconnection()` method instead of manually calling disconnect/connect ([#6861](https://github.com/MetaMask/core/pull/6861))
- **BREAKING:** Update allowed actions for `AccountActivityService` messenger: remove `BackendWebSocketService:disconnect`, add `BackendWebSocketService:forceReconnection` ([#6861](https://github.com/MetaMask/core/pull/6861))
- Improve reconnection scheduling in `BackendWebSocketService` to be idempotent ([#6861](https://github.com/MetaMask/core/pull/6861))
  - Prevents duplicate reconnection timers and inflated attempt counters
  - Scheduler checks if reconnect is already scheduled before creating new timer
- Improve error handling in `BackendWebSocketService.connect()` ([#6861](https://github.com/MetaMask/core/pull/6861))
  - Always schedule reconnect on connection failure (exponential backoff prevents aggressive retries)
  - Remove redundant schedule calls from error paths
- Update `BackendWebSocketService.disconnect()` to reset reconnect attempts counter ([#6861](https://github.com/MetaMask/core/pull/6861))
- Update `BackendWebSocketService.disconnect()` return type from `Promise<void>` to `void` ([#6861](https://github.com/MetaMask/core/pull/6861))
- Improve logging throughout `BackendWebSocketService` for better debugging ([#6861](https://github.com/MetaMask/core/pull/6861))

### Fixed

- Fix potential race condition in `BackendWebSocketService.connect()` that could bypass exponential backoff when reconnect is already scheduled ([#6861](https://github.com/MetaMask/core/pull/6861))
- Fix memory leak from orphaned timers when multiple reconnects are scheduled ([#6861](https://github.com/MetaMask/core/pull/6861))
- Fix issue where reconnect attempts counter could grow unnecessarily with duplicate scheduled reconnects ([#6861](https://github.com/MetaMask/core/pull/6861))

## [2.1.0]

### Added

- Add optional `traceFn` parameter to `AccountActivityService` constructor for performance tracing integration ([#6842](https://github.com/MetaMask/core/pull/6842))
  - Enables tracing of transaction message receipt with elapsed time from transaction timestamp to message arrival
  - Trace captures `chain`, `status`, and `elapsed_ms` for monitoring transaction delivery latency

### Fixed

- Fix race condition in `BackendWebSocketService.connect()` that could create multiple concurrent WebSocket connections when called simultaneously from multiple event sources (e.g., `KeyringController:unlock`, `AuthenticationController:stateChange`, and `MetaMaskController.isClientOpen`) ([#6842](https://github.com/MetaMask/core/pull/6842))
  - Connection promise is now set synchronously before any async operations to prevent duplicate connections

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/core-backend@6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@5.1.1...@metamask/core-backend@6.0.0
[5.1.1]: https://github.com/MetaMask/core/compare/@metamask/core-backend@5.1.0...@metamask/core-backend@5.1.1
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@5.0.0...@metamask/core-backend@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@4.1.0...@metamask/core-backend@5.0.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@4.0.0...@metamask/core-backend@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@3.0.0...@metamask/core-backend@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@2.1.0...@metamask/core-backend@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@2.0.0...@metamask/core-backend@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/core-backend@1.0.1...@metamask/core-backend@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/core-backend@1.0.0...@metamask/core-backend@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/core-backend@1.0.0
