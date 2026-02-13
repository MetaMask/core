# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `useExternalService` option to `TokenDetector`, `TokenDetectionOptions`, `RpcDataSourceConfig`, and `RpcDataSourceOptions`. Token detection runs only when both `tokenDetectionEnabled` and `useExternalService` are true and stops when either is false ([#7924](https://github.com/MetaMask/core/pull/7924))
- Add basic functionality toggle: `isBasicFunctionality` (getter `() => boolean`); no value is stored in the controller. When the getter returns true (matches UI "Basic functionality" ON), token and price APIs are used; when false, only RPC is used. Optional `subscribeToBasicFunctionalityChange(onChange)` lets the consumer register for toggle changes (e.g. extension subscribes to PreferencesController:stateChange, mobile uses its own mechanism); may return an unsubscribe function for controller destroy ([#7904](https://github.com/MetaMask/core/pull/7904))

### Changed

- **BREAKING:** Rename state and `DataResponse` property from `assetsMetadata` to `assetsInfo`. Update consumers that read `state.assetsMetadata` or set `response.assetsMetadata` to use `assetsInfo` instead ([#7902](https://github.com/MetaMask/core/pull/7902))
- Hide native tokens on Tempo networks (testnet and mainnet) in `getAssets` method ([#7882](https://github.com/MetaMask/core/pull/7882))
- Bump `@metamask/keyring-api` from `^21.0.0` to `^21.5.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/keyring-internal-api` from `^9.0.0` to `^10.0.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/keyring-snap-client` from `^8.0.0` to `^8.2.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/account-tree-controller` from `4.1.0` to `4.1.1` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/core-backend` from `5.1.0` to `5.1.1` ([#7897](https://github.com/MetaMask/core/pull/7897))

## [1.0.0]

### Added

- Add balance selectors `getAggregatedBalanceForAccount`, `getGroupIdForAccount`, and `getInternalAccountsForGroup` with types `AggregatedBalanceEntry`, `AggregatedBalanceForAccount`, `EnabledNetworkMap`, and `AccountsById` for aggregated portfolio balance (optionally by account group), fiat total, and portfolio-weighted 1d price change ([#7864](https://github.com/MetaMask/core/pull/7864))

### Changed

- **BREAKING:** Require `previousChains` in `handleActiveChainsUpdate(dataSourceId, activeChains, previousChains)` and in the `onActiveChainsUpdated` callback used by data sources; the third parameter is no longer optional. Callers and data sources must pass the previous chain list for correct added/removed chain diff computation ([#7867](https://github.com/MetaMask/core/pull/7867))
- Bump `@metamask/account-tree-controller` from `^4.0.0` to `^4.1.0` ([#7869](https://github.com/MetaMask/core/pull/7869))

### Removed

- **BREAKING:** Remove `initDataSources` and related exports (`InitDataSourcesOptions`, `DataSources`, `DataSourceActions`, `DataSourceEvents`, `DataSourceAllowedActions`, `DataSourceAllowedEvents`, `RootMessenger`). Initialize assets by creating `AssetsController` with `queryApiClient`; the controller instantiates all data sources internally ([#7859](https://github.com/MetaMask/core/pull/7859))

## [0.2.0]

### Added

- Add `assetPreferences` state and `AssetPreferences` type for per-asset UI preferences (e.g. `hidden`), separate from `assetsMetadata` ([#7777](https://github.com/MetaMask/core/pull/7777))
- Add `hideAsset(assetId)`, `unhideAsset(assetId)` for managing hidden assets globally; hidden assets are excluded from `getAssets` but balance updates continue to be tracked ([#7777](https://github.com/MetaMask/core/pull/7777))

### Changed

- Narrow `AssetsControllerState` types from `Json` to semantic types: `assetsMetadata` → `AssetMetadata`, `assetsBalance` → `AssetBalance`, `assetsPrice` → `AssetPrice`, `assetPreferences` → `AssetPreferences`, `customAssets` → `Caip19AssetId[]` ([#7777](https://github.com/MetaMask/core/pull/7777))

- Replace `viem` dependency with `@ethersproject/abi` for ABI encoding/decoding in `MulticallClient` ([#7839](https://github.com/MetaMask/core/pull/7839))

## [0.1.0]

### Added

- Add `isEnabled` option to `AssetsController`, `initMessengers`, and `initDataSources` to conditionally skip initialization when disabled and avoid duplicated requests ([#7831](https://github.com/MetaMask/core/pull/7831))
- Complete rewrite of AssetsController with middleware architecture for unified asset management across all blockchain networks (EVM and non-EVM) ([#7685](https://github.com/MetaMask/core/pull/7685))
- Initial release ([#7587](https://github.com/MetaMask/core/pull/7587))
- Add `MulticallClient` for batching RPC calls using Multicall3 contract ([#7677](https://github.com/MetaMask/core/pull/7677))
- Add batch utilities (`divideIntoBatches`, `reduceInBatchesSerially`) for processing arrays in batches ([#7677](https://github.com/MetaMask/core/pull/7677))
- Add `TokenDetector` service for detecting ERC-20 tokens with non-zero balances on a chain ([#7683](https://github.com/MetaMask/core/pull/7683))
- Add `BalanceFetcher` service for fetching token balances for user's imported/detected tokens ([#7684](https://github.com/MetaMask/core/pull/7684))
- Add configurable polling intervals for `RpcDataSource` via `RpcDataSourceConfig` in `initDataSources` ([#7709](https://github.com/MetaMask/core/pull/7709))
- Add comprehensive unit tests for data sources (`AccountsApiDataSource`, `BackendWebsocketDataSource`, `PriceDataSource`, `TokenDataSource`, `SnapDataSource`), `DetectionMiddleware`, and `AssetsController` ([#7714](https://github.com/MetaMask/core/pull/7714))

### Changed

- Bump `@metamask/core-backend` from `^5.0.0` to `^5.1.0` ([#7817](https://github.com/MetaMask/core/pull/7817))
- Convert asset balances to human-readable format using token decimals across all data sources (`RpcDataSource`, `AccountsApiDataSource`, `BackendWebsocketDataSource`) ([#7752](https://github.com/MetaMask/core/pull/7752))
- Store native token metadata (type, symbol, name, decimals) in `assetsMetadata` derived from `NetworkController` chain status ([#7752](https://github.com/MetaMask/core/pull/7752))
- `AccountsApiDataSource` now includes `assetsMetadata` in response with token info from V5 API ([#7752](https://github.com/MetaMask/core/pull/7752))
- Bump `@metamask/keyring-controller` from `^25.0.0` to `^25.1.0` ([#7713](https://github.com/MetaMask/core/pull/7713))
- Refactor `RpcDataSource` to delegate polling to `BalanceFetcher` and `TokenDetector` services ([#7709](https://github.com/MetaMask/core/pull/7709))
- Refactor `BalanceFetcher` and `TokenDetector` to extend `StaticIntervalPollingControllerOnly` for independent polling management ([#7709](https://github.com/MetaMask/core/pull/7709))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@0.2.0...@metamask/assets-controller@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@0.1.0...@metamask/assets-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/assets-controller@0.1.0
