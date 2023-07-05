# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-controller@10.3.0...HEAD
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
