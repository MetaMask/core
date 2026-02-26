# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))

### Added

- Add `PendingTokenMetadata` type and optional `pendingMetadata` parameter to `addCustomAsset(accountId, assetId, pendingMetadata?)`. When provided (e.g. from the extension's pending-tokens flow), token metadata is written to `assetsInfo` immediately so the UI can render the token without waiting for the pipeline ([#8021](https://github.com/MetaMask/core/pull/8021))
- Add `currentCurrency` state (ISO 4217 code, default `'usd'`) and `setCurrentCurrency(currentCurrency)` to `AssetsController`. Changing the currency updates state and triggers a one-off price refetch so displayed prices use the new currency ([#7991](https://github.com/MetaMask/core/pull/7991))
- Add support for forcibly updating prices ([#7991](https://github.com/MetaMask/core/pull/7991))
- Add parallel middlewares in `ParallelMiddleware.ts`: `createParallelBalanceMiddleware` runs balance data sources (Accounts API, Snap, RPC) in parallel with chain partitioning and a fallback round for failed chains; `createParallelMiddleware` runs TokenDataSource and PriceDataSource in parallel (same request, merged response). Both use `mergeDataResponses` and limited concurrency via `p-limit` ([#7950](https://github.com/MetaMask/core/pull/7950))
- Add `@metamask/client-controller` dependency and subscribe to `ClientController:stateChange`. Asset tracking runs only when the UI is open (ClientController) and the keyring is unlocked (KeyringController), and stops when either the UI closes or the keyring locks (Client + Keyring lifecycle) ([#7950](https://github.com/MetaMask/core/pull/7950))
- Add full and merge update modes: `DataResponse.updateMode` and type `AssetsUpdateMode` (`'full'` | `'merge'`). Fetch uses `'full'` (response is authoritative for scope; custom assets not in response are preserved). Subscriptions could use `'merge'` or `'full'` depending on data sources. Default is `'merge'` when omitted ([#7950](https://github.com/MetaMask/core/pull/7950))

### Changed

- Bump `@metamask/transaction-controller` from `^62.17.1` to `^62.19.0` ([#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031))
- Bump `@metamask/assets-controllers` from `^100.0.1` to `^100.0.2` ([#8004](https://github.com/MetaMask/core/pull/8004))
- Bump `@metamask/assets-controllers` from `^100.0.2` to `^100.0.3` ([#8029](https://github.com/MetaMask/core/pull/8029))

### Fixed

- Avoid unnecessary price and token API requests when data sources report balance-only updates. The controller now forwards the optional `request` from the subscribe callback into `handleAssetsUpdate`; when a data source calls `onAssetsUpdate(response, request)` with `request.dataTypes: ['balance']` (e.g. RpcDataSource balance polling, StakedBalanceDataSource), the controller skips Token and Price enrichment so the price API is not called. Previously every update triggered enrichment and could reset or overwrite existing state ([#8043](https://github.com/MetaMask/core/pull/8043))
- Default `assetsBalance` to `0` for native tokens of each account's supported chains using `NetworkEnablementController.nativeAssetIdentifiers`, so native entries are always present in state even before data sources respond ([#8036](https://github.com/MetaMask/core/pull/8036))
- Auto-select `'merge'` update mode in `getAssets` when `chainIds` is a subset of enabled chains, preventing partial-chain fetches (e.g. after a swap, adding a custom asset, or data-source chain changes) from wiping balances of other chains ([#8036](https://github.com/MetaMask/core/pull/8036))
- Convert WebSocket balance updates in `BackendWebsocketDataSource` from raw smallest-units to human-readable amounts using asset decimals (same behavior as RPC/Accounts API), so `assetsBalance` remains consistent across data sources ([#8032](https://github.com/MetaMask/core/pull/8032))
- Include all assets from balance and each account's custom assets from state in `detectedAssets`, so prices and metadata are fetched for existing assets and custom tokens (previously only assets without metadata were included, so existing assets did not get prices) ([#8021](https://github.com/MetaMask/core/pull/8021))
- Request `includeAggregators: true` when fetching token metadata from the v3 assets API so aggregator data is returned and stored in `assetsInfo` ([#8021](https://github.com/MetaMask/core/pull/8021))

## [2.0.2]

### Changed

- Bump `@metamask/assets-controllers` from `^100.0.0` to `^100.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/network-enablement-controller` from `^4.1.1` to `^4.1.2` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/polling-controller` from `^16.0.2` to `^16.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/transaction-controller` from `^62.17.0` to `^62.17.1` ([#7996](https://github.com/MetaMask/core/pull/7996))

## [2.0.1]

### Changed

- Refactor data source tests to use shared `MockAssetControllerMessenger` fixture ([#7958](https://github.com/MetaMask/core/pull/7958))
  - Export `STAKING_INTERFACE` from the staked balance fetcher for use with the staking contract ABI.
  - `StakedBalanceDataSource` teardown now uses the messenger's `clearEventSubscriptions`; custom messenger implementations must support it for correct cleanup.
- Bump `@metamask/network-enablement-controller` from `^4.1.0` to `^4.1.1` ([#7984](https://github.com/MetaMask/core/pull/7984))
- Bump `@metamask/core-backend` from `^5.1.1` to `^6.0.0` ([#7993](https://github.com/MetaMask/core/pull/7993))
- Bump `@metamask/assets-controllers` from `^99.4.0` to `^100.0.0` ([#7995](https://github.com/MetaMask/core/pull/7995))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [2.0.0]

### Added

- Add `StakedBalanceDataSource` that polls supported staking contracts on enabled chains and merges staked balances into `assetsBalance`. Configurable via `stakedBalanceDataSourceConfig` (`enabled`, `pollInterval`); the controller subscribes to it when enabled and cleans up on destroy ([#7936](https://github.com/MetaMask/core/pull/7936))
- Add optional `trackMetaMetricsEvent` callback to measure and report first init/fetch historical time (duration in ms) to MetaMetrics when the initial asset fetch completes after unlock or app open ([#7871](https://github.com/MetaMask/core/pull/7871))
- Add `AccountsApiDataSourceConfig` and `PriceDataSourceConfig` types; add `accountsApiDataSourceConfig` and `priceDataSourceConfig` options to `AssetsControllerOptions` for per-data-source configuration (pollInterval, tokenDetectionEnabled, etc.). When `tokenDetectionEnabled` is false, `AccountsApiDataSource` only returns balances for tokens already in state and does not add new tokens ([#7926](https://github.com/MetaMask/core/pull/7926))
- Add `useExternalService` option to `TokenDetector`, `TokenDetectionOptions`, `RpcDataSourceConfig`, and `RpcDataSourceOptions`. Token detection runs only when both `tokenDetectionEnabled` and `useExternalService` are true and stops when either is false ([#7924](https://github.com/MetaMask/core/pull/7924))
- Add basic functionality toggle: `isBasicFunctionality` (getter `() => boolean`); no value is stored in the controller. When the getter returns true (matches UI "Basic functionality" ON), token and price APIs are used; when false, only RPC is used. Optional `subscribeToBasicFunctionalityChange(onChange)` lets the consumer register for toggle changes (e.g. extension subscribes to PreferencesController:stateChange, mobile uses its own mechanism); may return an unsubscribe function for controller destroy ([#7904](https://github.com/MetaMask/core/pull/7904))

### Changed

- Refactor `AssetsControllerMessenger` type safety: remove `as unknown as` casts, import types instead of locally defining them, and add missing allowed actions/events ([#7952](https://github.com/MetaMask/core/pull/7952))
- **BREAKING:** `AccountsApiDataSourceConfig.tokenDetectionEnabled` is now a getter `() => boolean` (was `boolean`) so the Accounts API data source reacts when the user toggles token detection at runtime, consistent with `RpcDataSourceConfig.tokenDetectionEnabled`. Pass a function, e.g. `tokenDetectionEnabled: () => preferenceController.state.useTokenDetection`.
- **BREAKING:** Rename state and `DataResponse` property from `assetsMetadata` to `assetsInfo`. Update consumers that read `state.assetsMetadata` or set `response.assetsMetadata` to use `assetsInfo` instead ([#7902](https://github.com/MetaMask/core/pull/7902))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.1.0...HEAD
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.0.2...@metamask/assets-controller@2.1.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.0.1...@metamask/assets-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.0.0...@metamask/assets-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@1.0.0...@metamask/assets-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@0.2.0...@metamask/assets-controller@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@0.1.0...@metamask/assets-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/assets-controller@0.1.0
