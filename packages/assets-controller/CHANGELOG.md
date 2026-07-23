# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [11.2.0]

### Uncategorized

- refactor: add `.js` import extensions to Assets packages ([#9580](https://github.com/MetaMask/core/pull/9580))

### Added

- Add stage-gated ingestion of the Snaps → AssetsController migration networks (Solana, Stellar, Tron) ([#9534](https://github.com/MetaMask/core/pull/9534))
  - `AssetsController` and `AccountsApiDataSource` now resolve a per-network migration stage from `RemoteFeatureFlagController` state (via `RemoteFeatureFlagController:getState`) using the `networkAssetsSnapsMigrationSolana`, `networkAssetsSnapsMigrationStellar`, and `networkAssetsSnapsMigrationTron` flags. Migration networks are only ingested and surfaced as active chains from `SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback` onward, and left to the Snap when the stage is `Off` (the fail-safe when the flag is missing). Non-migration namespaces (e.g. `eip155`) are never gated.

### Fixed

- `AccountsApiDataSource` `forceUpdate` balance fetches now use `staleTime`/`gcTime` of `100`ms (previously `0`/`0`) so bursts of near-simultaneous forced refreshes are de-duplicated by TanStack Query into a single Accounts API request instead of one request per trigger ([#9591](https://github.com/MetaMask/core/pull/9591))

## [11.1.1]

### Changed

- Bump `@metamask/transaction-controller` from `^69.1.0` to `^69.2.1` ([#9589](https://github.com/MetaMask/core/pull/9589), [#9593](https://github.com/MetaMask/core/pull/9593))
- Bump `@metamask/assets-controllers` from `^109.4.1` to `^110.0.0` ([#9593](https://github.com/MetaMask/core/pull/9593))
- Bump `@metamask/core-backend` from `^6.5.0` to `^7.0.0` ([#9593](https://github.com/MetaMask/core/pull/9593))

### Fixed

- `TokenDataSource` balance-only metadata heals no longer apply EVM occurrence / non-EVM Blockaid spam filtering (or delete those holdings from `assetsBalance`); filtering still applies to newly `detectedAssets`. Fixes missing `assetsInfo` for already-tracked balances after [#9547](https://github.com/MetaMask/core/pull/9547) ([#9584](https://github.com/MetaMask/core/pull/9584))

## [11.1.0]

### Added

- `AccountsApiDataSource` now selects the Accounts API balances endpoint version from the `RemoteFeatureFlagController` (`assetsAccountsApiV6` flag, read per fetch off the shared messenger, default v5) so the v6 endpoint is gated consistently across clients (extension, mobile) without each client wiring a getter. The flag is read as a JSON variation shaped `{ value: boolean }` (same shape as `backendWebSocketConnection`). Adds a required `messenger` option and `RemoteFeatureFlagController:getState` to `AccountsApiDataSourceAllowedActions`. Only `category: 'token'` rows from the v6 response are consumed (DeFi positions are ignored) to preserve parity with v5 ([#9344](https://github.com/MetaMask/core/pull/9344))
- Add `getAsset(accountId, assetId)` method and `AssetsController:getAsset` messenger action that returns the combined `Asset` (balance, metadata, price) for a single account/asset pair from controller state, or `undefined` when a complete renderable asset is not available ([#9521](https://github.com/MetaMask/core/pull/9521))

### Changed

- Persist `assetsPrice` in `AssetsController` state so last-known prices survive app restart / state rehydration (refreshed on the next price fetch via existing `PriceDataSource` TTL) ([#9566](https://github.com/MetaMask/core/pull/9566))
- Memoize hot-path asset ID / legacy-format conversions to cut repeated keccak256 (`toChecksumAddress`) and CAIP parsing ([#9546](https://github.com/MetaMask/core/pull/9546), [#9555](https://github.com/MetaMask/core/pull/9555))
  - `normalizeAssetId` uses lodash `memoize` so already-normalized IDs skip re-checksumming across the pipeline
  - `formatExchangeRatesForBridge` caches the last result on input identity (`===` for BaseController slices, lodash `isEqual` for rebuilt native maps); exports `FormatExchangeRatesForBridgeParams`
  - `formatStateForTransactionPay` caches the last result the same way (`isEqual` for rebuilt `accounts` / `nativeAssetIdentifiers`) and freezes the cached result so later mutations cannot poison the cache; exports `FormatStateForTransactionPayParams`
  - `#getNativeAssetMap` returns a stable empty object when uncached so memoized formatters are not busted by `?? {}` identity churn
- `TokenDataSource` EVM spam filtering now uses per-chain floors from Token API `GET /v1/suggestedOccurrenceFloors` (`queryApiClient.token.fetchV1SuggestedOccurrenceFloors`) instead of a hardcoded minimum of 3 occurrences. Chains missing from the response (or a failed floors fetch) still fall back to 3 ([#9537](https://github.com/MetaMask/core/pull/9537))
- `TokensApiClient` (used by `RpcDataSource` / `TokenDetector`) now sets the token-list `occurrenceFloor` query param from the same Token API `GET /v1/suggestedOccurrenceFloors` endpoint (cached 1h), replacing the hardcoded Linea/MegaETH/Tempo special cases. Missing chains or failed fetches fall back to 3 ([#9537](https://github.com/MetaMask/core/pull/9537))
- Bump `@metamask/network-enablement-controller` from `^5.5.0` to `^5.6.0` ([#9520](https://github.com/MetaMask/core/pull/9520))
- Bump `@metamask/phishing-controller` from `^17.2.1` to `^17.3.0` ([#9532](https://github.com/MetaMask/core/pull/9532))
- Bump `@metamask/transaction-controller` from `^69.0.0` to `^69.1.0` ([#9568](https://github.com/MetaMask/core/pull/9568))

### Fixed

- `TokenDataSource` now also fetches token metadata for assets present in `assetsBalance` that are missing `assetsInfo` (previously only detected assets without metadata were enriched) ([#9547](https://github.com/MetaMask/core/pull/9547))

## [11.0.0]

### Fixed

- **BREAKING:** Subscribe to exported `AccountTreeController:stateChange`, `ClientController:stateChange`, and `NetworkEnablementController:stateChange` messenger events instead of locally constructed `:stateChanged` aliases ([#9478](https://github.com/MetaMask/core/pull/9478))

## [10.2.1]

### Changed

- Bump `@metamask/transaction-controller` from `^68.3.0` to `^69.0.0` ([#9456](https://github.com/MetaMask/core/pull/9456), [#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/accounts-controller` from `^39.0.4` to `^39.0.5` ([#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/account-tree-controller` from `^7.5.4` to `^7.5.5` ([#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/assets-controllers` from `^109.4.0` to `^109.4.1` ([#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/network-enablement-controller` from `^5.4.1` to `^5.5.0` ([#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/phishing-controller` from `^17.2.0` to `^17.2.1` ([#9470](https://github.com/MetaMask/core/pull/9470))

## [10.2.0]

### Added

- Add Robinhood Chain (`4663`/`0x1237`) in `MulticallClient` ([#9443](https://github.com/MetaMask/core/pull/9443))

### Changed

- `MulticallClient` memoizes `balanceOf` and `getEthBalance` call encodings per account address when building multicall batches, reducing redundant ABI encoding for wallets with many tokens ([#9425](https://github.com/MetaMask/core/pull/9425))
- Bump `@metamask/transaction-controller` from `^68.2.2` to `^68.3.0` ([#9421](https://github.com/MetaMask/core/pull/9421))
- Bump `@metamask/keyring-api` from `^23.3.0` to `^23.5.0` ([#9390](https://github.com/MetaMask/core/pull/9390))
- Bump `@metamask/keyring-snap-client` from `^9.0.2` to `^9.2.0` ([#9390](https://github.com/MetaMask/core/pull/9390))
- Bump `@metamask/account-tree-controller` from `^7.5.3` to `^7.5.4` ([#9429](https://github.com/MetaMask/core/pull/9429))
- Bump `@metamask/assets-controllers` from `^109.3.0` to `^109.4.0` ([#9429](https://github.com/MetaMask/core/pull/9429), [#9450](https://github.com/MetaMask/core/pull/9450))

## [10.1.0]

### Added

- Add temporary `tempMigrateAssetsInfoMetadataAssets3346` constructor option that heals `assetsInfo` metadata (and custom-asset tracking) wiped by a prior defect for tokens on niche EVM chains, using legacy `TokensController` state provided by the host ([#9393](https://github.com/MetaMask/core/pull/9393))

### Changed

- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

### Fixed

- Fetch balances when switching account groups, enabling RPC-only networks, or after a new account is added to the account tree ([#9388](https://github.com/MetaMask/core/pull/9388))

## [10.0.1]

### Changed

- Bump `@metamask/transaction-controller` from `^68.2.0` to `^68.2.2` ([#9337](https://github.com/MetaMask/core/pull/9337), [#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/accounts-controller` from `^39.0.3` to `^39.0.4` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/assets-controllers` from `^109.2.2` to `^109.3.0` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/core-backend` from `^6.4.0` to `^6.5.0` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/network-controller` from `^33.0.0` to `^34.0.0` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/network-enablement-controller` from `^5.4.0` to `^5.4.1` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/polling-controller` from `^16.0.7` to `^16.0.8` ([#9349](https://github.com/MetaMask/core/pull/9349))

## [10.0.0]

### Changed

- **BREAKING:** `AssetsController` messenger must now allow `AccountActivityService:balanceUpdated` so unified `assetsBalance` state receives real-time websocket balance updates when `AccountActivityService` owns the server subscription ([#9273](https://github.com/MetaMask/core/pull/9273))
- Bump `@metamask/transaction-controller` from `^68.1.1` to `^68.2.0` ([#9253](https://github.com/MetaMask/core/pull/9253))
- Bump `@metamask/core-backend` from `^6.3.3` to `^6.4.0` ([#9312](https://github.com/MetaMask/core/pull/9312))

### Fixed

- Fix stale token balances after transactions when switching accounts or when websocket subscriptions reconnect; `AssetsController` now fetches before re-subscribing on account switch and serializes overlapping refresh work ([#9265](https://github.com/MetaMask/core/pull/9265))
- `AccountsApiDataSource` bypasses the TanStack Query balance cache when `forceUpdate` is true so forced refreshes return up-to-date balances instead of 60-second cached values ([#9265](https://github.com/MetaMask/core/pull/9265))
- `BackendWebsocketDataSource` re-subscribes when subscribed accounts change (case-insensitive EVM address matching), serializes subscribe/unsubscribe to prevent races on account switch, and registers channel callbacks as a fallback when server `subscriptionId` values do not match ([#9265](https://github.com/MetaMask/core/pull/9265))
- Remove the 120-second websocket balance freshness guard that blocked force-refresh and polling updates from correcting stale websocket balances ([#9273](https://github.com/MetaMask/core/pull/9273))
- `BackendWebsocketDataSource` registers subscription handlers before the subscribe handshake so in-flight account-activity notifications are not dropped, cleans up subscription state on subscribe failure, and resolves balance updates from stored subscription state when notifications arrive with stale subscription IDs ([#9273](https://github.com/MetaMask/core/pull/9273))
- `AssetsController` refreshes data-source `activeChains`, re-subscribes, and force-fetches balances for the newly selected EVM chain when the user switches networks via `NetworkController:networkDidChange`
- `AssetsController` bypasses the price deduper cache and fetches spot prices for assets on a newly selected or added EVM network only when those assets have no entry in `assetsPrice` yet; `DetectionMiddleware` queues newly detected assets for the same pipeline price fetch so RPC-detected tokens are priced without waiting for the poll interval
- `AssetsController` merge updates from `getAssets({ forceUpdate: true })` now replace balances on API-covered chains so unlock/startup reflects the fresh Accounts API snapshot instead of preserving stale pre-lock tokens; subscription-driven merges are unchanged

## [9.1.0]

### Added

- Add `calculateBalanceForAllWallets` and `calculateBalanceChangeForAccountGroup` selectors for computing wallet- and group-level balances from the unified `AssetsController` state ([#9230](https://github.com/MetaMask/core/pull/9230))
- Add `priceFreshnessTtlMs` option to `PriceDataSourceConfig` controlling how long a fetched price is considered fresh before it is re-fetched (defaults to the poll interval, 60 000 ms) ([#9189](https://github.com/MetaMask/core/pull/9189))
- Add `PriceDataSource.invalidatePriceCache()` to force the next fetch to bypass the freshness cache; `AssetsController` now calls it when the selected currency changes so cached prices in the previous currency are refreshed ([#9189](https://github.com/MetaMask/core/pull/9189))

### Changed

- Bump `@metamask/account-tree-controller` from `^7.5.2` to `^7.5.3` ([#9231](https://github.com/MetaMask/core/pull/9231))
- Bump `@metamask/assets-controllers` from `^109.2.1` to `^109.2.2` ([#9231](https://github.com/MetaMask/core/pull/9231))
- Bump `@metamask/accounts-controller` from `^39.0.2` to `^39.0.3` ([#9231](https://github.com/MetaMask/core/pull/9231))
- Bump `@metamask/keyring-api` from `^23.1.0` to `^23.3.0` ([#9249](https://github.com/MetaMask/core/pull/9249))

### Fixed

- Deduplicate price fetches in `PriceDataSource` so overlapping triggers (enrichment middleware, subscription polls, and manual refreshes) no longer issue duplicate price API requests for the same asset; assets fetched within the freshness TTL are skipped and concurrent in-flight fetches are joined ([#9189](https://github.com/MetaMask/core/pull/9189))
- Remove a redundant one-time balance fetch in `AssetsController` when the enabled network list changes, since subscription refresh and the enabled-networks handler already cover those fetches ([#9189](https://github.com/MetaMask/core/pull/9189))
- `DetectionMiddleware` no longer triggers redundant metadata and price fetches for assets already present in `assetsBalance` or `assetsInfo` state ([#9215](https://github.com/MetaMask/core/pull/9215))
- `AccountsApiDataSource` and `SnapDataSource` now use `merge` update mode instead of `full`, preventing assets on custom or partially-supported networks from being incorrectly wiped on each poll ([#9215](https://github.com/MetaMask/core/pull/9215))

## [9.0.2]

### Changed

- Bump `@metamask/assets-controllers` from `^109.0.0` to `^109.2.1` ([#9110](https://github.com/MetaMask/core/pull/9110), [#9202](https://github.com/MetaMask/core/pull/9202), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/transaction-controller` from `^67.1.0` to `^68.1.1` ([#9089](https://github.com/MetaMask/core/pull/9089), [#9177](https://github.com/MetaMask/core/pull/9177), [#9203](https://github.com/MetaMask/core/pull/9203), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/keyring-controller` from `^27.0.0` to `^27.1.0` ([#9129](https://github.com/MetaMask/core/pull/9129))
- Bump `@metamask/accounts-controller` from `^39.0.1` to `^39.0.2` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/controller-utils` from `^12.2.0` to `^12.3.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/network-controller` from `^32.0.0` to `^33.0.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/network-enablement-controller` from `^5.3.0` to `^5.4.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/polling-controller` from `^16.0.6` to `^16.0.7` ([#9218](https://github.com/MetaMask/core/pull/9218))

### Fixed

- `AssetsController` reconciliate and self-heals stale assetInfo metadata types ([#9099](https://github.com/MetaMask/core/pull/9099))

## [9.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^12.1.1` to `^12.2.0` ([#9083](https://github.com/MetaMask/core/pull/9083))

## [9.0.0]

### Added

- Add USDC on ARC mainnet (`eip155:5042/erc20:0x3600000000000000000000000000000000000000`) to default tokens to display on ARC ([#9011](https://github.com/MetaMask/core/pull/9011))

### Changed

- **BREAKING:** `RpcDataSourceOptions`, `TokenDataSourceOptions`, and `BackendWebsocketDataSourceOptions` no longer accept `isNativeAsset: (assetId) => boolean`; replace it with `getAssetType: (assetId) => 'native' | 'erc20' | 'spl'` ([#9063](https://github.com/MetaMask/core/pull/9063))
- Token detection via `TokensApiClient` is now gated behind the `/v2/supportedNetworks` endpoint; chains absent from the supported-networks list are skipped and return an empty token list, and token-list request failures return an empty array instead of throwing ([#9063](https://github.com/MetaMask/core/pull/9063))
- Use `encodeFunctionData` from `@metamask/controller-utils` for improved performance ([#9057](https://github.com/MetaMask/core/pull/9057))
- Bump `@metamask/assets-controllers` from `^108.6.0` to `^109.0.0` ([#9078](https://github.com/MetaMask/core/pull/9078))
- Bump `@metamask/transaction-controller` from `^67.0.0` to `^67.1.0` ([#9066](https://github.com/MetaMask/core/pull/9066))

### Removed

- **BREAKING:** Remove `TransactionController:incomingTransactionsReceived` from `AssetsController` allowed events and `RpcDataSourceAllowedEvents`; remove associated balance refresh on incoming transactions ([#9012](https://github.com/MetaMask/core/pull/9012))

### Fixed

- `RpcDataSource`, `TokenDataSource`, and `BackendWebsocketDataSource` now correctly classify native tokens exposed via a non-zero-address ERC-20 interface (e.g. Immutable zkEVM's IMX, Arc's USDC at `0x3600…0000`) as `type: 'native'` instead of `type: 'erc20'` ([#9063](https://github.com/MetaMask/core/pull/9063))

## [8.3.3]

### Changed

- Bump `@metamask/network-enablement-controller` from `^5.2.0` to `^5.3.0` ([#9003](https://github.com/MetaMask/core/pull/9003))
- Bump `@metamask/transaction-controller` from `^66.0.1` to `^67.0.0` ([#9021](https://github.com/MetaMask/core/pull/9021))
- Bump `@metamask/account-tree-controller` from `^7.5.1` to `^7.5.2` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/accounts-controller` from `^39.0.0` to `^39.0.1` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/assets-controllers` from `^108.5.0` to `^108.6.0` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.1.1` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/core-backend` from `^6.3.2` to `^6.3.3` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/keyring-controller` from `^26.0.0` to `^27.0.0` ([#9058](https://github.com/MetaMask/core/pull/9058))

## [8.3.2]

### Changed

- Bump `@metamask/account-tree-controller` from `^7.5.0` to `^7.5.1` ([#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/accounts-controller` from `^38.1.2` to `^39.0.0` ([#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/assets-controllers` from `^108.4.0` to `^108.5.0` ([#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/core-backend` from `^6.3.1` to `^6.3.2` ([#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/transaction-controller` from `^66.0.0` to `^66.0.1` ([#8999](https://github.com/MetaMask/core/pull/8999))

## [8.3.1]

### Fixed

- Fix sub-`1e-7` dust balance amounts being serialized in scientific-notation form (e.g. `"1e-18"`) instead of plain decimal, which caused crashes in downstream `BigInt()`-based consumers ([#8982](https://github.com/MetaMask/core/pull/8982))

## [8.3.0]

### Added

- Add ARC mainnet (`5042`/`0x13b2`) in `MulticallClient` ([#8973](https://github.com/MetaMask/core/pull/8973))

### Changed

- Bump `@metamask/assets-controllers` from `^108.3.0` to `^108.4.0` ([#8981](https://github.com/MetaMask/core/pull/8981))

## [8.2.0]

### Changed

- `MulticallClient` no longer falls back to individual RPC calls by default; it retries and returns failed responses when retries are exhausted. Pass `{ fallbackToSingleCalls: true }` to `batchBalanceOf` to opt into per-token RPC fallback after retries (used by balance fetching, not token detection) ([#8925](https://github.com/MetaMask/core/pull/8925))
- Bump `@metamask/assets-controllers` from `^108.2.0` to `^108.3.0` ([#8941](https://github.com/MetaMask/core/pull/8941))

## [8.1.0]

### Changed

- `AssetsController` now re-evaluates the `isEnabled` callback when handling data-source active chain updates, instead of snapshotting its return value at construction ([#8914](https://github.com/MetaMask/core/pull/8914))
- `AssetsController` no longer skips constructor initialization when `isEnabled` returns false at construction time, so the controller can handle active chain updates after `isEnabled` later becomes true ([#8914](https://github.com/MetaMask/core/pull/8914))

## [8.0.2]

### Changed

- Bump `@metamask/keyring-controller` from `^25.5.0` to `^26.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912))
- Bump `@metamask/assets-controllers` from `^108.1.0` to `^108.2.0` ([#8911](https://github.com/MetaMask/core/pull/8911))
- Bump `@metamask/account-tree-controller` from `^7.4.0` to `^7.5.0` ([#8912](https://github.com/MetaMask/core/pull/8912))
- Bump `@metamask/accounts-controller` from `^38.1.1` to `^38.1.2` ([#8912](https://github.com/MetaMask/core/pull/8912))
- Bump `@metamask/core-backend` from `^6.3.0` to `^6.3.1` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [8.0.1]

### Fixed

- Add the previously declared `SnapControllerSnapInstalledEvent` to the `AssetsControllerMessenger` allowed events ([#8868](https://github.com/MetaMask/core/pull/8868))
- `addCustomAsset` now immediately seeds `assetsBalance` with a zero amount for the newly added asset, so the UI can render it before the next pipeline fetch ([#8872](https://github.com/MetaMask/core/pull/8872))

## [8.0.0]

### Changed

- Bump `@metamask/transaction-controller` from `^65.3.0` to `^66.0.0` ([#8796](https://github.com/MetaMask/core/pull/8796), [#8848](https://github.com/MetaMask/core/pull/8848))
- Bump `@metamask/core-backend` from `^6.2.2` to `^6.3.0` ([#8813](https://github.com/MetaMask/core/pull/8813))
- Bump `@metamask/phishing-controller` from `^17.1.2` to `^17.2.0` ([#8819](https://github.com/MetaMask/core/pull/8819))
- Bump `@metamask/network-enablement-controller` from `^5.1.1` to `^5.2.0` ([#8834](https://github.com/MetaMask/core/pull/8834))
- Bump `@metamask/polling-controller` from `^16.0.5` to `^16.0.6` ([#8834](https://github.com/MetaMask/core/pull/8834))

### Fixed

- `AccountsApiDataSource` no longer treats non-EVM chains (e.g. Solana) returned by the Accounts API as active chains; only `eip155:` networks are now included ([#8864](https://github.com/MetaMask/core/pull/8864))
- **BREAKING:** **SnapDataSource:** `SnapControllerSnapInstalledEvent` has been added to `SnapDataSourceAllowedEvents`. Hosts that restrict which events flow through the `AssetsController` messenger must now also delegate `SnapController:snapInstalled`; failing to do so will prevent snap chain re-discovery after install. Re-run keyring snap discovery when a new snap is installed so that snap-backed chains (Bitcoin, Solana, Tron, etc.) become available immediately after install ([#8862](https://github.com/MetaMask/core/pull/8862))
- Non-EVM assets with a `slip44` asset namespace (e.g. Bitcoin, Solana native, TRON) are now correctly typed as `native` instead of `erc20` in `assetsInfo` ([#8811](https://github.com/MetaMask/core/pull/8811))
- Solana SPL tokens (CAIP-19 `solana:.../token:<address>`) are now correctly typed as `spl` instead of `erc20` in `assetsInfo` ([#8811](https://github.com/MetaMask/core/pull/8811))

## [7.1.2]

### Changed

- Bump `@metamask/account-tree-controller` from `^7.3.0` to `^7.4.0` ([#8783](https://github.com/MetaMask/core/pull/8783))
- Bump `@metamask/assets-controllers` from `^108.0.0` to `^108.1.0` ([#8783](https://github.com/MetaMask/core/pull/8783))

### Fixed

- `buildNativeAssetsFromConstant` now normalizes each native asset ID via `normalizeAssetId`, ensuring ERC20 addresses are EIP-55 checksummed and consistent with IDs written by data sources ([#8789](https://github.com/MetaMask/core/pull/8789))
- `RpcDataSource` no longer writes `{ amount: "NaN" }` entries into `assetsBalance` when state holds malformed native metadata ([#8781](https://github.com/MetaMask/core/pull/8781))
  - Existing native metadata in `assetsInfo` is now only reused when its `decimals` field is a finite, non-negative number (via a new `#hasValidDecimals` guard). Stale entries like `{ type: 'native', decimals: null, name: '', symbol: '' }` or `{ decimals: -1, ... }` are replaced with the chain-status stub (`{ type: 'native', symbol/name: chainStatus.nativeCurrency, decimals: 18 }`) so balance conversion has a usable `decimals` and consumers never see a negative `decimals` in `assetsInfo`.
  - `decimals: 0` is treated as valid; `name` and `symbol` are not required.
  - Decimals resolution in `#handleBalanceUpdate` and the manual-fetch path no longer relies on `??` to fall through from state to pipeline metadata. A new `#pickValidDecimals` helper picks the first source whose `decimals` is finite and non-negative, so a stale `decimals: NaN` (or `decimals: -1`) in state can no longer shadow the chain-status stub's `decimals: 18` and silently produce `amount: '0'` while `assetsInfo` reports `decimals: 18`.
  - `#convertToHumanReadable` now defensively returns `'0'` when `decimals` isn't a finite non-negative number or when the raw balance can't be parsed, matching the existing safe fallback used in the error path.
- The mUSD (`MetaMask USD`) contract address stored in `defaults.ts` is now EIP-55 checksummed (`0xacA92E438df0B2401fF60dA7E4337B687a2435DA`). Previously the address was all-lowercase, causing the CAIP-19 keys pre-seeded into `assetsInfo` by `buildDefaultAssetsInfo()` to differ from the checksummed keys written by data sources (which always normalise asset IDs via `normalizeAssetId`). The mismatch resulted in two separate `assetsInfo` entries for the same token after the first balance or token-data poll. ([#8786](https://github.com/MetaMask/core/pull/8786))

## [7.1.1]

### Changed

- Bump `@metamask/accounts-controller` from `^38.1.0` to `^38.1.1` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/assets-controllers` from `^107.0.0` to `^108.0.0` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/network-controller` from `^31.1.0` to `^32.0.0` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))

## [7.1.0]

### Changed

- Update `RpcDataSource` to prevent native `getEthBalance` fetching for Tempo chains ([#8638](https://github.com/MetaMask/core/pull/8638))
- Bump `@metamask/network-controller` from `^31.0.0` to `^31.1.0` ([#8765](https://github.com/MetaMask/core/pull/8765))
- Bump `@metamask/assets-controllers` from `^106.0.1` to `^107.0.0` ([#8773](https://github.com/MetaMask/core/pull/8773))

## [7.0.1]

### Changed

- Bump `@metamask/accounts-controller` from `^38.0.0` to `^38.1.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/assets-controllers` from `^106.0.0` to `^106.0.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/core-backend` from `^6.2.1` to `^6.2.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/network-controller` from `^30.1.0` to `^31.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/network-enablement-controller` from `^5.1.0` to `^5.1.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/permission-controller` from `^13.1.0` to `^13.1.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/phishing-controller` from `^17.1.1` to `^17.1.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/polling-controller` from `^16.0.4` to `^16.0.5` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/transaction-controller` from `^65.2.0` to `^65.3.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [7.0.0]

### Added

- RPC token detection now uses the same endpoint as `TokenListController` (`token.api.cx.metamask.io/tokens/{chainId}`) instead of the v3 `tokens.api.cx.metamask.io/v3/chains/.../assets` host, with no client-side `first` cap and a shared TanStack Query cache ([#8727](https://github.com/MetaMask/core/pull/8727))
  - Mirrors `TokenListController.getTokensURL` exactly: same query parameters (`occurrenceFloor`, `includeNativeAssets=false`, `includeTokenFees=false`, `includeAssetType=false`, `includeERC20Permit=false`, `includeStorage=false`, `includeRwaData=true`), per-chain occurrence floor (`1` on Linea / MegaETH / Tempo mainnets, `3` elsewhere), and the Linea-mainnet aggregator filter (`lineaTeam`-flagged or ≥ 3 aggregators).
  - Detection now also picks up `iconUrl` and `aggregators` returned by the API; previously only `address`/`symbol`/`name`/`decimals`/`occurrences` were forwarded into `TokenListEntry`.
  - The previous client-side `first=25` cap is removed; the API still bounds responses server-side via `occurrenceFloor`, but the long tail past the previous 25-token slice is now visible to detection.
  - `TokensApiClient` accepts an optional `queryClient` (compatible with `ApiPlatformClient.queryClient`); when provided it caches/dedupes per-chain list responses with a 5 min `staleTime` and 1 h `gcTime` under the `['assets-controller','rpc-detection','token-list',{chainId}]` key, so concurrent detector polls across accounts/instances coalesce into a single network request.
  - `RpcDataSource` accepts a new optional `queryClient` option which it forwards to `TokensApiClient`. `AssetsController` defaults this to its existing `queryApiClient.queryClient`, so consumers get the full list and shared cache automatically.

### Changed

- **BREAKING:** `AssetsController` now requires two additional messenger events from `NetworkController`: `NetworkController:networkAdded` and `NetworkController:networkRemoved` ([#8727](https://github.com/MetaMask/core/pull/8727))
  - Consumers building restricted controller messengers must include both events in their allowed event set, otherwise TypeScript/action constraint checks will fail.
- Bump `@metamask/account-tree-controller` from `^7.2.0` to `^7.3.0` ([#8722](https://github.com/MetaMask/core/pull/8722))
- Bump `@metamask/keyring-controller` from `^25.4.0` to `^25.5.0` ([#8722](https://github.com/MetaMask/core/pull/8722))
- Bump `@metamask/permission-controller` from `^13.0.0` to `^13.1.0` ([#8722](https://github.com/MetaMask/core/pull/8722))
- Bump `@metamask/transaction-controller` from `^65.1.0` to `^65.2.0` ([#8722](https://github.com/MetaMask/core/pull/8722))

### Fixed

- `TokenDataSource` no longer drops user-imported EVM custom asset metadata when the V3 Tokens API returns the asset ID lower-cased ([#8727](https://github.com/MetaMask/core/pull/8727))
  - State stores `customAssets` checksummed (via `normalizeAssetId`), but the API can echo it lower-cased; the spam-filter bypass now compares lower-cased on both sides so customs reliably skip the `MIN_TOKEN_OCCURRENCES` filter and `assetsInfo` is populated for them.
- `RpcDataSource` no longer overwrites richer native token metadata with a minimal stub on every balance refresh ([#8727](https://github.com/MetaMask/core/pull/8727))
  - Previously, each balance fetch emitted `{ type: 'native', symbol: chainStatus.nativeCurrency, name: chainStatus.nativeCurrency, decimals: 18 }` for native assets, which clobbered fields like `image`, `description`, `occurrences`, and `aggregators` enriched by the price/info API and renamed e.g. `"Avalanche"` to `"AVAX"`.
  - Native token metadata now mirrors the existing ERC-20 behavior: prefer existing metadata in state when present, and only emit the stub when no metadata is in state yet (e.g. first sighting of the asset). The fallback in the balance-fetch error path is gated the same way.

## [6.4.0]

### Added

- Expose missing `AssetsController:setSelectedCurrency` action through its messenger ([#8719](https://github.com/MetaMask/core/pull/8719))
  - Corresponding action type is available as well.

### Changed

- Bump `@metamask/transaction-controller` from `^65.0.0` to `^65.1.0` ([#8691](https://github.com/MetaMask/core/pull/8691))
- Bump `@metamask/network-enablement-controller` from `^5.0.2` to `^5.1.0` ([#8665](https://github.com/MetaMask/core/pull/8665))
- Bump `@metamask/keyring-controller` from `^25.3.0` to `^25.4.0` ([#8665](https://github.com/MetaMask/core/pull/8665))
- Bump `@metamask/accounts-controller` from `^37.2.0` to `^38.0.0` ([#8665](https://github.com/MetaMask/core/pull/8665))
- Bump `@metamask/account-tree-controller` from `^7.1.0` to `^7.2.0` ([#8665](https://github.com/MetaMask/core/pull/8665))
- Bump `@metamask/assets-controllers` from `^105.1.0` to `^106.0.0` ([#8721](https://github.com/MetaMask/core/pull/8721))

## [6.3.0]

### Added

- Seed mUSD (`0xaca92e438df0b2401ff60da7e4337b687a2435da`) as a default tracked asset on Ethereum mainnet (`eip155:1`), Linea (`eip155:59144`), and Monad testnet (`eip155:143`) ([#8616](https://github.com/MetaMask/core/pull/8616))
  - `assetsInfo` is pre-populated in default controller state so mUSD metadata is available before any on-chain fetch completes.
  - Zero-balance entries are written into `assetsBalance` at startup, on account/network changes, and immediately when the user adds a chain that has default tracked assets.
  - New exports: `DEFAULT_TRACKED_ASSETS_BY_CHAIN`, `CHAINS_WITH_DEFAULT_TRACKED_ASSETS`, `DEFAULT_ASSET_METADATA`, `buildDefaultAssetsInfo`, `getDefaultTrackedAssetsForChain`, `getDefaultAssetMetadata`.

### Changed

- Bump `@metamask/permission-controller` from `^12.3.0` to `^13.0.0` ([#8661](https://github.com/MetaMask/core/pull/8661))
- Bump `@metamask/assets-controllers` from `^105.0.0` to `^105.1.0` ([#8661](https://github.com/MetaMask/core/pull/8661))
- Bump `@metamask/keyring-api` from `^23.0.1` to `^23.1.0` ([#8647](https://github.com/MetaMask/core/pull/8647))
- Bump `@metamask/keyring-internal-api` from `^10.1.1` to `^11.0.1` ([#8584](https://github.com/MetaMask/core/pull/8584), [#8647](https://github.com/MetaMask/core/pull/8647))
- Bump `@metamask/keyring-snap-client` from `^9.0.1` to `^9.0.2` ([#8647](https://github.com/MetaMask/core/pull/8647))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/keyring-controller` from `^25.2.0` to `^25.3.0` ([#8634](https://github.com/MetaMask/core/pull/8634))
- Bump `@metamask/network-controller` from `^30.0.1` to `^30.1.0` ([#8636](https://github.com/MetaMask/core/pull/8636))

### Fixed

- Correct mUSD default tracked metadata decimals from `18` to `6` so seeded balances and formatting align with token contract precision ([#8664](https://github.com/MetaMask/core/pull/8664))

## [6.2.1]

### Changed

- Bump `@metamask/transaction-controller` from `^64.4.0` to `^65.0.0` ([#8613](https://github.com/MetaMask/core/pull/8613))
- Bump `@metamask/assets-controllers` from `^104.3.0` to `^105.0.0` ([#8622](https://github.com/MetaMask/core/pull/8622))

## [6.2.0]

### Added

- Add `CustomAssetGraduationMiddleware` that removes an EVM asset from `customAssets[selectedAccount]` when `AccountsApiDataSource` or `BackendWebsocketDataSource` reports a balance for it ([#8582](https://github.com/MetaMask/core/pull/8582))
  - Non-EVM custom assets (Solana, BTC, Tron) are not affected.
  - `RpcDataSource` continues to be the sole balance fetcher for assets still in `customAssets`.
- Add `RpcFallbackMiddleware` to the fast pipeline so chains that error in `response.errors` (network error, `unprocessedNetworks`, timeout) fall back to `RpcDataSource` ([#8582](https://github.com/MetaMask/core/pull/8582))
  - Successful RPC results are merged into the response and recovered chains are cleared from `response.errors`.
- Add a configurable `fetchTimeoutMs` option (default `15000`) to `AccountsApiDataSource`, `PriceDataSource`, and `TokenDataSource` ([#8582](https://github.com/MetaMask/core/pull/8582))
  - On timeout, AccountsAPI marks every requested chain as errored so `RpcFallbackMiddleware` picks them up; price and token enrichment degrade gracefully.
- Add `fetchWithTimeout` utility that races an async task against a timeout ([#8582](https://github.com/MetaMask/core/pull/8582))

### Changed

- Bump `@metamask/transaction-controller` from `^64.3.0` to `^64.4.0` ([#8585](https://github.com/MetaMask/core/pull/8585))

### Fixed

- Handle trace callback returning `undefined` without throwing ([#8586](https://github.com/MetaMask/core/pull/8586))

## [6.1.0]

### Added

- Add newly supported chains to multicall contract support in `MulticallClient` ([#8346](https://github.com/MetaMask/core/pull/8346))
  - Tempo Mainnet (`4217`/`0x1079`)
  - Tempo Testnet Moderato (`42431`/`0xa5bf`)
  - Ink Mainnet (`57073`/`0xdef1`)
  - Stable mainnet (`988`/`0x3dc`)

### Changed

- Bump `@metamask/assets-controllers` from `^104.0.0` to `^104.3.0` ([#8509](https://github.com/MetaMask/core/pull/8509), [#8544](https://github.com/MetaMask/core/pull/8544), [#8559](https://github.com/MetaMask/core/pull/8559))
- Bump `@metamask/keyring-api` from `^21.6.0` to `^23.0.1` ([#8464](https://github.com/MetaMask/core/pull/8464))
- Bump `@metamask/keyring-internal-api` from `^10.0.0` to `^10.1.1` ([#8464](https://github.com/MetaMask/core/pull/8464))
- Bump `@metamask/keyring-snap-client` from `^8.2.0` to `^9.0.1` ([#8464](https://github.com/MetaMask/core/pull/8464))
- Bump `@metamask/transaction-controller` from `^64.2.0` to `^64.3.0` ([#8482](https://github.com/MetaMask/core/pull/8482))

### Fixed

- Native asset detection now correctly identifies native assets across all CAIP-19 representations, not just `slip44:` namespace checks ([#8483](https://github.com/MetaMask/core/pull/8483))
  - Previously, native assets represented as ERC-20 tokens were not recognized as native, causing incorrect token type classification.
- Exempt mUSD token from EVM ERC-20 minimum-occurrence spam filter so it is no longer incorrectly hidden ([#8541](https://github.com/MetaMask/core/pull/8541))

## [6.0.0]

### Added

- **BREAKING:** `AssetsControllerMessenger` now requires the `AccountsControllerGetSelectedAccountAction` allowed action ([#8430](https://github.com/MetaMask/core/pull/8430))
  - Used as a fallback in `#getSelectedAccounts()` when `AccountTreeController` has not yet initialized.
  - Consumers must register `AccountsController:getSelectedAccount` on the messenger.
- **BREAKING:** `AssetsControllerMessenger` now requires the `TransactionControllerUnapprovedTransactionAddedEvent` allowed event ([#8430](https://github.com/MetaMask/core/pull/8430))
  - `AssetsController` subscribes to `TransactionController:unapprovedTransactionAdded` to refresh balances for the account initiating a transaction (e.g. for gas estimations).
  - Consumers must allow `TransactionController:unapprovedTransactionAdded` on the messenger.
- Added `isOnboarded` option to `AssetsControllerOptions` and `RpcDataSourceConfig` ([#8430](https://github.com/MetaMask/core/pull/8430))
  - When `isOnboarded` returns `false`, `RpcDataSource` skips `fetch` and `subscribe` calls, preventing on-chain RPC calls before onboarding is complete.
  - Defaults to `() => true` so existing consumers are unaffected.

### Changed

- Bump `@metamask/account-tree-controller` from `^7.0.0` to `^7.1.0` ([#8472](https://github.com/MetaMask/core/pull/8472))

## [5.0.1]

### Changed

- Bump `@metamask/transaction-controller` from `^64.0.0` to `^64.2.0` ([#8432](https://github.com/MetaMask/core/pull/8432), [#8447](https://github.com/MetaMask/core/pull/8447))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))
- Bump `@metamask/assets-controllers` from `^103.1.1` to `^104.0.0` ([#8466](https://github.com/MetaMask/core/pull/8466))

### Fixed

- `AssetsController` now re-subscribes to all data sources when `AccountTreeController` state changes after initial startup, ensuring snap accounts and their chains are included ([#8430](https://github.com/MetaMask/core/pull/8430))
  - Previously, `#start()` would create subscriptions before snap accounts were available, and its idempotency guard prevented re-subscription when the full account list arrived.
  - Added `#handleAccountTreeStateChange()` which forces a full re-subscription and re-fetch when the account tree updates, picking up all accounts including snaps.
  - Added `AccountsController:getSelectedAccount` as a fallback in `#getSelectedAccounts()` for when the account tree is not yet initialized.
- `TokenDataSource` no longer filters out user-imported custom assets with the `MIN_TOKEN_OCCURRENCES` spam filter or Blockaid bulk scan ([#8430](https://github.com/MetaMask/core/pull/8430))
  - Tokens present in `customAssets` state now bypass the EVM occurrence threshold and non-EVM Blockaid scan, ensuring manually imported assets always appear.
- `BackendWebsocketDataSource` now properly releases chains to `AccountsApiDataSource` when the websocket is disconnected or disabled ([#8430](https://github.com/MetaMask/core/pull/8430))
  - Previously, `BackendWebsocketDataSource` eagerly claimed all supported chains on initialization regardless of connection state, preventing `AccountsApiDataSource` from polling.
  - Chains are now only claimed when the websocket is connected. On disconnect, chains are released so the chain-claiming loop assigns them to `AccountsApiDataSource` for polling fallback. On reconnect, chains are reclaimed.
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

- Bump `@metamask/assets-controllers` from `^100.0.3` to `^100.2.0`, ([#8107](https://github.com/MetaMask/core/pull/8107), [#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/network-enablement-controller` from `^4.1.2` to `^4.2.0` ([#8107](https://github.com/MetaMask/core/pull/8107))
- Bump `@metamask/transaction-controller` from `^62.19.0` to `^62.21.0`, ([#8104](https://github.com/MetaMask/core/pull/8104), [#8140](https://github.com/MetaMask/core/pull/8140))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@11.2.0...HEAD
[11.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@11.1.1...@metamask/assets-controller@11.2.0
[11.1.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@11.1.0...@metamask/assets-controller@11.1.1
[11.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@11.0.0...@metamask/assets-controller@11.1.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@10.2.1...@metamask/assets-controller@11.0.0
[10.2.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@10.2.0...@metamask/assets-controller@10.2.1
[10.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@10.1.0...@metamask/assets-controller@10.2.0
[10.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@10.0.1...@metamask/assets-controller@10.1.0
[10.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@10.0.0...@metamask/assets-controller@10.0.1
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@9.1.0...@metamask/assets-controller@10.0.0
[9.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@9.0.2...@metamask/assets-controller@9.1.0
[9.0.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@9.0.1...@metamask/assets-controller@9.0.2
[9.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@9.0.0...@metamask/assets-controller@9.0.1
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.3.3...@metamask/assets-controller@9.0.0
[8.3.3]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.3.2...@metamask/assets-controller@8.3.3
[8.3.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.3.1...@metamask/assets-controller@8.3.2
[8.3.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.3.0...@metamask/assets-controller@8.3.1
[8.3.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.2.0...@metamask/assets-controller@8.3.0
[8.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.1.0...@metamask/assets-controller@8.2.0
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.0.2...@metamask/assets-controller@8.1.0
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.0.1...@metamask/assets-controller@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@8.0.0...@metamask/assets-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@7.1.2...@metamask/assets-controller@8.0.0
[7.1.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@7.1.1...@metamask/assets-controller@7.1.2
[7.1.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@7.1.0...@metamask/assets-controller@7.1.1
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@7.0.1...@metamask/assets-controller@7.1.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@7.0.0...@metamask/assets-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@6.4.0...@metamask/assets-controller@7.0.0
[6.4.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@6.3.0...@metamask/assets-controller@6.4.0
[6.3.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@6.2.1...@metamask/assets-controller@6.3.0
[6.2.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@6.2.0...@metamask/assets-controller@6.2.1
[6.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@6.1.0...@metamask/assets-controller@6.2.0
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@6.0.0...@metamask/assets-controller@6.1.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@5.0.1...@metamask/assets-controller@6.0.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controller@5.0.0...@metamask/assets-controller@5.0.1
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
