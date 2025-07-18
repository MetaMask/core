# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [24.0.1]

### Changed

- Requests to an RPC endpoint that returns a 502 response ("bad gateway") will now be retried ([#5923](https://github.com/MetaMask/core/pull/5923))
- All JSON-RPC errors that represent 4xx and 5xx responses from RPC endpoints now include the HTTP status code under `data.httpStatus` ([#5923](https://github.com/MetaMask/core/pull/5923))
- 3xx responses from RPC endpoints are no longer treated as errors ([#5923](https://github.com/MetaMask/core/pull/5923))
- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

### Fixed

- If an RPC endpoint returns invalid/unparseable JSON, it is now represented as a JSON-RPC error with code -32700 (parse error) instead of -32603 (internal error) ([#5923](https://github.com/MetaMask/core/pull/5923))
- If an RPC endpoint returns a 401 response, it is now represented as a JSON-RPC error with code -32006 (unauthorized) instead of -32603 (internal error) ([#5923](https://github.com/MetaMask/core/pull/5923))
- If an RPC endpoint returns a 405 response, it is now represented as a JSON-RPC error with code -32080 (client error) instead of -32601 (method not found) ([#5923](https://github.com/MetaMask/core/pull/5923))
- If an RPC endpoint returns a 402, 404, or 5xx response, it is now represented as a JSON-RPC error with code -32002 (resource unavailable error) instead of -32603 (internal error) ([#5923](https://github.com/MetaMask/core/pull/5923))
- If an RPC endpoint returns a 4xx response besides 401, 402, 404, 405, or 429, it is now represented as a JSON-RPC error with code -32080 (client error) instead of -32603 (internal error) ([#5923](https://github.com/MetaMask/core/pull/5923))
- Improve detection of partial JSON responses from RPC endpoints ([#5923](https://github.com/MetaMask/core/pull/5923))
- Fix "Request cannot be constructed from a URL that includes credentials" error when using RPC endpoints with embedded credentials ([#6116](https://github.com/MetaMask/core/pull/6116))

## [24.0.0]

### Changed

- **BREAKING:** Remove `@metamask/error-reporting-service@^1.0.0` as a direct dependency, add `^2.0.0` as a peer dependency ([#5970](https://github.com/MetaMask/core/pull/5970), [#5999](https://github.com/MetaMask/core/pull/5999))

## [23.6.0]

### Added

- Add Base network to default infura networks ([#5902](https://github.com/MetaMask/core/pull/5902))
  - Network changes were added in `@metamask/controller-utils`

### Changed

- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))

## [23.5.1]

### Changed

- **BREAKING:** NetworkController messenger now requires the `ErrorReportingService:captureException` action to be allowed ([#5970](https://github.com/MetaMask/core/pull/5970))
  - This change was originally missed when this release was created. It was added to the changelog afterward.
- Block tracker errors will no longer be wrapped under "PollingBlockTracker - encountered an error while attempting to update latest block" ([#5860](https://github.com/MetaMask/core/pull/5860))
- Bump dependencies ([#5867](https://github.com/MetaMask/core/pull/5867), [#5860](https://github.com/MetaMask/core/pull/5860))
  - Bump `@metamask/eth-block-tracker` to `^12.0.1`
  - Bump `@metamask/eth-json-rpc-infura` to `^10.2.0`
  - Bump `@metamask/eth-json-rpc-middleware` to `^17.0.1`

### Fixed

- Rather than throwing an error, NetworkController now corrects an invalid initial `selectedNetworkClientId` to point to the default RPC endpoint of the first network sorted by chain ID ([#5851](https://github.com/MetaMask/core/pull/5851))
- Fix the block tracker so that it will now reject if an error is thrown while making the request instead of hanging ([#5860](https://github.com/MetaMask/core/pull/5860))

## [23.5.0]

### Changed

- Remove obsolete `eth_getBlockByNumber` error handling for load balancer errors ([#5808](https://github.com/MetaMask/core/pull/5808))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

### Fixed

- Improved handling of HTTP status codes to prevent unnecessary circuit breaker triggers ([#5798](https://github.com/MetaMask/core/pull/5798), [#5809](https://github.com/MetaMask/core/pull/5809))
  - HTTP 4XX responses (e.g. rate limit errors) will no longer trigger the circuit breaker policy.

## [23.4.0]

### Added

- Add Monad Testnet as default network ([#5724](https://github.com/MetaMask/core/pull/5724))

### Changed

- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [23.3.0]

### Added

- Add optional `getBlockTrackerOptions` argument to NetworkController constructor ([#5702](https://github.com/MetaMask/core/pull/5702))
- Add optional `rpcFailoverEnabled` option to NetworkController constructor (`false` by default) ([#5668](https://github.com/MetaMask/core/pull/5668))
- Add `enableRpcFailover` and `disableRpcFailover` methods to NetworkController ([#5668](https://github.com/MetaMask/core/pull/5668))

### Changed

- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))
- Disable the RPC failover behavior by default ([#5668](https://github.com/MetaMask/core/pull/5668))
  - You are free to set the `failoverUrls` property on an RPC endpoint, but it won't have any effect
  - To enable this behavior, either pass `rpcFailoverEnabled: true` to the constructor or call `enableRpcFailover` after initialization

## [23.2.0]

### Added

- Add optional `additionalDefaultNetworks` option to `NetworkController` constructor ([#5527](https://github.com/MetaMask/core/pull/5527))
  - This can be used to customize which custom networks the default `networkConfigurationsByChainId` includes.
- Add `getSelectedChainId` method to `NetworkController` ([#5516](https://github.com/MetaMask/core/pull/5516))
  - This is also callable via the messenger.
- Add `DEPRECATED_NETWORKS` constant ([#5560](https://github.com/MetaMask/core/pull/5560))

### Changed

- Remove Goerli and Linea Goerli from set of default networks ([#5560](https://github.com/MetaMask/core/pull/5560))
  - Note that if you do not pass any initial state to NetworkController, this means that `0x5` and `0xe704` will no longer be keys in `networkConfigurationsByChainId`.
  - We are not counting this as a breaking change because we don't make any guarantees about what keys are present in `networkConfigurationsByChainId` at runtime — only that they must be valid chain IDs.
  - If you want more of a guarantee, you are recommended to persist the NetworkController state and then pass it back through as initial state.
- Update `RpcEndpoint` so that `failoverUrls` is optional ([#5561](https://github.com/MetaMask/core/pull/5561))
  - This property was introduced in 23.0.0 as a breaking change, but this change makes it non-breaking.
- Update `NetworkClientConfiguration` so that `failoverUrls` is optional ([#5561](https://github.com/MetaMask/core/pull/5561))
  - This property was introduced in 23.0.0 as a breaking change, but this change makes it non-breaking.
- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

### Fixed

- Upgrade `@metamask/eth-json-rpc-infura` to `^10.1.1` and `@metamask/eth-json-rpc-infura` to `^16.0.1` ([#5573](https://github.com/MetaMask/core/pull/5573))
  - This fixes a bug where non-standard unsuccessful JSON-RPC errors were being ignored/discarded

## [23.1.0]

### Added

- The `NetworkController:rpcEndpointDegraded` messenger event now has a new `chainId` property in its data, which is the ID of the chain that the endpoint represents ([#5517](https://github.com/MetaMask/core/pull/5517))

## [23.0.0]

### Added

- Implement circuit breaker pattern when retrying requests to Infura and custom RPC endpoints ([#5290](https://github.com/MetaMask/core/pull/5290))
  - If the network is perceived to be unavailable after 5 attempts, further retries will be paused for 30 seconds.
  - "Unavailable" means the following:
    - A failure to reach the network (exact error depending on platform / HTTP client)
    - The request responds with a non-JSON-parseable or non-JSON-RPC-compatible body
    - The request returns a non-200 response
- Use exponential backoff / jitter when retrying requests to Infura and custom RPC endpoints ([#5290](https://github.com/MetaMask/core/pull/5290))
  - As requests are retried, the delay between retries will increase exponentially (using random variance to prevent bursts).
- Add support for automatic failover when Infura is unavailable ([#5360](https://github.com/MetaMask/core/pull/5360))
  - An Infura RPC endpoint can now be configured with a list of failover URLs via `failoverUrls`.
  - If, after many attempts, an Infura network is perceived to be down, the list of failover URLs will be tried in turn.
- Add messenger action `NetworkController:rpcEndpointUnavailable` for responding to when a RPC endpoint becomes unavailable (see above) ([#5492](https://github.com/MetaMask/core/pull/5492), [#5501](https://github.com/MetaMask/core/pull/5501))
  - Also add associated type `NetworkControllerRpcEndpointUnavailableEvent`.
- Add messenger action `NetworkController:rpcEndpointDegraded` for responding to when a RPC endpoint becomes degraded ([#5492](https://github.com/MetaMask/core/pull/5492))
  - Also add associated type `NetworkControllerRpcEndpointDegradedEvent`.
- Add messenger action `NetworkController:rpcEndpointRequestRetried` for responding to when a RPC endpoint is retried following a retriable error ([#5492](https://github.com/MetaMask/core/pull/5492))
  - Also add associated type `NetworkControllerRpcEndpointRequestRetriedEvent`.
  - This is mainly useful for tests when mocking timers.
- Export `RpcServiceRequestable` type, which was previously named `AbstractRpcService` ([#5492](https://github.com/MetaMask/core/pull/5492))
- Export `isConnectionError` utility function ([#5501](https://github.com/MetaMask/core/pull/5501))

### Changed

- **BREAKING:** `NetworkController` constructor now takes a new required option, `getRpcServiceOptions` ([#5290](https://github.com/MetaMask/core/pull/5290), [#5492](https://github.com/MetaMask/core/pull/5492))
  - This can be used to customize how RPC services (which eventually hit RPC endpoints) are constructed.
  - For instance, you could set one `circuitBreakDuration` for one class of endpoints, and another `circuitBreakDuration` for another class.
  - At minimum you will need to pass `fetch` and `btoa`.
  - The `NetworkControllerOptions` also reflects this change.
- **BREAKING:** Add required property `failoverUrls` to `RpcEndpoint` ([#5360](https://github.com/MetaMask/core/pull/5360))
  - The `NetworkControllerState` and the `state` option to `NetworkController` also reflect this change.
- **BREAKING:** Add required property `failoverRpcUrls` to `NetworkClientConfiguration` ([#5360](https://github.com/MetaMask/core/pull/5360))
  - The `configuration` property in the `AutoManagedNetworkClient` and `NetworkClient` types also reflect this change.
- **BREAKING:** The `AbstractRpcService` type now has a non-optional `endpointUrl` property ([#5492](https://github.com/MetaMask/core/pull/5492))
  - The old version of `AbstractRpcService` is now called `RpcServiceRequestable`
- Synchronize retry logic and error handling behavior between Infura and custom RPC endpoints ([#5290](https://github.com/MetaMask/core/pull/5290))
  - A request to a custom endpoint that returns a 418 response will no longer return a JSON-RPC response with the error "Request is being rate limited".
  - A request to a custom endpoint that returns a 429 response now returns a JSON-RPC response with the error "Request is being rate limited".
  - A request to a custom endpoint that throws an "ECONNRESET" error will now be retried up to 5 times.
  - A request to a Infura endpoint that fails more than 5 times in a row will now respond with a JSON-RPC error that encompasses the failure instead of hiding it as "InfuraProvider - cannot complete request. All retries exhausted".
  - A request to a Infura endpoint that returns a non-retriable, non-2xx response will now respond with a JSON-RPC error that has the underling message "Non-200 status code: '\<code\>'" rather than including the raw response from the endpoint.
  - A request to a custom endpoint that fails with a retriable error more than 5 times in a row will now respond with a JSON-RPC error that encompasses the failure instead of returning an empty response.
  - A "retriable error" is now regarded as the following:
    - A failure to reach the network (exact error depending on platform / HTTP client)
    - The request responds with a non-JSON-parseable or non-JSON-RPC-compatible body
    - The request returns a 503 or 504 response
- Bump dependencies to support usage of RPC services internally for network requests ([#5290](https://github.com/MetaMask/core/pull/5290))
  - Bump `@metamask/eth-json-rpc-infura` to `^10.1.0`
  - Bump `@metamask/eth-json-rpc-middleware` to `^15.1.0`
- Bump `@metamask/controller-utils` to `^11.5.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- Bump `@metamask/utils` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

### Fixed

- Fix `findNetworkClientIdByChainId` to return the network client ID for the chain's configured default RPC endpoint instead of its first listed RPC endpoint ([#5344](https://github.com/MetaMask/core/pull/5344))

## [22.2.1]

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [22.2.0]

### Added

- Export `AbstractRpcService` type ([#5263](https://github.com/MetaMask/core/pull/5263))

### Changed

- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.1` ([#5079](https://github.com/MetaMask/core/pull/5079), [#5135](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/controller-utils` from `^11.4.4` to `^11.5.0` ([#5135](https://github.com/MetaMask/core/pull/5135), [#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/eth-json-rpc-provider` from `^4.1.6` to `^4.1.8` ([#5082](https://github.com/MetaMask/core/pull/5082), [#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/json-rpc-engine` from `^10.0.1` to `^10.0.3` ([#5082](https://github.com/MetaMask/core/pull/5082), [#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/rpc-errors` from `^7.0.1` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/utils` from `^10.0.0` to `^11.1.0` ([#5080](https://github.com/MetaMask/core/pull/5080), [#5223](https://github.com/MetaMask/core/pull/5223))

### Fixed

- Fix `lookupNetwork` so that it will no longer throw an error if `networkDidChange` subscriptions have been removed before it returns ([#5116](https://github.com/MetaMask/core/pull/5116))
  - This error could occur if the NetworkController's messenger is cleared of subscriptions, as in a "destroy" step.
- Fix race condition so that after adding a new RPC endpoint to a network, it is possible to access the new endpoint inside of a `stateChange` event listener via `getNetworkConfigurationByNetworkClientId` ([#5122](https://github.com/MetaMask/core/pull/5122))
- Fix `selectAvailableNetworkClientIds` so that it is properly memoized ([#5193](https://github.com/MetaMask/core/pull/5193))

## [22.1.1]

### Changed

- Bump `@metamask/eth-json-rpc-middleware` from `^15.0.0` to `^15.0.1` ([#5037](https://github.com/MetaMask/core/pull/5037))
- Bump `swappable-obj-proxy` from `^2.2.0` to `^2.3.0` ([#5036](https://github.com/MetaMask/core/pull/5036))
- Bump `@metamask/eth-block-tracker` from `^11.0.2` to `^11.0.3` ([#5025](https://github.com/MetaMask/core/pull/5025))

## [22.1.0]

### Added

- The `NetworkController:networkRemoved` messenger event will now be emitted when a network is removed ([#4698](https://github.com/MetaMask/core/pull/4698))
- Add messenger actions `NetworkController:addNetwork`, `NetworkController:removeNetwork`, and `NetworkController:updateNetwork` which call the respective controller methods ([#4698](https://github.com/MetaMask/core/pull/4698))
- Add `lastUpdatedAt` property to network configurations which will be set to the current time on addition or update ([#4652](https://github.com/MetaMask/core/pull/4652))
  - This was added to support the upcoming network syncing feature.
  - This property is optional and will be `undefined` for existing network configurations that have not yet been updated.

### Changed

- Add dependency `fast-deep-equal` ([#4652](https://github.com/MetaMask/core/pull/4652))
- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))

### Fixed

- Remove dependency on Node builtin module `util` to ensure that `@metamask/network-controller` can be used in a strict browser context ([#3672](https://github.com/MetaMask/core/pull/3672))
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@metamask/eth-block-tracker`
  - `@metamask/eth-json-rpc-infura`
  - `@metamask/eth-json-rpc-middleware`
  - `@metamask/eth-query`
  - `@metamask/swappable-obj-proxy`
  - `fast-deep-equal`

## [22.0.2]

### Changed

- `getDefaultNetworkConfigurationsByChainId` returns the updated display names for mainnet and linea. `Ethereum Mainnet` instead of `Mainnet`, and `Linea` instead of `Linea Mainnet`. ([#4865](https://github.com/MetaMask/core/pull/4865))
- Bump `@metamask/controller-utils` from `^11.4.2` to `^11.4.3` ([#4915](https://github.com/MetaMask/core/pull/4915))

## [22.0.1]

### Changed

- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/controller-utils` from `^11.4.0` to `^11.4.2` ([#4862](https://github.com/MetaMask/core/pull/4862), [#4870](https://github.com/MetaMask/core/pull/4870))
- Bump `@metamask/eth-json-rpc-provider` from `^4.1.5` to `^4.1.6` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/json-rpc-engine` from `^10.0.0` to `^10.0.1` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/rpc-errors` from `^7.0.0` to `^7.0.1` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [22.0.0]

### Changed

- Corrects the previous 21.1.0 release to document breaking changes that were missed:
  - **BREAKING:** Bump `@metamask/eth-block-tracker` from `^10.0.0` to `^11.0.2` ([#4769](https://github.com/MetaMask/core/pull/4769))
  - **BREAKING:** Bump `@metamask/eth-json-rpc-middleware` from `^13.0.0` to `^15.0.0` ([#4769](https://github.com/MetaMask/core/pull/4769))
  - **BREAKING:** Bump `@metamask/json-rpc-engine` from `^9.0.3` to `^10.0.0` ([#4769](https://github.com/MetaMask/core/pull/4769))
  - **BREAKING:** Bump `@metamask/rpc-errors` from `^6.3.1` to `^7.0.0` ([#4769](https://github.com/MetaMask/core/pull/4769))
  - **BREAKING:** Bump `@metamask/eth-json-rpc-infura` from `^9.1.0` to `^10.0.0` ([#4769](https://github.com/MetaMask/core/pull/4769))
  - Bump `@metamask/eth-json-rpc-provider` from `^4.1.4` to `^4.1.5` ([#4798](https://github.com/MetaMask/core/pull/4798))
    - This update was recorded in the v21.1.0 changelog, but is listed here again because that release has been deprecated.
- Bump `@metamask/controller-utils` from `^11.3.0` to `^11.4.0` ([#4834](https://github.com/MetaMask/core/pull/4834))

## [21.1.0] [DEPRECATED]

### Changed

- Bump `@metamask/eth-json-rpc-provider` from `^4.1.4` to `^4.1.5` ([#4798](https://github.com/MetaMask/core/pull/4798))

## [21.0.1]

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [21.0.0]

### Added

- **BREAKING:** Add `networkConfigurationsByChainId` to `NetworkState` (type: `Record<Hex, NetworkConfiguration>`) ([#4268](https://github.com/MetaMask/core/pull/4286))
  - This property replaces `networkConfigurations`, and, as its name implies, organizes network configurations by chain ID rather than network client ID.
  - If no initial state or this property is not included in initial state, the default value of this property will now include configurations for known Infura networks (Mainnet, Goerli, Sepolia, Linea Goerli, Linea Sepolia, and Linea Mainnet) by default.
- Add `getNetworkConfigurationByChainId` method, `NetworkController:getNetworkConfigurationByChainId` messenger action, and `NetworkControllerGetNetworkConfigurationByNetworkClientId` type ([#4268](https://github.com/MetaMask/core/pull/4286))
- Add `addNetwork`, which replaces one half of `upsertNetworkConfiguration` and can be used to add new network clients for a chain ([#4268](https://github.com/MetaMask/core/pull/4286))
  - It's worth noting that this method now publishes a `NetworkController:networkAdded` event instead of calling a `trackMetaMetricsEvent` callback. It is expected that you will subscribe to this event and create a MetaMetrics event yourself.
- Add `updateNetwork`, which replaces one half of `upsertNetworkConfiguration` and can be used to recreate the network clients for an existing chain based on an updated configuration ([#4268](https://github.com/MetaMask/core/pull/4286))
  - Note that it is not possible to remove the RPC endpoint from a network configuration that is currently represented by the globally selected network client. To prevent an error, you'll need to detect when such a removal is occurring and pass the `replacementSelectedRpcEndpointIndex` to `updateNetwork`. It will then switch to the designated RPC endpoint's network client on your behalf.
- Add `removeNetwork`, which replaces `removeNetworkConfiguration` and can be used to remove existing network clients for a chain ([#4268](https://github.com/MetaMask/core/pull/4286))
- Add `getDefaultNetworkControllerState` function, which replaces `defaultState` and matches patterns in other controllers ([#4268](https://github.com/MetaMask/core/pull/4286))
- Add `RpcEndpointType`, `AddNetworkFields`, and `UpdateNetworkFields` types ([#4268](https://github.com/MetaMask/core/pull/4286))
- Add `getNetworkConfigurations`, `getAvailableNetworkClientIds` and `selectAvailableNetworkClientIds` selectors ([#4268](https://github.com/MetaMask/core/pull/4286))
  - These new selectors can be applied to messenger event subscriptions

### Changed

- **BREAKING:** Replace `NetworkConfiguration` type with a new definition ([#4268](https://github.com/MetaMask/core/pull/4286))
  - A network configuration no longer represents a single RPC endpoint but rather a collection of RPC endpoints that can all be used to interface with a single chain.
  - The only property that has brought over to this type unchanged is `chainId`.
  - `ticker` has been renamed to `nativeCurrency`.
  - `nickname` has been renamed to `name`.
  - `rpcEndpoints` has been added. This is an an array of objects, where each object has properties `name` (optional), `networkClientId` (optional), `type`, and `url`.
  - `defaultRpcEndpointIndex` has been added. This must point to an entry in `rpcEndpoints`.
  - The block explorer URL is no longer located in `rpcPrefs` and is no longer restricted to one: `blockExplorerUrls` has been added along with a corresponding property `defaultBlockExplorerUrlIndex`, which must point to an entry in `blockExplorerUrls`.
  - `id` has been removed. Previously, this represented the ID of the network client associated with the network configuration. Since network clients are now created from RPC endpoints, the equivalent to this is the `networkClientId` property on an `RpcEndpoint`.
- **BREAKING:** The network controller messenger must now allow the action `NetworkController:getNetworkConfigurationByChainId` ([#4268](https://github.com/MetaMask/core/pull/4286))
- **BREAKING:** The network controller messenger must now allow the event `NetworkController:networkAdded` ([#4268](https://github.com/MetaMask/core/pull/4286))
- **BREAKING:** The `NetworkController` constructor will now throw if the initial state provided is invalid ([#4268](https://github.com/MetaMask/core/pull/4286))
  - `networkConfigurationsByChainId` cannot be empty.
  - The `chainId` of a network configuration in `networkConfigurationsByChainId` must match the chain ID it is filed under.
  - The `defaultRpcEndpointIndex` of a network configuration in `networkConfigurationsByChainId` must point to an entry in its `rpcEndpoints`.
  - The `defaultBlockExplorerUrlIndex` of a network configuration in `networkConfigurationsByChainId` must point to an entry in its `blockExplorerUrls`.
  - `selectedNetworkClientId` must match the `networkClientId` of an RPC endpoint in `networkConfigurationsByChainId`.
- **BREAKING:** Update `getNetworkConfigurationByNetworkClientId` so that when given an Infura network name (that is, a value from `InfuraNetworkType`), it will return a masked version of the RPC endpoint URL for the associated Infura network ([#4268](https://github.com/MetaMask/core/pull/4286))
  - If you want the unmasked version, you'll need the `url` property from the network _client_ configuration, which you can get by calling `getNetworkClientById` and then accessing the `configuration` property off of the network client.
- **BREAKING:** Update `loadBackup` to take and update `networkConfigurationsByChainId` instead of `networkConfigurations` ([#4268](https://github.com/MetaMask/core/pull/4286))
- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/eth-block-tracker` from `^9.0.3` to `^10.0.0` ([#4424](https://github.com/MetaMask/core/pull/4424))
- Bump `@metamask/eth-json-rpc-middleware` from `^12.1.1` to `^13.0.0` ([#4424](https://github.com/MetaMask/core/pull/4424))

### Removed

- **BREAKING:** Remove `networkConfigurations` from `NetworkState`, which has been replaced with `networkConfigurationsByChainId` ([#4268](https://github.com/MetaMask/core/pull/4286))
- **BREAKING:** Remove `upsertNetworkConfiguration` and `removeNetworkConfiguration`, which have been replaced with `addNetwork`, `updateNetwork`, and `removeNetwork` ([#4268](https://github.com/MetaMask/core/pull/4286))
- **BREAKING:** Remove `defaultState` variable, which has been replaced with a `getDefaultNetworkControllerState` function ([#4268](https://github.com/MetaMask/core/pull/4286))
- **BREAKING:** Remove `trackMetaMetricsEvent` option from the NetworkController constructor ([#4268](https://github.com/MetaMask/core/pull/4286))
  - Previously, this was used in `upsertNetworkConfiguration` to create a MetaMetrics event when a new network was added. This can now be achieved by subscribing to the `NetworkController:networkAdded` event and creating the event inside of the event handler.

## [20.2.0]

### Changed

- `upsertNetworkConfiguration` now accepts an optional id property on the NetworkConfiguration param. It allows a network configuration to have its rpcUrl updated in place when an id is specified, but only if that new rpcUrl does not already exist on a different network configuration. ([#4614](https://github.com/MetaMask/core/pull/4614))
- Bump `@metamask/eth-json-rpc-provider` to `^4.1.3` ([#4607](https://github.com/MetaMask/core/pull/4607))
- Update TypeScript to 5.2.2 ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- `removeNetworkConfiguration` now throws an error if you attempt to remove the selected network ([#4566](https://github.com/MetaMask/core/pull/4566))

## [20.1.0]

### Added

- Newly export the following types: `AutoManagedNetworkClient`, `InfuraNetworkClientConfiguration`, `CustomNetworkClientConfiguration` ([#3645](https://github.com/MetaMask/core/pull/3645))

### Changed

- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/eth-json-rpc-provider` from `^4.1.0` to `^4.1.2` ([#4519](https://github.com/MetaMask/core/pull/4519), [#4548](https://github.com/MetaMask/core/pull/4548))
- Bump `@metamask/json-rpc-engine` from `^9.0.0` to `^9.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/rpc-errors` from `^6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

## [20.0.0]

### Added

- Add a new `log` argument to the constructor ([#4440](https://github.com/MetaMask/core/pull/4440))
  - The new `log` argument must be a `Logger` object from the `loglevel` package and will be used to log a message when we fail to connect to a network or the network responds with an unknown error

### Changed

- **BREAKING:** Update `networksMetadata` state property so that the keys in the object will only ever be network client IDs and not RPC URLs ([#4254](https://github.com/MetaMask/core/pull/4254))
  - Some keys could have been RPC URLs if the initial network controller state had a `providerConfig` with an empty `id`, but since `providerConfig` is being removed, that won't happen anymore.
- Bump `@metamask/eth-block-tracker` to `^9.0.3` ([#4418](https://github.com/MetaMask/core/pull/4418))
- Bump `@metamask/eth-json-rpc-provider` to `^4.1.0` ([#4508](https://github.com/MetaMask/core/pull/4508))

### Removed

- **BREAKING:** Remove `providerConfig` property from state along with `ProviderConfig` type and `NetworkController:getProviderConfig` messenger action ([#4254](https://github.com/MetaMask/core/pull/4254))
  - The best way to obtain the equivalent configuration object, e.g. to access the chain ID of the currently selected network, is to get `selectedNetworkClientId` from state, pass this to the `NetworkController:getNetworkClientId` messenger action, and then use the `configuration` property on the network client.

## [19.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/eth-json-rpc-provider` to `^4.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [18.1.3]

### Changed

- Bump `async-mutex` to `^0.5.0` ([#4335](https://github.com/MetaMask/core/pull/4335))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

## [18.1.2]

### Fixed

- Update from `eth-block-tracker` to `@metamask/eth-block-tracker` `^9.0.2`, mitigating redundant polling loops ([#4309](https://github.com/MetaMask/core/pull/4309))

## [18.1.1]

### Added

- Export `BuiltInNetworkClientId` and `CustomNetworkClientId` ([#4247](https://github.com/MetaMask/core/pull/4247))

### Changed

- Bump `@metamask/eth-json-rpc-provider` to `^3.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/controller-utils` to `^9.1.0` ([#4153](https://github.com/MetaMask/core/pull/4153))

## [18.1.0]

### Added

- Add `getSelectedNetworkClient` method that returns the provider and blockTracker for the currently selected network but with a more easily used type than `getProviderAndBlockTracker` ([#4063](https://github.com/MetaMask/core/pull/4063))
- Add `NetworkController:getSelectedNetworkClient` action ([#4063](https://github.com/MetaMask/core/pull/4063))

### Changed

- `getProviderAndBlockTracker` is now marked as deprecated and will be removed in a future release. ([#4063](https://github.com/MetaMask/core/pull/4063))

## [18.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [18.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add network client for Linea Sepolia (chain ID `0xe705`) ([#3995](https://github.com/MetaMask/core/pull/3995))
  - Bump `@metamask/eth-json-rpc-infura` to `^9.1.0` to bring this change.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

### Fixed

- **BREAKING:** Narrow `NetworkControllerMessenger` type parameters `AllowedAction` and `AllowedEvent` from `string` to `never` ([#4031](https://github.com/MetaMask/core/pull/4031))
  - Allowlisting or using any external actions or events will now produce a type error.

## [17.2.1]

### Changed

- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/eth-json-rpc-middleware` to `^12.1.0` ([#3829](https://github.com/MetaMask/core/pull/3829))
- Bump `@metamask/json-rpc-engine` to `^7.3.3` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3970](https://github.com/MetaMask/core/pull/3970), [#3954](https://github.com/MetaMask/core/pull/3954))

## [17.2.0]

### Changed

- The `setActiveNetwork` method and action now supports built-in network types ([#3764](https://github.com/MetaMask/core/pull/3764))
  - Previously this would only accept a network configuration ID. Now it will accept the type of a built-in network as well, using it like an ID. This lets you switch to a built-in or custom network with a single method/action.
- Deprecate the `setProviderType` method and action ([#3764](https://github.com/MetaMask/core/pull/3764))
  - Use `setActiveNetwork` instead
- Bump `@metamask/swappable-obj-proxy` to `^2.2.0` ([#3784](https://github.com/MetaMask/core/pull/3784))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/eth-json-rpc-provider` to `^2.3.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/json-rpc-engine` to `^7.3.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [17.1.0]

### Added

- Add `getNetworkConfigurationByNetworkClientId` method which can be used to retrieve details for both custom and built-in networks (using the network configuration object shape) ([#2055](https://github.com/MetaMask/core/pull/2055))
- Add `NetworkController:getNetworkConfigurationByNetworkClientId` messenger action for the previous method ([#2055](https://github.com/MetaMask/core/pull/2055))

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))
- Bump `@metamask/eth-json-rpc-provider` to `^2.3.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/json-rpc-engine` to `^7.3.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Create new network clients before updating `networkConfigurations` state ([#3679](https://github.com/MetaMask/core/pull/3679))
  - This primarily affects subscribers to the `NetworkController:stateChange` event. It's now safe to use a network client for any network that appears in the `networkConfigurations` state, whereas previously it was possible that synchronous attempts to access a network client in response to this event would fail.
- Add `NetworkState` payload to `NetworkController:networkWillChange` and `NetworkController:networkDidChange` ([#3598](https://github.com/MetaMask/core/pull/3598))
  - Both of these events now include `NetworkState` as the first and only item in the payload

## [17.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [16.0.0]

### Changed

- **BREAKING:** Bump dependency `@metamask/eth-query` from ^3.0.1 to ^4.0.0 ([#2028](https://github.com/MetaMask/core/pull/2028))
  - This is breaking because it changes the type of the EthQuery instance this controller creates internally and exports under the `getEthQuery` action. Please consult the [changelog for `@metamask/eth-query` 4.0.0](https://github.com/MetaMask/eth-query/blob/main/CHANGELOG.md#400) for more.

## [15.2.0]

### Changed

- Update @metamask/eth-json-rpc-middleware in network controller ([#1988](https://github.com/MetaMask/core/pull/1988))
- Bump dependency on `@metamask/json-rpc-engine` to ^7.2.0 ([#1895](https://github.com/MetaMask/core/pull/1895))
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [15.1.0]

### Added

- Add new action handlers and associated types ([#1806](https://github.com/MetaMask/core/pull/1806))
  - `NetworkController:setActiveNetwork` / `NetworkControllerSetActiveNetworkAction`
  - `NetworkController:setProviderType` / `NetworkControllerSetProviderTypeAction`
  - `NetworkController:findNetworkClientByChainId` / `NetworkControllerFindNetworkClientIdByChainIdAction`
- Add `ticker` to `NetworkClientConfiguration` ([#1794](https://github.com/MetaMask/core/pull/1794))

### Changed

- Bump dependency on `@metamask/eth-json-rpc-provider` to ^2.2.0 ([#1738](https://github.com/MetaMask/core/pull/1738))

## [15.0.0]

### Changed

- **BREAKING:** Bump dependency on `@metamask/eth-json-rpc-infura` to ^9.0.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- **BREAKING:** Bump dependency on `@metamask/eth-json-rpc-middleware` to ^12.0.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- **BREAKING:** Move from `json-rpc-engine` ^7.1.1 to `@metamask/json-rpc-engine` ^8.0.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- **BREAKING:** Bump dependency on `eth-block-tracker` to ^8.0.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- Bump dependency on `@metamask/eth-json-rpc-provider` to ^2.1.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- Move from `eth-rpc-errors` ^4.0.2 to `@metamask/rpc-errors` ^6.1.0 ([#1653](https://github.com/MetaMask/core/pull/1653))

## [14.0.0]

### Added

- Add `NetworkController:getEIP1559Compatibility` controller action ([#1673](https://github.com/MetaMask/core/pull/1673))

### Changed

- **BREAKING:** Rename `get1555CompatibilityWithNetworkClientId` to `get1559CompatibilityWithNetworkClientId` ([#1673](https://github.com/MetaMask/core/pull/1673))
- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2

### Fixed

- Update linea goerli explorer url ([#1666](https://github.com/MetaMask/core/pull/1666))

## [13.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [13.0.0]

### Changed

- **BREAKING**: Remove `NetworkId` type ([#1633](https://github.com/MetaMask/core/pull/1633))
- **BREAKING**: Remove `networkId` property from `NetworkState` type ([#1633](https://github.com/MetaMask/core/pull/1633))
- Update scaffold RPC middleware for built-in Infura networks to no longer resolve `net_version` locally ([#1633](https://github.com/MetaMask/core/pull/1633))
- Stop making `net_version` request to determine network status ([#1633](https://github.com/MetaMask/core/pull/1633))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0

## [12.2.0]

### Added

- Add `NetworkController:getNetworkClientById` action ([#1638](https://github.com/MetaMask/core/pull/1638))
- Add `lookupNetworkByClientId` and `get1555CompatibilityWithNetworkClientId` methods ([#1557](https://github.com/MetaMask/core/pull/1557))

### Changed

- Add optional `networkClientId` argument to methods `lookupNetwork` and `getEIP1559Compatibility` ([#1557](https://github.com/MetaMask/core/pull/1557))

## [12.1.2]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2

## [12.1.1]

### Added

- Added an export for NetworkClientId in NetworkController ([#1583](https://github.com/MetaMask/core/pull/1583))

## [12.1.0]

### Added

- Add `getNetworkClientById` ([#1562](https://github.com/MetaMask/core/pull/1562))
- Add `findNetworkClientIdByChainId` ([#1571](https://github.com/MetaMask/core/pull/1571))

## [12.0.0]

### Added

- Add `NetworksMetadata` type ([#1559](https://github.com/MetaMask/core/pull/1559))

### Changed

- **BREAKING:** Remove `NetworkDetails` type in favor of `NetworkMetadata` ([#1559](https://github.com/MetaMask/core/pull/1559))
  - This new type includes `NetworkDetails` plus a `status` property
- **BREAKING:** Add `networksMetadata` to state ([#1559](https://github.com/MetaMask/core/pull/1559))
  - Consumers will need to add a migration. The data for this property can be constructed by looping over the values in `InfuraNetworkType` from `@metamask/controller-utils` plus the network configuration IDs in the state property `networkConfigurations` and setting each value to `{ status: "unknown", EIPS: {} }`.
- **BREAKING:** Add `selectedNetworkClientId` to state ([#1548](https://github.com/MetaMask/core/pull/1548))
  - Consumers will need to add a migration. This property should be set to either `providerConfig.type` or `providerConfig.id`.
- Update `getEIP1559Compatibility` to return `undefined` when the latest block is unavailable ([#1457](https://github.com/MetaMask/core/pull/1457))
- Replace `eth-query` ^2.1.2 with `@metamask/eth-query` ^3.0.1 ([#1546](https://github.com/MetaMask/core/pull/1546))

### Removed

- **BREAKING:** Remove `networkDetails` from state ([#1559](https://github.com/MetaMask/core/pull/1559))
  - The data in this state property has been merged into the new `networksMetadata` state property; each value in this object contains an `EIPS` property.

## [11.0.0]

### Changed

- **BREAKING**: Require `ticker` to be included in the `providerConfig` state ([#1495](https://github.com/MetaMask/core/pull/1495))
  - This requires a state migration, setting `providerConfig.ticker` to `ETH` if it's missing.
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Bump @metamask/eth-json-rpc-infura from 8.1.0 to 8.1.1 ([#1517](https://github.com/MetaMask/core/pull/1517))
- Remove unnecessary `babel-runtime` dependency ([#1504](https://github.com/MetaMask/core/pull/1504))

## [10.3.1]

### Changed

- Bump `@metamask/eth-json-rpc-infura` dependency from ^8.0.0 to ^8.1.0
  - This extends the types that this package recognizes to include Linea networks

## [10.3.0]

### Added

- Add `getNetworkClientsById` method ([#1439](https://github.com/MetaMask/core/pull/1439))
  - This method returns a registry of available built-in and custom networks, allowing consumers to access multiple networks simultaneously if desired

### Changed

- Network clients are retained and will no longer be destroyed or recreated whenever the network is initialized or switched ([#1439](https://github.com/MetaMask/core/pull/1439))
  - This means that cached responses for a network will no longer disappear when a different network is selected
- Update `upsertNetworkConfiguration` to keep the network client registry up to date with changes to the set of network configurations ([#1439](https://github.com/MetaMask/core/pull/1439))
  - If a new network configuration is added, the information in it will be used to create and register a new network client
  - If an existing network configuration is updated, its information will be used to recreate the client for the corresponding network

## [10.2.0]

### Added

- Expose `BlockTracker` type ([#1443](https://github.com/MetaMask/core/pull/1443))

## [10.1.0]

### Added

- Add `loadBackup` method to NetworkController ([#1421](https://github.com/MetaMask/core/pull/1421))

## [10.0.0]

### Changed

- **BREAKING:** Update `getEIP1559Compatibility` to return `false` instead of `true` if the provider has not been initialized yet ([#1404](https://github.com/MetaMask/core/pull/1404))
- Update `getEIP1559Compatibility` to not hit the current network if it is known that it does not support EIP-1559 ([#1404](https://github.com/MetaMask/core/pull/1404))
- Update `networkDetails` initial state from `{ EIPS: { 1559: false } }` to `{ EIPS: {} }` ([#1404](https://github.com/MetaMask/core/pull/1404))
- Update lookupNetwork to unset `networkDetails.EIPS[1559]` in state instead of setting it `false` if either of its requests for the network ID or network details fails ([#1403](https://github.com/MetaMask/core/pull/1403))

## [9.0.0]

### Added

- The events `networkWillChange` and `networkDidChange` are emitted during `setProviderType`, `setActiveNetwork`, `resetConnection`, and `rollbackToPreviousProvider` ([#1336](https://github.com/MetaMask/core/pull/1336))
  - The `networkWillChange` event is emitted before the network is switched (before the network status is cleared),
  - The `networkDidChange` event is emitted after the new provider is setup (but before it has finished initializing).
- Add `destroy` method ([#1330](https://github.com/MetaMask/core/pull/1330))
- Add events `infuraIsBlocked` and `infuraIsUnblocked` ([#1264](https://github.com/MetaMask/core/pull/1264))
- Add `NetworkController:getState` action constant ([#1329](https://github.com/MetaMask/core/pull/1329))

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** The `providerConfig` type and state property have changed. The `chainId` property is now `Hex` rather than a decimal `string` ([#1367](https://github.com/MetaMask/core/pull/1367))
  - This requires a state migration
  - This affects the return value of the `NetworkController:getProviderConfig` and `NetworkController:getState` actions.
- **BREAKING:** The `NetworkConfiguration` type and the `networkConfigurations` state property have changed. The `chainId` property on each configuration is now `Hex` rather than a decimal `string`. ([#1367](https://github.com/MetaMask/core/pull/1367))
  - This requires a state migration
  - This change affects the `upsertNetworkConfiguration` method, which takes a network configuration as the first parameter
  - This affects the return value of the `NetworkController:getState` action
- Allow overlapping `lookupNetwork` calls ([#1375](https://github.com/MetaMask/core/pull/1375))
  - `lookupNetwork` no longer uses a mutex, meaning that a lookup can be initiated before the previous one has finished. This allows for faster network switching
  - When there is an overlap in `lookupNetwork` calls, the older one is aborted before events are emitted and before state changes
- **BREAKING:** Change `networkDetails` format ([#1326](https://github.com/MetaMask/core/pull/1326))
  - Previously `networkDetails` was `{ isEIP1559Compatible: boolean }`, now it is `{ EIPS: { [eipNumber: number]: boolean } }`
- **BREAKING:** Update NetworkController to use a simpler middleware stack derived from pieces of `eth-json-rpc-middleware` instead of `web3-provider-engine` ([#1116](https://github.com/MetaMask/core/pull/1116))
  - A call to `eth_chainId` on a custom network will now return the `chainId` in the provider config rather than the chain ID returned by the network.
  - A call to `eth_chainId` on a built-in Infura network will now return a hard-coded chain ID rather than the chain ID returned by the network.
  - A call to `net_version` on a built-in Infura network will now return a hard-coded network ID rather than the network ID returned by the network.
  - Previously, RPC requests with an object as the first parameter (e.g. `eth_call`) were "sanitized" (i.e. unknown properties were removed from this first parameter, and any hex strings were normalized). This no longer happens. Instead these requests will pass through to the network unchanged.
  - A call to `eth_getBalance`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getTransactionCount`, or `eth_call` will now be intercepted such that a block tag parameter of `"latest"` will be replaced with the latest known block number before being passed to the network.
    - This substitution makes it more likely that we can return a cached response to the request.
  - Previously, a `eth_getTransactionCount` request with a block tag of `"pending"` would be intercepted and given a result from our nonce cache (if the cache was populated for the given address). This nonce cache was updated upon each call to `eth_sendRawTransaction` based on the nonce of the transaction being sent. The whole nonce cache was also cleared upon a call to `evm_revert`. This no longer happens, and these RPC methods will be passed to the network unchanged.
    - If you were using this to get a suggested next nonce, you can instead use the `nonceTracker` that `@metamask/transaction-controller` exposes
  - A call to `web3_clientVersion` is no longer intercepted to return a static result of `"ProviderEngine/v<version>/javascript"`
  - A call to `net_listening` is no longer intercepted to return a static result of `true`
  - A call to `eth_hashrate` is no longer intercepted to return a static result of `"0x00"`
  - A call to `eth_mining` is no longer intercepted to return a static result of `false`
  - Previously, `eth_subscribe` and `eth_unsubscribe` would never hit the network; instead, the behavior was polyfilled by polling the network for new blocks. Additionally, the `newPendingTransactions` parameter for `eth_subscribe` was unsupported. This polyfill is no longer present, and `eth_subscribe` and `eth_unsubscribe` are passed through to the network unchanged.
    - Consumers wishing to recreate the prior behavior and use the block tracker to power subscriptions may employ the middleware provided by the `eth-json-rpc-filters` package.
  - Previously, `eth_newFilter`, `eth_newBlockFilter`, `eth_newPendingTransactionFilter`, `eth_uninstallFilter`, `eth_getFilterChanges`, and `eth_getFilterLogs` would never hit the network; instead, the behavior was polyfilled by polling the network for new blocks and recording updates for registered filters. This polyfill is no longer present, and these RPC methods are passed through to the network unchanged.
    - Consumers wishing to recreate the prior behavior and use the block tracker to power filters may employ the middleware provided by the `eth-json-rpc-filters` package.
  - Interfacing with a network that exposes a websocket is no longer supported.
- **BREAKING:** The methods `initializeProvider`, `setActiveNetwork`, and `resetConnection` will now throw if the provider config is of type `rpc` but is missing an RPC URL or a chain ID. ([#1316](https://github.com/MetaMask/core/pull/1316))
  - Previously the chain ID was not required to setup the provider.
  - Previously if the RPC URL was omitted, no error would be thrown but the provider would not be setup.
- **BREAKING:** The method `setProviderType` will now throw when passed the type `rpc`. ([#1316](https://github.com/MetaMask/core/pull/1316))
  - Previously no error would be thrown but the provider would not be setup.
- **BREAKING**: Update type of `blockTracker` property exposed by `getProviderAndBlockTracker` from `any` to `SwappableProxy<PollingBlockTracker>` ([#1303](https://github.com/MetaMask/core/pull/1303))
- **BREAKING:** Rename provider configuration property `rpcTarget` to `rpcUrl` ([#1292](https://github.com/MetaMask/core/pull/1292))
- **BREAKING:** The network status will now be "blocked" rather than "unavailable" when the user is blocked by Infura ([#1264](https://github.com/MetaMask/core/pull/1264))
- **BREAKING:** The `infuraProjectId` constructor parameter is now required ([#1276](https://github.com/MetaMask/core/pull/1276))
- **BREAKING:** The exported `Provider` type has been updated to better reflect the provider type returned by the network controller ([#1266](https://github.com/MetaMask/core/pull/1266))
  - Previously this was set to `any`. Now it returns a type that _mostly_ matches the provider returned (some semi-internal properties are omitted)
  - This affects the exported `ProviderProxy` type as well, which wraps the `Provider` type
- Support hex and number `net_version` responses ([#1380](https://github.com/MetaMask/core/pull/1380))
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))
- Bump dependency `eth-json-rpc-infura` (now `@metamask/eth-json-rpc-infura`) from ^7.0.0 to ^8.0.0. ([#1116](https://github.com/MetaMask/core/pull/1116))
- Add dependency `eth-json-rpc-middleware` ^11.0.0 ([#1116](https://github.com/MetaMask/core/pull/1116))
- Add dependency `eth-json-rpc-provider` ^1.0.0 ([#1116](https://github.com/MetaMask/core/pull/1116))
- Add dependency `eth-block-tracker` ^7.0.0 ([#1116](https://github.com/MetaMask/core/pull/1116))
- Add dependency `json-rpc-engine` ^6.1.0 ([#1116](https://github.com/MetaMask/core/pull/1116))

### Removed

- **BREAKING:** Remove `providerConfigChange` event ([#1329](https://github.com/MetaMask/core/pull/1329))
  - Consumers are encouraged to subscribe to `NetworkController:stateChange` with a selector function that returns `providerConfig` if they want to perform an action when `providerConfig` changes.
- **BREAKING:** The built-in "localhost" network has been removed ([#1313](https://github.com/MetaMask/core/pull/1313))

### Fixed

- Update network details in `lookupNetwork` even when network ID is unchanged ([#1379](https://github.com/MetaMask/core/pull/1379))
- Fix error when `rollbackToPreviousProvider` is called when the previous network is a custom network with a missing or invalid `id` ([#1223](https://github.com/MetaMask/core/pull/1223))
  - In that situation, `rollbackToPreviousProvider` used to throw an error. Now it correctly rolls back instead.

## [8.0.0]

### Added

- Implement `resetConnection` method ([#1131](https://github.com/MetaMask/core/pull/1131), [#1235](https://github.com/MetaMask/core/pull/1235), [#1239](https://github.com/MetaMask/core/pull/1239))

### Changed

- Update EIP-1559 compatibility during network lookup ([#1236](https://github.com/MetaMask/core/pull/1236))
  - EIP-1559 compatibility check is still performed on initialization and after switching networks, like before. This change only impacts direct calls to `lookupNetwork`.
  - `lookupNetwork` is now making two network calls instead of one, ensuring that the `networkDetails` state is up-to-date.
- **BREAKING:** Replace `network` state with `networkId` and `networkStatus` ([#1196](https://github.com/MetaMask/core/pull/1196))
  - If you were using `network` to access the network ID, use `networkId` instead. It will be set to `null` rather than `loading` if the network is not currently available.
  - If you were using `network` to see if the network was currently available, use `networkStatus` instead. It will be set to `NetworkStatus.Available` if the network is available.
  - When the network is unavailable, we now have two different states to represent that: `unknown` and `unavailable`. `unavailable` means that the network was detected as not available, whereas `unknown` is used for unknown errors and cases where the network status is yet to be determined (e.g. before initialization, or while the network is loading).
- Use JavaScript private fields rather than `private` TypeScript keyword for internal methods/fields ([#1189](https://github.com/MetaMask/core/pull/1189))
- Export `BlockTrackerProxy` type ([#1147](https://github.com/MetaMask/core/pull/1147))
  - This is the type of the block tracker returned from the `getProviderAndBlockTracker` method
- **BREAKING:** Async refactor
  - Make `rollbackToPreviousProvider` async ([#1237](https://github.com/MetaMask/core/pull/1237))
  - Make `upsertNetworkConfiguration` async ([#1192](https://github.com/MetaMask/core/pull/1192))
  - Make `setActiveNetwork` async ([#1190](https://github.com/MetaMask/core/pull/1190))
  - Make `setProviderType` async ([#1191](https://github.com/MetaMask/core/pull/1191))
  - Make `refreshNetwork` async ([#1182](https://github.com/MetaMask/core/pull/1182))
  - Make `initializeProvider` async ([#1180](https://github.com/MetaMask/core/pull/1180))
  - Make `verifyNetwork` async ([#1181](https://github.com/MetaMask/core/pull/1181))
- Dependency updates
  - deps: bump web3-provider-engine@16.0.3->16.0.5 ([#1212](https://github.com/MetaMask/core/pull/1212))
  - deps: eth-rpc-errors@4.0.0->4.0.2 ([#1215](https://github.com/MetaMask/core/pull/1215))
  - deps: bump @metamask/utils to 5.0.1 ([#1211](https://github.com/MetaMask/core/pull/1211))

### Removed

- **BREAKING:** Remove `isCustomNetwork` state ([#1199](https://github.com/MetaMask/core/pull/1199))
  - The `providerConfig.type` state will be set to `'rpc'` if the current network is a custom network. Replace all references to the `isCustomNetwork` state by checking the provider config state instead.

## [7.0.0]

### Changed

- **BREAKING:** Replace `providerConfig` setter with a public `initializeProvider` method ([#1133](https://github.com/MetaMask/core/pull/1133))
  - The property `providerConfig` should no longer be set to initialize the provider. That property no longer exists.
  - The method `initializeProvider` must be called instead to initialize the provider after constructing the network controller.

## [6.0.0]

### Added

- Add rollbackToPreviousProvider method ([#1132](https://github.com/MetaMask/core/pull/1132))

### Changed

- **BREAKING:** Migrate network configurations from `PreferencesController` to `NetworkController` ([#1064](https://github.com/MetaMask/core/pull/1064))
  - Consumers will need to adapt to reading network data from `NetworkConfigurations` state on `NetworkController` rather than `frequentRpcList` on `PreferencesController`.
  - `setRpcTarget` becomes `setActiveNetwork` on `NetworkController` and accepts a `networkConfigurationId` argument rather than an `rpcUrl`.
  - `addToFrequentRpcList` on `PreferencesController` becomes `upsertNetworkConfiguration` on `NetworkController`.
  - `removeFromFrequentRpcList` on `PreferencesController` becomes `removeNetworkConfiguration` on `NetworkController`
  - The `NetworkController` requires a `trackMetaMetricsEvent` callback function argument in its constructor.
- **BREAKING:** Expose `getProviderAndBlockTracker` instead of `provider` ([#1091](https://github.com/MetaMask/core/pull/1091))
  - This change is breaking because it removes the provider property from `NetworkController`. Instead, a new method `getProviderAndBlockTracker` method is available for accessing the current provider object.

## [5.0.0]

### Changed

- **BREAKING:** Rename `properties` property in state object to `networkDetails` ([#1074](https://github.com/MetaMask/controllers/pull/1074))

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [4.0.0]

### Changed

- **BREAKING:** Update type of state object by renaming `properties` property to `networkDetails` ([#1074](https://github.com/MetaMask/core/pull/1074))
  - Consumers are recommended to add a state migration for this change.
- **BREAKING:** Rename `NetworkProperties` type to `NetworkDetails` ([#1074](https://github.com/MetaMask/core/pull/1074))
- Change `getEIP1559Compatibility` to use async await syntax ([#1084](https://github.com/MetaMask/core/pull/1084))

## [3.0.0]

### Added

- Add support for Sepolia as a built-in Infura network ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Export types for network controller events and actions ([#1039](https://github.com/MetaMask/core/pull/1039))

### Changed

- **BREAKING:** Make `lookupNetwork` block on completing the lookup ([#1063](https://github.com/MetaMask/controllers/pull/1063))
  - This function was always `async`, but it would return before completing any async work. Now it will not return until after the network lookup has been completed.
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

### Removed

- **BREAKING:**: Drop support for Ropsten, Rinkeby, and Kovan as built-in Infura networks ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [2.0.0]

### Changed

- **BREAKING:** Update type of state object by renaming `provider` property to `providerConfig` ([#995](https://github.com/MetaMask/core/pull/995))
  - Consumers are recommended to add a state migration for this change.
- **BREAKING:** Rename `NetworkController:providerChange` messenger event to `NetworkController:providerConfigChange` ([#995](https://github.com/MetaMask/core/pull/995))
- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/network` (minus `NetworkType` and `NetworksChainId`, which were placed in `@metamask/controller-utils`)

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-controller@24.0.1...HEAD
[24.0.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@24.0.0...@metamask/network-controller@24.0.1
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.6.0...@metamask/network-controller@24.0.0
[23.6.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.5.1...@metamask/network-controller@23.6.0
[23.5.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.5.0...@metamask/network-controller@23.5.1
[23.5.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.4.0...@metamask/network-controller@23.5.0
[23.4.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.3.0...@metamask/network-controller@23.4.0
[23.3.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.2.0...@metamask/network-controller@23.3.0
[23.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.1.0...@metamask/network-controller@23.2.0
[23.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@23.0.0...@metamask/network-controller@23.1.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@22.2.1...@metamask/network-controller@23.0.0
[22.2.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@22.2.0...@metamask/network-controller@22.2.1
[22.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@22.1.1...@metamask/network-controller@22.2.0
[22.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@22.1.0...@metamask/network-controller@22.1.1
[22.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@22.0.2...@metamask/network-controller@22.1.0
[22.0.2]: https://github.com/MetaMask/core/compare/@metamask/network-controller@22.0.1...@metamask/network-controller@22.0.2
[22.0.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@22.0.0...@metamask/network-controller@22.0.1
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@21.1.0...@metamask/network-controller@22.0.0
[21.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@21.0.1...@metamask/network-controller@21.1.0
[21.0.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@21.0.0...@metamask/network-controller@21.0.1
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@20.2.0...@metamask/network-controller@21.0.0
[20.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@20.1.0...@metamask/network-controller@20.2.0
[20.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@20.0.0...@metamask/network-controller@20.1.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@19.0.0...@metamask/network-controller@20.0.0
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@18.1.3...@metamask/network-controller@19.0.0
[18.1.3]: https://github.com/MetaMask/core/compare/@metamask/network-controller@18.1.2...@metamask/network-controller@18.1.3
[18.1.2]: https://github.com/MetaMask/core/compare/@metamask/network-controller@18.1.1...@metamask/network-controller@18.1.2
[18.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@18.1.0...@metamask/network-controller@18.1.1
[18.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@18.0.1...@metamask/network-controller@18.1.0
[18.0.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@18.0.0...@metamask/network-controller@18.0.1
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@17.2.1...@metamask/network-controller@18.0.0
[17.2.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@17.2.0...@metamask/network-controller@17.2.1
[17.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@17.1.0...@metamask/network-controller@17.2.0
[17.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@17.0.0...@metamask/network-controller@17.1.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@16.0.0...@metamask/network-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@15.2.0...@metamask/network-controller@16.0.0
[15.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@15.1.0...@metamask/network-controller@15.2.0
[15.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@15.0.0...@metamask/network-controller@15.1.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@14.0.0...@metamask/network-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@13.0.1...@metamask/network-controller@14.0.0
[13.0.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@13.0.0...@metamask/network-controller@13.0.1
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@12.2.0...@metamask/network-controller@13.0.0
[12.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@12.1.2...@metamask/network-controller@12.2.0
[12.1.2]: https://github.com/MetaMask/core/compare/@metamask/network-controller@12.1.1...@metamask/network-controller@12.1.2
[12.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@12.1.0...@metamask/network-controller@12.1.1
[12.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@12.0.0...@metamask/network-controller@12.1.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@11.0.0...@metamask/network-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@10.3.1...@metamask/network-controller@11.0.0
[10.3.1]: https://github.com/MetaMask/core/compare/@metamask/network-controller@10.3.0...@metamask/network-controller@10.3.1
[10.3.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@10.2.0...@metamask/network-controller@10.3.0
[10.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@10.1.0...@metamask/network-controller@10.2.0
[10.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@10.0.0...@metamask/network-controller@10.1.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@9.0.0...@metamask/network-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@8.0.0...@metamask/network-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@7.0.0...@metamask/network-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@6.0.0...@metamask/network-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@5.0.0...@metamask/network-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@4.0.0...@metamask/network-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@3.0.0...@metamask/network-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@2.0.0...@metamask/network-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@1.0.0...@metamask/network-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-controller@1.0.0
