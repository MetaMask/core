# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Use Oxfmt for import sorting instead of `import-x/order` ([#8438](https://github.com/MetaMask/core/pull/8438))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- Release/904.0.0 ([#8406](https://github.com/MetaMask/core/pull/8406))
- Revert "Update Release 905.0.0 (#8399) and release 904.0.0 (#8397)" ([#8399](https://github.com/MetaMask/core/pull/8399))
- Release/904.0.0 ([#8397](https://github.com/MetaMask/core/pull/8397))
- fix(assets-controller): hardened error handling ([#8389](https://github.com/MetaMask/core/pull/8389))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))
- Release/883.0.0 ([#8298](https://github.com/MetaMask/core/pull/8298))
- chore: simplify auto-generated file header comment ([#8279](https://github.com/MetaMask/core/pull/8279))
- Release/878.0.0 ([#8276](https://github.com/MetaMask/core/pull/8276))
- Release/842.0.0 ([#8083](https://github.com/MetaMask/core/pull/8083))
- Release/836.0.0 ([#8046](https://github.com/MetaMask/core/pull/8046))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: Update `generate-method-action-types` script to be used in a single package ([#7983](https://github.com/MetaMask/core/pull/7983))
- Release/815.0.0 ([#7953](https://github.com/MetaMask/core/pull/7953))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- Release/800.0.0 ([#7874](https://github.com/MetaMask/core/pull/7874))
- Release/789.0.0 ([#7848](https://github.com/MetaMask/core/pull/7848))
- Release/786.0.0 ([#7833](https://github.com/MetaMask/core/pull/7833))
- fix(AssetController): refactor Snap data source ([#7764](https://github.com/MetaMask/core/pull/7764))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- fix(AssetController): switch price from Controller to state ([#7744](https://github.com/MetaMask/core/pull/7744))
- fix(AssetController): get relevant metadata ([#7735](https://github.com/MetaMask/core/pull/7735))

### Changed

- Bump `@metamask/transaction-controller` from `^64.0.0` to `^64.2.0` ([#8432](https://github.com/MetaMask/core/pull/8432), [#8447](https://github.com/MetaMask/core/pull/8447))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

### Fixed

- `AssetsController` no longer silently skips asset fetching on startup for returning users ([#8412](https://github.com/MetaMask/core/pull/8412))
  - Previously, `#start()` was called at keyring unlock before `AccountTreeController.init()` had built the account tree, causing `#selectedAccounts` to return an empty array and all subscriptions and fetches to be skipped. `selectedAccountGroupChange` does not fire when the persisted selected group is unchanged, leaving the controller idle.
  - Now subscribes to `AccountTreeController:stateChange` (the base-controller event guaranteed to fire when `init()` calls `this.update()`), so the controller re-evaluates its active state once accounts are available.
  - `#start()` is now idempotent: it returns early when accounts or chains are not yet available, and when subscriptions are already active, preventing duplicate fetches from repeated events.

## [5.0.0]

### Changed

- **BREAKING:** `TokenDetector` now fetches the token list directly from the Tokens API (`/v3/chains/{chain}/assets`) via a new `TokensApiClient` instead of reading from `TokenListController:getState` ([#8385](https://github.com/MetaMask/core/pull/8385))
  - `TokenDetectorMessenger` type has been removed; `TokenDetector` constructor now takes a `TokensApiClient` instance as its second argument
  - `RpcDataSource` no longer requires `TokenListController:getState` — `GetTokenListState` has been removed from `RpcDataSourceAllowedActions` and `AssetsControllerAllowedActions`
  - Unknown ERC-20 metadata is no longer looked up from the token list as a fallback in `RpcDataSource`; `TokenDataSource` handles enrichment downstream
- Split `getAssets` fetch pipeline into a fast awaited path and a parallel fire-and-forget background path to reduce perceived latency on unlock and onboarding ([#8383](https://github.com/MetaMask/core/pull/8383))
  - Fast pipeline: AccountsApi + StakedBalance → Detection → Token + Price (awaited, committed to state immediately)
  - Background pipeline: Snap + RPC run in parallel → Detection → Token + Price when basic functionality is enabled; when disabled (RPC-only mode), Token + Price are omitted (fire-and-forget merge)
  - `handleAssetsUpdate` skips token/price enrichment and strips `metadata` / `price` from the effective request when basic functionality is disabled (RPC-only mode)
  - `setSelectedCurrency` no longer triggers a price refresh via `getAssets` when basic functionality is disabled
- `PriceDataSource` now batches spot-price API requests in chunks of 50 using `reduceInBatchesSerially` to avoid DynamoDB batch-limit errors ([#8383](https://github.com/MetaMask/core/pull/8383))
- `TokenDataSource` now batches token metadata API requests in chunks of 50 using `reduceInBatchesSerially` to avoid DynamoDB batch-limit errors ([#8383](https://github.com/MetaMask/core/pull/8383))
- `PriceDataSource` filters out all synthetic `slip44:NUMBER-*` staking-position asset IDs before calling the Price API ([#8383](https://github.com/MetaMask/core/pull/8383))
- `TokenDataSource` filters EVM ERC-20 tokens by `occurrences >= 3` and treats missing occurrences as 0 ([#8383](https://github.com/MetaMask/core/pull/8383))
- Bump `@metamask/keyring-controller` from `^25.1.1` to `^25.2.0` ([#8363](https://github.com/MetaMask/core/pull/8363))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))

## [4.0.0]

### Changed

- **BREAKING:** `TokenDataSource` constructor now takes `(messenger, options)` instead of `(options)`; `messenger` must be the same `AssetsControllerMessenger` used by `AssetsController` so token metadata enrichment can call `PhishingController:bulkScanTokens` ([#8329](https://github.com/MetaMask/core/pull/8329))
  - Clients must now provide `PhishingController:bulkScanTokens` permission when constructing the controller messenger
- `TokenDataSource` removes tokens flagged malicious by Blockaid (via `PhishingController:bulkScanTokens`) before merging metadata, instead of filtering non-native tokens by a minimum occurrence count ([#8329](https://github.com/MetaMask/core/pull/8329))
- Bump `@metamask/assets-controllers` from `^103.1.0` to `^103.1.1` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/network-enablement-controller` from `^5.0.1` to `^5.0.2` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/phishing-controller` from `^17.1.0` to `^17.1.1` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/transaction-controller` from `^63.3.1` to `^64.0.0` ([#8359](https://github.com/MetaMask/core/pull/8359))

## [3.3.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Hide native tokens on Tempo networks (testnet and mainnet) in `getAssets` method ([#7882](https://github.com/MetaMask/core/pull/7882))
- Bump `@metamask/assets-controllers` from `^103.0.0` to `^103.1.0` ([#8355](https://github.com/MetaMask/core/pull/8355))

## [3.2.1]

### Changed

- Bump `@metamask/snaps-controllers` from `^17.2.0` to `^19.0.0` ([#8319](https://github.com/MetaMask/core/pull/8319))
- Bump `@metamask/snaps-utils` from `^11.7.0` to `^12.1.2` ([#8319](https://github.com/MetaMask/core/pull/8319))
- Bump `@metamask/account-tree-controller` from `^6.0.0` to `^7.0.0` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/assets-controllers` from `^102.0.0` to `^103.0.0` ([#8325](https://github.com/MetaMask/core/pull/8325))

## [3.2.0]

### Added

- Add Sentry traces for Assets Health dashboard ([#8310](https://github.com/MetaMask/core/pull/8310))
  - `AssetsDataSourceTiming` — per-source latency for each middleware in the fetch pipeline
  - `AssetsDataSourceError` — tracks middleware failures with source names and error counts
  - `AssetsFullFetch` — end-to-end fetch timing with asset/price/chain/account counts
  - `AssetsUpdatePipeline` — enrichment pipeline timing for pushed data source updates
  - `AssetsSubscriptionError` — subscription failure tracking per data source
  - `AssetsStateSize` — entry counts for balances, metadata, prices, custom assets, unique assets, and network count (once on app start)
  - `AggregatedBalanceSelector` — balance selector computation time with asset/network/account counts
  - Add optional `trace` parameter to `getAggregatedBalanceForAccount` selector

### Changed

- Bump `@metamask/account-tree-controller` from `^5.0.1` to `^6.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/assets-controllers` from `^101.0.1` to `^102.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/client-controller` from `^1.0.0` to `^1.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/core-backend` from `^6.2.0` to `^6.2.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/keyring-controller` from `^25.1.0` to `^25.1.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/network-controller` from `^30.0.0` to `^30.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/network-enablement-controller` from `^5.0.0` to `^5.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/permission-controller` from `^12.2.1` to `^12.3.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/polling-controller` from `^16.0.3` to `^16.0.4` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/preferences-controller` from `^23.0.0` to `^23.1.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/transaction-controller` from `^63.1.0` to `^63.3.1` ([#8301](https://github.com/MetaMask/core/pull/8301), [#8313](https://github.com/MetaMask/core/pull/8313), [#8317](https://github.com/MetaMask/core/pull/8317))

## [3.1.1]

### Fixed

- Refactored `BalanceFetcher` and `RpcDataSource` to ensure the correct `assetId` is used for EVM native assets that are not ETH ([#8284](https://github.com/MetaMask/core/pull/8284))

## [3.1.0]

### Changed

- EVM RPC balance pipeline (`RpcDataSource`, `BalanceFetcher`, `TokenDetector`) no longer falls back to 18 decimals for ERC-20 when decimals are unknown; human-readable balances and `detectedBalances` entries are omitted until decimals are available from state, token list metadata, or on-chain `decimals()` (native token handling unchanged) ([#8267](https://github.com/MetaMask/core/pull/8267))
- Bump `@metamask/keyring-api` from `^21.5.0` to `^21.6.0` ([#8259](https://github.com/MetaMask/core/pull/8259))
- Bump `@metamask/transaction-controller` from `^63.0.0` to `^63.1.0` ([#8272](https://github.com/MetaMask/core/pull/8272))

### Fixed

- fix: move `selectedAccountGroup` to top-level persisted state ([#8245](https://github.com/MetaMask/core/pull/8245))

## [3.0.0]

### Added

- Per-data-source latency inside parallel middlewares: `durationByDataSource` now includes entries such as `ParallelMiddleware.TokenDataSource`, `ParallelMiddleware.PriceDataSource`, and `ParallelBalanceMiddleware.<SourceName>` (ms), so traces can see which internal sources contributed to `ParallelMiddleware` and `ParallelBalanceMiddleware` timings. ([#8147](https://github.com/MetaMask/core/pull/8147))

### Changed

- **BREAKING:** First-init-fetch measurement moved from MetaMetrics to Sentry. Option `trackMetaMetricsEvent` is replaced by `trace: TraceCallback`. Type `AssetsControllerFirstInitFetchMetaMetricsPayload` is removed; trace request data is not typed in this package. ([#8147](https://github.com/MetaMask/core/pull/8147))
- `TokenDataSource` now always includes native token asset IDs (from `NetworkEnablementController.nativeAssetIdentifiers`) in metadata fetch calls, ensuring native tokens always have up-to-date metadata ([#8227](https://github.com/MetaMask/core/pull/8227))
- `TokenDataSource` now filters out non-native tokens with fewer than 3 occurrences from metadata responses, and also removes their balances and detected asset entries, to prevent spam tokens from being stored in state ([#8227](https://github.com/MetaMask/core/pull/8227))
- `TokenDataSource` now requests `includeOccurrences` when fetching v3 asset metadata ([#8227](https://github.com/MetaMask/core/pull/8227))
- Bump `@metamask/assets-controllers` from `^101.0.0` to `^101.0.1` ([#8232](https://github.com/MetaMask/core/pull/8232))
- Bump `@metamask/core-backend` from `^6.1.1` to `^6.2.0` ([#8232](https://github.com/MetaMask/core/pull/8232))

## [2.4.0]

### Changed

- Bump `@metamask/network-enablement-controller` from `^4.2.0` to `^5.0.0` ([#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/permission-controller` from `^12.2.0` to `^12.2.1` ([#8225](https://github.com/MetaMask/core/pull/8225))
- `BridgeExchangeRatesFormat` type now uses canonical `@metamask/assets-controllers` state types instead of locally-defined bridge rate entry types ([#8175](https://github.com/MetaMask/core/pull/8175))
- Bump `@metamask/account-tree-controller` from `^5.0.0` to `^5.0.1` ([#8162](https://github.com/MetaMask/core/pull/8162))
- Bump `@metamask/assets-controllers` from `^100.2.0` to `^101.0.0` ([#8162](https://github.com/MetaMask/core/pull/8162), [#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/core-backend` from `^6.1.0` to `^6.1.1` ([#8162](https://github.com/MetaMask/core/pull/8162))
- Bump `@metamask/transaction-controller` from `^62.21.0` to `^63.0.0` ([#8217](https://github.com/MetaMask/core/pull/8217), [#8225](https://github.com/MetaMask/core/pull/8225))

### Fixed

- Preserve custom asset metadata (symbol, name, decimals, image) in `AssetsController` when the API returns an empty response for an unknown token, preventing incorrect balance calculations and display for user-deployed tokens added via `wallet_watchAsset` ([#8202](https://github.com/MetaMask/core/pull/8202))
- Include custom asset token addresses in `RpcDataSource` balance fetches so that on-chain balances are retrieved immediately after token import via `addCustomAsset` ([#8202](https://github.com/MetaMask/core/pull/8202))

## [2.3.0]

### Added

- `usdPrice` is not included in asset price data ([#8123](https://github.com/MetaMask/core/pull/8123))
- Add `getStateForTransactionPay()` method and `AssetsController:getStateForTransactionPay` messenger action. Returns state in the legacy format expected by transaction-pay-controller (TokenBalancesController, AccountTrackerController, TokensController, TokenRatesController, CurrencyRateController shapes) so that when `useAssetsController` is true the transaction-pay-controller can use a single action instead of five separate getState calls. Also export `formatStateForTransactionPay` and types `TransactionPayLegacyFormat`, `AccountForLegacyFormat`, `LegacyToken` from utils ([#8094](https://github.com/MetaMask/core/pull/8094))

### Changed

- Bump `@metamask/assets-controllers` from `^100.0.3` to `^100.2.0` ([#8107](https://github.com/MetaMask/core/pull/8107)), ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/network-enablement-controller` from `^4.1.2` to `^4.2.0` ([#8107](https://github.com/MetaMask/core/pull/8107))
- Bump `@metamask/transaction-controller` from `^62.19.0` to `^62.21.0` ([#8104](https://github.com/MetaMask/core/pull/8104)), ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/account-tree-controller` from `^4.1.1` to `^5.0.0` ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/core-backend` from `^6.0.0` to `^6.1.0` ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/preferences-controller` from `^22.1.0` to `^23.0.0` ([#8140](https://github.com/MetaMask/core/pull/8140))

### Fixed

- `formatExchangeRatesForBridge` and `formatStateForTransactionPay` now read both `price` (selected currency) and `usdPrice` (USD) directly from asset price data ([#8123](https://github.com/MetaMask/core/pull/8123))

## [2.2.0]

### Added

- Add `getExchangeRatesForBridge()` method and `AssetsController:getExchangeRatesForBridge` messenger action. Returns bridge-compatible exchange rate state (`conversionRates`, `currencyRates`, `marketData`, `currentCurrency`) derived from `assetsPrice` and `selectedCurrency`, for use when the bridge uses AssetsController for rates ([#8076](https://github.com/MetaMask/core/pull/8076))

### Changed

- `getExchangeRatesForBridge()` / `formatExchangeRatesForBridge` return value: `conversionRates` now includes only non-EVM assets (EVM rates remain in `currencyRates` and `marketData`); the `currency` field in conversionRates entries is resolved from `selectedCurrency` via the same CAIP currency map as MultichainAssetsRatesController (no longer hardcoded); EVM entries in `marketData` now include full price/market data (e.g. `id`, `marketCap`, `allTimeHigh`) in addition to bridge fields ([#8076](https://github.com/MetaMask/core/pull/8076))

## [2.1.0]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@5.0.0...HEAD
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@4.0.0...@metamask/assets-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@3.3.0...@metamask/assets-controller@4.0.0
[3.3.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@3.2.1...@metamask/assets-controller@3.3.0
[3.2.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@3.2.0...@metamask/assets-controller@3.2.1
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@3.1.1...@metamask/assets-controller@3.2.0
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@3.1.0...@metamask/assets-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@3.0.0...@metamask/assets-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.4.0...@metamask/assets-controller@3.0.0
[2.4.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.3.0...@metamask/assets-controller@2.4.0
[2.3.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.2.0...@metamask/assets-controller@2.3.0
[2.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.1.0...@metamask/assets-controller@2.2.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.0.2...@metamask/assets-controller@2.1.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.0.1...@metamask/assets-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@2.0.0...@metamask/assets-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@1.0.0...@metamask/assets-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@0.2.0...@metamask/assets-controller@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@0.1.0...@metamask/assets-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/assets-controller@0.1.0
