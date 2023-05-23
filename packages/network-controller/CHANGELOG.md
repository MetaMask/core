# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [9.0.0]
### Uncategorized
- Update network details even when ID matches ([#1379](https://github.com/MetaMask/core/pull/1379))
- Support hex and number `net_version` responses ([#1380](https://github.com/MetaMask/core/pull/1380))
- Update chain ID format ([#1367](https://github.com/MetaMask/core/pull/1367))
- lookupNetwork: Drop mutex; bail on network change ([#1375](https://github.com/MetaMask/core/pull/1375))
- Consolidate state changes in lookupNetwork ([#1356](https://github.com/MetaMask/core/pull/1356))
- Replace `NetworksChainId` constant with `ChainId` ([#1354](https://github.com/MetaMask/core/pull/1354))
- Use `toBeFulfilled` matcher for more tests ([#1347](https://github.com/MetaMask/core/pull/1347))
- Add network change events ([#1336](https://github.com/MetaMask/core/pull/1336))
- Improve `buildProviderConfig` helper function ([#1346](https://github.com/MetaMask/core/pull/1346))
- Refactor refresh network tests ([#1335](https://github.com/MetaMask/core/pull/1335))
- Refactor test helper `operation` property name ([#1345](https://github.com/MetaMask/core/pull/1345))
- Refactor `waitForPublishedEvents` helper function ([#1343](https://github.com/MetaMask/core/pull/1343))
- Refactor `lookupNetwork` test cases ([#1318](https://github.com/MetaMask/core/pull/1318))
- Refactor `lookupNetworkTests` helper function ([#1334](https://github.com/MetaMask/core/pull/1334))
- Move lookup network tests to helper function ([#1320](https://github.com/MetaMask/core/pull/1320))
- NetworkController: Match `rollbackToPreviousProvider` to extension ([#1223](https://github.com/MetaMask/core/pull/1223))
- NetworkController: Remove providerConfigChange event ([#1329](https://github.com/MetaMask/core/pull/1329))
- Add `destroy` method ([#1330](https://github.com/MetaMask/core/pull/1330))
- Widen format of networkDetails ([#1326](https://github.com/MetaMask/core/pull/1326))
- Refactor `lookupNetwork` tests ([#1319](https://github.com/MetaMask/core/pull/1319))
- Refactor `waitForStateChanges` test helper ([#1322](https://github.com/MetaMask/core/pull/1322))
- Add `describe` block per network client type ([#1321](https://github.com/MetaMask/core/pull/1321))
- NetworkController: Use the same middleware stack as the extension ([#1116](https://github.com/MetaMask/core/pull/1116))
- Simplify the `setFakeProvider` test helper ([#1317](https://github.com/MetaMask/core/pull/1317))
- Add validation when setting up custom provider ([#1316](https://github.com/MetaMask/core/pull/1316))
- Remove built-in localhost network ([#1313](https://github.com/MetaMask/core/pull/1313))
- Add comments to network client test functions ([#1310](https://github.com/MetaMask/core/pull/1310))
- Use package import over relative import in test ([#1311](https://github.com/MetaMask/core/pull/1311))
- NetworkController: Fix chain IDs in tests ([#1307](https://github.com/MetaMask/core/pull/1307))
- NetworkController: Normalize INFURA_NETWORKS array ([#1306](https://github.com/MetaMask/core/pull/1306))
- Refine NetworkController BlockTracker type ([#1303](https://github.com/MetaMask/core/pull/1303))
- Improve types used for network client test helpers ([#1305](https://github.com/MetaMask/core/pull/1305))
- Remove unnecessary mock from provider API test helper ([#1304](https://github.com/MetaMask/core/pull/1304))
- Remove unused network client configuration ([#1299](https://github.com/MetaMask/core/pull/1299))
- Remove warning in NetworkController unit tests ([#1300](https://github.com/MetaMask/core/pull/1300))
- Remove unnecessary ESLint ignore comments ([#1302](https://github.com/MetaMask/core/pull/1302))
- Add beforeCompleting option to FakeProviderStub ([#1301](https://github.com/MetaMask/core/pull/1301))
- Rename `rpcTarget` to `rpcUrl` ([#1292](https://github.com/MetaMask/core/pull/1292))
- Simplify network controller unit test setup ([#1290](https://github.com/MetaMask/core/pull/1290))
- Remove redundant test suite ([#1291](https://github.com/MetaMask/core/pull/1291))
- Extract network client construction from NetworkController ([#1285](https://github.com/MetaMask/core/pull/1285))
- Fix GasFeeController to assign `ethQuery` initially ([#1284](https://github.com/MetaMask/core/pull/1284))
- Add handling of Infura "blocked" status ([#1264](https://github.com/MetaMask/core/pull/1264))
- Correctly lint test helpers ([#1281](https://github.com/MetaMask/core/pull/1281))
- Refactor `lookupNetwork` unit tests ([#1265](https://github.com/MetaMask/core/pull/1265))
- Require Infura project ID ([#1276](https://github.com/MetaMask/core/pull/1276))
- Add eth-query types ([#1266](https://github.com/MetaMask/core/pull/1266))
- BREAKING: Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-controller@9.0.0...HEAD
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@8.0.0...@metamask/network-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@7.0.0...@metamask/network-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@6.0.0...@metamask/network-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@5.0.0...@metamask/network-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@4.0.0...@metamask/network-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@3.0.0...@metamask/network-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@2.0.0...@metamask/network-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-controller@1.0.0...@metamask/network-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-controller@1.0.0
