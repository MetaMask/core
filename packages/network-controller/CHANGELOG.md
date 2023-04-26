# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [8.0.0]
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
- Implement `resetConnection` method ([#1131](https://github.com/MetaMask/core/pull/1131), [#1235](https://github.com/MetaMask/core/pull/1235), [#1239](https://github.com/MetaMask/core/pull/1239))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-controller@8.0.0...HEAD
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@7.0.0...@metamask/network-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@6.0.0...@metamask/network-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@5.0.0...@metamask/network-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@4.0.0...@metamask/network-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@3.0.0...@metamask/network-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@2.0.0...@metamask/network-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@1.0.0...@metamask/network-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-controller@1.0.0
