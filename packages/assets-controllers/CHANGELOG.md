# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [81.0.1]

### Fixed

- Fix filter for staked Ethereum balances in `AccountTrackerController` ([#6846](https://github.com/MetaMask/core/pull/6846))

## [81.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/core-backend` from `^1.0.1` to `^2.0.0` ([#6834](https://github.com/MetaMask/core/pull/6834))

### Fixed

- Fix address casing in WebSocket-based token balance updates to ensure consistency ([#6819](https://github.com/MetaMask/core/pull/6819))

## [80.0.0]

### Added

- Add real-time balance updates via WebSocket integration with `AccountActivityService` to `TokenBalancesController` ([#6784](https://github.com/MetaMask/core/pull/6784))
  - Add `@metamask/core-backend` as a dependency and peer dependency ([#6784](https://github.com/MetaMask/core/pull/6784))
  - Controller now subscribes to `AccountActivityService:balanceUpdated` events for instant balance updates
    - Add support for real-time balance updates for both ERC20 tokens and native tokens
    - Add `TokenDetectionController:addDetectedTokensViaWs` action handler for adding tokens detected via WebSocket
  - Controller now subscribes to `AccountActivityService:statusChanged` events to dynamically adjust polling intervals
    - When WebSocket service is "up", polling interval increases to backup interval (5 minutes)
    - When WebSocket service is "down", polling interval restores to default interval (30 seconds)
    - Status changes are debounced (5 seconds) and jittered to prevent thundering herd
    - Add fallback to polling when balance updates contain errors or unsupported asset types

### Changed

- **BREAKING:** `TokenBalancesController` messenger must now allow `AccountActivityService:balanceUpdated` and `AccountActivityService:statusChanged` events ([#6784](https://github.com/MetaMask/core/pull/6784))
- **BREAKING:** `TokenBalancesController` messenger must now allow `TokenDetectionController:addDetectedTokensViaWs` action ([#6784](https://github.com/MetaMask/core/pull/6784))
- **BREAKING:** Change `TokenBalancesController` default polling interval to 30 seconds (was 180 seconds) ([#6784](https://github.com/MetaMask/core/pull/6784))
  - With real-time WebSocket updates, the default interval only applies when WebSocket is disconnected
  - When WebSocket is connected, polling automatically adjusts to 5 minutes as a backup
- **Performance Optimization:** Remove collection API calls from NFT detection process ([#6762](https://github.com/MetaMask/core/pull/6762))
  - Reduce NFT detection API calls by 83% (from 6 calls to 1 call per 100 tokens) by eliminating collection endpoint requests
  - Remove unused collection metadata fields: `contractDeployedAt`, `creator`, and `topBid`

### Fixed

- Fix address format compatibility between `TokenBalancesController` and `AccountTrackerController` in `AccountsApiBalanceFetcher` ([#6812](https://github.com/MetaMask/core/pull/6812))

## [79.0.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/polling-controller` from `^14.0.0` to `^14.0.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [79.0.0]

### Changed

- **BREAKING:** Change name of token-selector field from `type` to `accountType` to avoid conflicts with existing types. ([#6804](https://github.com/MetaMask/core/pull/6804))

## [78.0.1]

### Changed

- Bump `@metamask/multichain-account-service` from `^1.5.0` to `^1.6.0` ([#6786](https://github.com/MetaMask/core/pull/6786))

### Fixed

- Fix duplicate native token entries in `AccountsApiBalanceFetcher` by ensuring consistent address checksumming ([#6794](https://github.com/MetaMask/core/pull/6794))

## [78.0.0]

### Added

- add `platform` property to `TokenBalancesController` to send better analytics for which platform is hitting out APIs ([#6768](https://github.com/MetaMask/core/pull/6768))

### Changed

- **BREAKING:** Change `accountsApiChainIds` parameter from `ChainIdHex[]` to `() => ChainIdHex[]` in both `AccountTrackerController` and `TokenBalancesController` ([#6776](https://github.com/MetaMask/core/pull/6776))

  - Enables dynamic configuration of chains that should use Accounts API strategy
  - Allows runtime determination of supported chain IDs instead of static array

### Fixed

- Fix staked balance update on the `TokenBalancesController` , it's now filtered by supported chains ([#6776](https://github.com/MetaMask/core/pull/6776))

## [77.0.2]

### Changed

- Bump `@metamask/multichain-account-service` from `^1.2.0` to `^1.3.0` ([#6748](https://github.com/MetaMask/core/pull/6748))

### Fixed

- Fix token balance updates not respecting account selection parameter ([#6738](https://github.com/MetaMask/core/pull/6738))

## [77.0.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

### Fixed

- Fix unnecessary balance updates in `TokenBalancesController` by skipping updates when values haven't changed ([#6743](https://github.com/MetaMask/core/pull/6743))
  - Prevents unnecessary state mutations for token balances when values are identical
  - Improves performance by reducing redundant processing and re-renders

## [77.0.0]

### Changed

- **BREAKING:** Rename `openSeaEnabled` to `displayNftMedia` in `NftController` ([#4774](https://github.com/MetaMask/core/pull/4774))
  - Ensure compatibility for extension preferences controller state
- **BREAKING:** Remove `setApiKey` function and `openSeaApiKey` from `NftController` since opensea is not used anymore for NFT data ([#4774](https://github.com/MetaMask/core/pull/4774))
- Bump `@metamask/phishing-controller` from `^13.1.0` to `^14.0.0` ([#6716](https://github.com/MetaMask/core/pull/6716), [#6629](https://github.com/MetaMask/core/pull/6716))
- Bump `@metamask/preferences-controller` from `^19.0.0` to `^20.0.0` ([#6716](https://github.com/MetaMask/core/pull/6716), [#6629](https://github.com/MetaMask/core/pull/6716))

## [76.0.0]

### Added

- Add generic number formatter ([#6664](https://github.com/MetaMask/core/pull/6664))
  - The new formatter is available as the `formatNumber` property on the return value of `createFormatters`.

### Changed

- **BREAKING:** Bump peer dependency `@metamask/account-tree-controller` from `^0.7.0` to `^1.0.0` ([#6652](https://github.com/MetaMask/core/pull/6652), [#6676](https://github.com/MetaMask/core/pull/6676))

## [75.2.0]

### Added

- Add `Monad Mainnet` support ([#6618](https://github.com/MetaMask/core/pull/6618))

  - Add `Monad Mainnet` balance scan contract address in `SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID`
  - Add `Monad Mainnet` in `SupportedTokenDetectionNetworks`
  - Add `Monad Mainnet` in `SUPPORTED_CHAIN_IDS`

### Changed

- Bump `@metamask/controller-utils` from `^11.13.0` to `^11.14.0` ([#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

### Fixed

- Fix `TokenBalancesController` selective session stopping to prevent old polling sessions from interfering with new ones when chain configurations change ([#6635](https://github.com/MetaMask/core/pull/6635))

## [75.1.0]

### Added

- Shared fiat currency and token formatters ([#6577](https://github.com/MetaMask/core/pull/6577))

### Changed

- Add `queryAllAccounts` parameter support to `AccountTrackerController.refresh()`, `AccountTrackerController._executePoll()`, and `TokenBalancesController.updateBalances()` for flexible account selection during balance updates ([#6600](https://github.com/MetaMask/core/pull/6600))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.13.0` ([#6620](https://github.com/MetaMask/core/pull/6620))

## [75.0.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6472](https://github.com/MetaMask/core/pull/6472))

### Changed

- **BREAKING:** Replace `useAccountAPI` boolean with `accountsApiChainIds` array in `TokenBalancesController` for granular per-chain Accounts API configuration ([#6487](https://github.com/MetaMask/core/pull/6487))
- Bump `@metamask/keyring-api` from `^20.1.0` to `^21.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))

## [74.3.3]

### Changed

- Enhance `TokenBalancesController` with internal dynamic polling per chain support, enabling configurable polling intervals for different networks with automatic interval grouping for improved performance (transparent to existing API) ([#6357](https://github.com/MetaMask/core/pull/6357))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.3.0` ([#6465](https://github.com/MetaMask/core/pull/6465))

## [74.3.2]

### Changed

- Refactor `AccountTrackerController` to eliminate duplicate code by replacing custom `AccountTrackerRpcBalanceFetcher` with existing `RpcBalanceFetcher` ([#6425](https://github.com/MetaMask/core/pull/6425))

## [74.3.1]

### Fixed

- Fix values returned from multicall fetcher to use the correct BN type, not BigNumber ([#6411](https://github.com/MetaMask/core/pull/6411))

- Ensure every access to the state of `AccountTrackerController` is done with a checksumed address ([#6411](https://github.com/MetaMask/core/pull/6411))

- Ensure the balance passed to update `AccountTrackerController:updateNativeBalances` is of type `Hex` ([#6411](https://github.com/MetaMask/core/pull/6411))

## [74.3.0]

### Added

- Add native and staked balances to assets calculations ([#6399](https://github.com/MetaMask/core/pull/6399))

## [74.2.0]

### Added

- Add `rawBalance` to the result of `selectAssetsBySelectedAccountGroup` ([#6398](https://github.com/MetaMask/core/pull/6398))

## [74.1.1]

### Changed

- Improve balance fetching performance and resilience by parallelizing multi-chain operations and moving timeout handling to fetchers ([#6390](https://github.com/MetaMask/core/pull/6390))

  - Replace sequential `for` loops with `Promise.allSettled` in `RpcBalanceFetcher` and `AccountTrackerController` for parallel chain processing
  - Move timeout handling from controller-level `Promise.race` to fetcher-level `safelyExecuteWithTimeout` for better error isolation
  - Add `safelyExecuteWithTimeout` to both `RpcBalanceFetcher` and `AccountsApiBalanceFetcher` to prevent individual chain timeouts from blocking other chains
  - Remove redundant timeout wrappers from `TokenBalancesController` and `AccountTrackerController`
  - Improve test coverage for timeout and error handling scenarios in all balance fetchers

## [74.1.0]

### Added

- Enable `AccountTrackerController` to fetch native balances using AccountsAPI when `allowExternalServices` is enabled ([#6369](https://github.com/MetaMask/core/pull/6369))

  - Implement native balance fetching via AccountsAPI when `useAccountsAPI` and `allowExternalServices` are both true
  - Add fallback to RPC balance fetching when external services are disabled
  - Add comprehensive test coverage for both AccountsAPI and RPC balance fetching scenarios

### Changed

- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

- Add new `accountId` field to the `Asset` type ([#6358](https://github.com/MetaMask/core/pull/6358))

### Fixed

- Uses `InternalAccount['type']` for the `Asset['type']` property ([#6358](https://github.com/MetaMask/core/pull/6358))

- Ensure that the evm addresses used to fetch balances from AccountTrackerController state is lowercase, in order to account for discrepancies between clients ([#6358](https://github.com/MetaMask/core/pull/6358))

- Prevents mutation of memoized fields used inside selectors ([#6358](https://github.com/MetaMask/core/pull/6358))

- Fix duplicate token balance entries caused by case-sensitive address comparison in `TokenBalancesController.updateBalances` ([#6354](https://github.com/MetaMask/core/pull/6354))

  - Normalize token addresses to proper EIP-55 checksum format before using as object keys to prevent the same token from appearing multiple times with different cases
  - Add comprehensive unit tests for token address normalization scenarios

- Fix TokenBalancesController timeout handling by replacing `safelyExecuteWithTimeout` with proper `Promise.race` implementation ([#6365](https://github.com/MetaMask/core/pull/6365))

  - Replace `safelyExecuteWithTimeout` which was silently swallowing timeout errors with direct `Promise.race` that properly throws
  - Reduce RPC timeout from 3 minutes to 15 seconds for better responsiveness and batch size
  - Enable proper fallback between API and RPC balance fetchers when timeouts occur

## [74.0.0]

### Added

- Added a token selector that returns list of tokens and balances for evm and multichain assets based on the selected account group ([#6226](https://github.com/MetaMask/core/pull/6226))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` from `^22.0.0` to `^23.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/preferences-controller` from `^18.0.0` to `^19.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` from `^59.0.0` to `^60.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))

## [73.3.0]

### Changed

- Bump accounts related packages ([#6309](https://github.com/MetaMask/core/pull/6309))
  - Bump `@metamask/keyring-api` from `^20.0.0` to `^20.1.0`
  - Bump `@metamask/keyring-internal-api` from `^8.0.0` to `^8.1.0`

### Fixed

- Fix precision loss in AccountsApiBalanceFetcher causing incorrect token balance conversion ([#6330](https://github.com/MetaMask/core/pull/6330))
  - Replaced floating-point arithmetic with string-based precision conversion to avoid JavaScript precision limitations

## [73.2.0]

### Added

- Implement balance change calculator and network filtering ([#6285](https://github.com/MetaMask/core/pull/6285))
  - Add core balance change calculators with period support (1d/7d/30d), network filtering, and group-level computation
- Add new utility functions for efficient balance fetching using Multicall3 ([#6212](https://github.com/MetaMask/core/pull/6212))
  - Added `aggregate3` function for direct access to Multicall3's aggregate3 method with individual failure handling
  - Added `getTokenBalancesForMultipleAddresses` function to efficiently batch ERC20 and native token balance queries for multiple addresses
  - Supports up to 300 calls per batch with automatic fallback to individual calls on unsupported chains
  - Returns organized balance data as nested maps for easy consumption by client applications

### Changed

- **BREAKING**: Improved `TokenBalancesController` performance with two-tier balance fetching strategy ([#6232](https://github.com/MetaMask/core/pull/6232))
  - Implements Accounts API as primary fetching method for supported networks (faster, more efficient)
  - Falls back to RPC calls using Multicall3's `aggregate3` for unsupported networks or API failures
  - Significantly reduces RPC calls from N individual requests to batched calls of up to 300 operations
  - Provides comprehensive network coverage with graceful degradation when services are unavailable
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))
- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))
- Bump `@metamask/transaction-controller` from `^59.1.0` to `^59.2.0` ([#6291](https://github.com/MetaMask/core/pull/6291))
- Bump `@metamask/account-tree-controller` from `^0.7.0` to `^0.8.0` ([#6273](https://github.com/MetaMask/core/pull/6273))
- Bump `@metamask/accounts-controller` from `^32.0.1` to `^32.0.2` ([#6273](https://github.com/MetaMask/core/pull/6273))
- Bump `@metamask/keyring-controller` from `^22.1.0` to `^22.1.1` ([#6273](https://github.com/MetaMask/core/pull/6273))
- Bump `@metamask/multichain-account-service` from `^0.3.0` to `^0.4.0` ([#6273](https://github.com/MetaMask/core/pull/6273))

## [73.1.0]

### Added

- Comprehensive balance selectors for multichain account groups and wallets ([#6235](https://github.com/MetaMask/core/pull/6235))

### Changed

- Bump `@metamask/keyring-api` from `^19.0.0` to `^20.0.0` ([#6248](https://github.com/MetaMask/core/pull/6248))

### Fixed

- Correct the polling rate for the DeFiPositionsController from 1 minute to 10 minutes. ([#6242](https://github.com/MetaMask/core/pull/6242))
- Fix `AccountTrackerController` to force block number update to avoid stale cached native balances ([#6250](https://github.com/MetaMask/core/pull/6250))

## [73.0.2]

### Fixed

- Use a narrow selector when listening to `CurrencyRateController:stateChange` ([#6217](https://github.com/MetaMask/core/pull/6217))
- Fixed an issue where attempting to fetch asset conversions for accounts without assets would crash the snap ([#6207](https://github.com/MetaMask/core/pull/6207))

## [73.0.1]

### Changed

- Improved `AccountTrackerController` RPC performance by batching addresses using a multicall contract ([#6099](https://github.com/MetaMask/core/pull/6099))
  - Fallbacks to single address RPC calls on chains that do not have a multicall contract.
- Improved `AssetsContractController` RPC performance by batching addresses using a multicall contract ([#6099](https://github.com/MetaMask/core/pull/6099))
  - Fallbacks to single address RPC calls on chains that do not have a multicall contract.

### Fixed

- Fix `TokenBalancesController` to force block number update to avoid stale cached balances ([#6197](https://github.com/MetaMask/core/pull/6197))

## [73.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^59.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- Improved `TokenDetectionController` token handling flow ([#6012](https://github.com/MetaMask/core/pull/6012))
  - Detected tokens are now implicitly added directly to `allTokens` instead of being added to `allDetectedTokens` first
  - This simplifies the token import flow and improves performance by eliminating the manual UI import step
  - Enhanced `TokenDetectionController` to use direct RPC calls when basic functionality is disabled ([#6012](https://github.com/MetaMask/core/pull/6012))
  - Token detection now falls back to direct RPC calls instead of API-based detection when basic functionality is turned off
- Bump `@metamask/keyring-api` from `^18.0.0` to `^19.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))

### Fixed

- Fix `TokenDetectionController` to respect the detection toggle setting ([#6012](https://github.com/MetaMask/core/pull/6012))
  - Token detection will no longer run when the detection toggle is disabled, even during user refresh operations
- Improved `CurrencyRateController` behavior when basic functionality is disabled ([#6012](https://github.com/MetaMask/core/pull/6012))
  - Disabled requests to CryptoCompare when basic functionality is turned off to avoid unnecessary API calls
- Improve error handling in `MultichainAssetsRatesController` for Snap request failures ([#6104](https://github.com/MetaMask/core/pull/6104))
  - Enhanced `#handleSnapRequest` method with detailed error logging and graceful failure recovery
  - Added null safety checks to prevent crashes when Snap requests return null
  - Controller now continues operation when individual Snap requests fail instead of crashing
  - Added comprehensive unit tests covering various error scenarios including JSON-RPC errors and network failures

## [72.0.0]

### Changed

- Update `NftController` to use properly exported `PhishingControllerBulkScanUrlsAction` type from `@metamask/phishing-controller` ([#6105](https://github.com/MetaMask/core/pull/6105))
- Bump dev dependency `@metamask/phishing-controller` to `^13.1.0` ([#6120](https://github.com/MetaMask/core/pull/6120))

## [71.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/phishing-controller` to `^13.0.0` ([#6098](https://github.com/MetaMask/core/pull/6098))

## [70.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
  - This upgrade includes performance improvements to checksum hex address normalization
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [70.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/snaps-controllers` from `^12.0.0` to `^14.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Update `MultichainAssetsRatesController` to use the new `onAssetsMarketData` handler in addition of `onAssetsConversion` to get marketData ([#6035](https://github.com/MetaMask/core/pull/6035))
  - This change improves the handler interface for fetching asset market data from Snaps
- Bump `@metamask/snaps-sdk` from `^7.1.0` to `^9.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/snaps-utils` from `^9.4.0` to `^11.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))

## [69.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^58.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/polling-controller` to `^14.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [68.2.0]

### Added

- Added `getErc20Balances` function within `TokenBalancesController` to support fetching ERC-20 token balances for a given address and token list ([#5925](https://github.com/MetaMask/core/pull/5925))
  - This modular service simplifies balance retrieval logic and can be reused across different parts of the controller

### Changed

- Bump `@metamask/transaction-controller` to `^57.3.0` ([#5954](https://github.com/MetaMask/core/pull/5954))

### Fixed

- Prevented `AccountTrackerController` from updating state with empty or unchanged account balance data during refresh ([#5942](https://github.com/MetaMask/core/pull/5942))
  - Added guards to skip state updates when fetched balances are empty or identical to existing state
  - Reduces unnecessary `stateChange` emissions and preserves previously-cached balances under network failure scenarios
- Prevented `TokenBalancesController` from updating account balance to 0 while multicall contract failed ([#5975](https://github.com/MetaMask/core/pull/5975))

## [68.1.0]

### Added

- Added Base Network for networks to track in `TokenDetectionController` ([#5902](https://github.com/MetaMask/core/pull/5902))
  - Network changes were added in `@metamask/controller-utils`
- Added Metamask pooled staking token for Ethereum Hoodi testnet ([#5855](https://github.com/MetaMask/core/pull/5855))

### Changed

- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))

## [68.0.0]

### Changed

- **BREAKING:** Update `NftController` and `NftDetectionController` to eliminate the dependency on the current chain ([#5622](https://github.com/MetaMask/core/pull/5622))
  - All functions that previously accepted networkClientId as an optional parameter now require it as a mandatory parameter.
- **BREAKING:** Add `NetworkController:findNetworkClientIdByChainId` to allowed actions in `NftController` ([#5622](https://github.com/MetaMask/core/pull/5622))
- **BREAKING:** Add `NetworkController:findNetworkClientIdByChainId` to allowed actions in `NftDetectionController` ([#5622](https://github.com/MetaMask/core/pull/5622))

## [67.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^57.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/providers` peer dependency from `^21.0.0` to `^22.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^11.0.0` to `^12.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Remove `sei` from constants `SUPPORTED_CURRENCIES` ([#5883](https://github.com/MetaMask/core/pull/5883))

## [66.0.0]

### Added

- Add optional parameter to track DeFi metrics when positions are being fetched ([#5868](https://github.com/MetaMask/core/pull/5868))
- Add phishing protection for NFT metadata URLs in `NftController` ([#5598](https://github.com/MetaMask/core/pull/5598))
  - NFT metadata URLs are now scanned for malicious content using the `PhishingController`
  - Malicious URLs in NFT metadata fields (image, externalLink, etc.) are automatically sanitized

### Changed

- **BREAKING:** Add peer dependency on `@metamask/phishing-controller` ^12.5.0 ([#5598](https://github.com/MetaMask/core/pull/5598))

## [65.0.0]

### Added

- **BREAKING:** Add event listener for `TransactionController:transactionConfirmed` on `TokenDetectionController` to trigger token detection ([#5859](https://github.com/MetaMask/core/pull/5859))

### Changed

- **BREAKING:** Add event listener for `KeyringController:accountRemoved` instead of `AccountsController:accountRemoved` in `TokenBalancesController` and `TokensController` ([#5859](https://github.com/MetaMask/core/pull/5859))

## [64.0.0]

### Added

- **BREAKING:** Add event listener for `AccountsController:accountRemoved` on `TokenBalancesController` to remove token balances for the removed account ([#5726](https://github.com/MetaMask/core/pull/5726))

- **BREAKING:** Add event listener for `AccountsController:accountRemoved` on `TokensController` to remove tokens for the removed account ([#5726](https://github.com/MetaMask/core/pull/5726))

- **BREAKING:** Add `listAccounts` action to `TokensController` ([#5726](https://github.com/MetaMask/core/pull/5726))

- **BREAKING:** Add `listAccounts` action to `TokenBalancesController` ([#5726](https://github.com/MetaMask/core/pull/5726))

### Changed

- TokenBalancesController will now check if balances has changed before updating the state ([#5726](https://github.com/MetaMask/core/pull/5726))

## [63.1.0]

### Changed

- Added optional `account` parameter to `fetchHistoricalPricesForAsset` method in `MultichainAssetsRatesController` ([#5833](https://github.com/MetaMask/core/pull/5833))
- Updated `TokenListController` `fetchTokenList` method to bail if cache is valid ([#5804](https://github.com/MetaMask/core/pull/5804))
  - also cleaned up internal state update logic
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

## [63.0.0]

### Changed

- **BREAKING:** bump `@metamask/keyring-controller` peer dependency to `^22.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/preferences-controller` peer dependency to `^18.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/transaction-controller` peer dependency to `^56.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))

## [62.0.0]

### Added

- Add event `MultichainAssetsController:accountAssetListUpdated` in MultichainAssetsController to notify when new assets are detected for an account ([#5761](https://github.com/MetaMask/core/pull/5761))

### Changed

- **BREAKING:** Removed subscription to `MultichainAssetsController:stateChange` in `MultichainAssetsRatesController` and add subscription to `MultichainAssetsController:accountAssetListUpdated` ([#5761](https://github.com/MetaMask/core/pull/5761))
- **BREAKING:** Removed subscription to `MultichainAssetsController:stateChange` in `MultichainBalancesController` and add subscription to `MultichainAssetsController:accountAssetListUpdated` ([#5761](https://github.com/MetaMask/core/pull/5761))

## [61.1.0]

### Changed

- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))
- Update `DEFI_POSITIONS_API_URL` to use the production endpoint ([#5769](https://github.com/MetaMask/core/pull/5769))

## [61.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^55.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.0.1` ([#5722](https://github.com/MetaMask/core/pull/5722))

## [60.0.0]

### Added

- Add support for 'Sonic Mainnet' chainId in the list of SUPPORTED_CHAIN_IDS. ([#5711](https://github.com/MetaMask/core/pull/5711))

### Changed

- Refactor `TokensController` to remove reliance on a single selected network ([#5659](https://github.com/MetaMask/core/pull/5659))
  - `TokensController` methods now require `networkClientId` as an explicit parameter.
  - Token management logic is fully parameterized by `chainId`, allowing multi-chain token handling and improving reliability across network changes.
  - Internal state updates and token metadata fetching are scoped to the corresponding `chainId`

### Removed

- **BREAKING:** Remove deprecated `chainId` instance property from `TokensController` ([#5659](https://github.com/MetaMask/core/pull/5659))
  - All chain context is now derived from `networkClientId` at the method level.

## [59.0.0]

### Added

- Add `SEI` network support ([#5610](https://github.com/MetaMask/core/pull/5610))
  - Add token detection support
  - Add NFT detection support

### Changed

- Refactor `TokenRatesController` to support processing multiple chains simultaneously ([#5645](https://github.com/MetaMask/core/pull/5645))
  - The controller now supports an array of chain IDs rather than a single value, simplifying the polling process by allowing iteration over all chains in a single loop
- Refactor `AccountTrackerController` to support processing multiple chains simultaneously ([#5680](https://github.com/MetaMask/core/pull/5680))
  - The controller now accepts an array of chain IDs instead of a single value, streamlining the polling process by iterating over all chains in one loop

### Removed

- **BREAKING:** Eliminate legacy network dependency handling in `TokenRatesController` ([#5645](https://github.com/MetaMask/core/pull/5645))
  - We're no longer relying on the currently selected network.
- **BREAKING:** Eliminate legacy network dependency handling in `AccountTrackerController` ([#5680](https://github.com/MetaMask/core/pull/5680))
  - We're no longer relying on the currently selected network.

## [58.0.0]

### Added

- Added `includeMarketData` to the params of the `OnAssetsConversion` handler ([#5639](https://github.com/MetaMask/core/pull/5639))
- Added `fetchHistoricalPricesForAsset` method to `MultichainAssetsRatesController` ([#5639](https://github.com/MetaMask/core/pull/5639))
- Added `getSelectedMultichainAccount` action to `multichainAssetsRatesController` ([#5639](https://github.com/MetaMask/core/pull/5639))
- Added new state field `historicalPrices` to `MultichainAssetsRatesController` ([#5639](https://github.com/MetaMask/core/pull/5639))

### Changed

- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from ^9.19.0 to ^11.0.0 ([#5639](https://github.com/MetaMask/core/pull/5639))
- **BREAKING:** Bump `@metamask/providers` peer dependency from ^18.1.0 to ^21.0.0 ([#5639](https://github.com/MetaMask/core/pull/5639))
- Bump `@metamask/snaps-utils` from ^8.10.0 to ^9.2.0 ([#5639](https://github.com/MetaMask/core/pull/5639))

## [57.0.0]

### Added

- Add a new `DeFiPositionsController` that maintains an updated list of DeFi positions for EVM accounts ([#5400](https://github.com/MetaMask/core/pull/5400))
  - Export `DeFiPositionsController`
  - Export the following types
    - `DeFiPositionsControllerState`
    - `DeFiPositionsControllerActions`
    - `DeFiPositionsControllerEvents`
    - `DeFiPositionsControllerGetStateAction`
    - `DeFiPositionsControllerStateChangeEvent`
    - `DeFiPositionsControllerMessenger`
    - `GroupedDeFiPositions`

### Changed

- **BREAKING** Add `@metamask/transaction-controller` as a peer dependency at `^54.0.0` ([#5400](https://github.com/MetaMask/core/pull/5400))

## [56.0.0]

### Changed

- Update `TokensController`, `TokenListController`, and `AccountTrackerController` to use per-chain state variants ([#5310](https://github.com/MetaMask/core/pull/5310))
- Bump `@metamask/keyring-api` to `^17.4.0` ([#5565](https://github.com/MetaMask/core/pull/5565))
- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))
  - Via this upgrade, `updateExchangeRates` now supports the MegaETH testnet

### Removed

- **BREAKING:** Remove deprecated state fields scoped to the current chain ([#5310](https://github.com/MetaMask/core/pull/5310))
  - This change removes the following state fields from the following controllers:
    - `TokensControllerState`
      - `detectedTokens` (replaced by `allDetectedTokens`)
      - `ignoredTokens` (replaced by `allIgnoredTokens`)
      - `tokens` (replaced by `allTokens`)
    - `TokenListControllerState`
      - `tokenList` (replaced by `tokensChainsCache`)
    - `AccountTrackerControllerState`
      - `accounts` (replaced by `accountsByChainId`)
  - This will require a migration in the clients to remove them from state in order to prevent unnecessary Sentry errors when updating controller state.

### Fixed

- Update token rate request key to handle when new tokens are detected inside the `TokenRatesController` ([#5531](https://github.com/MetaMask/core/pull/5311)))
- Update `CurrencyRateController` to prevent undefined or empty currencies from being queried ([#5458](https://github.com/MetaMask/core/pull/5458)))

## [55.0.1]

### Added

- Add an optional chainId argument to `addNftContract` function in NftController ([#5508](https://github.com/MetaMask/core/pull/5508))

## [55.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/polling-controller` to `^13.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [54.0.0]

### Changed

- **BREAKING**: The `detectNfts` method in the `NftDetectionController` now accepts chain IDs directly instead of networkClientId, enabling NFT detection across multiple chains simultaneously ([#5448](https://github.com/MetaMask/core/pull/5448))

### Fixed

- Fixed token address conversion in the `TokenRatesController` to correctly preserve the checksum address format without unnecessary hex conversion ([#5490](https://github.com/MetaMask/core/pull/5490))

## [53.1.1]

### Fixed

- Check if `KeyringController` is unlocked before processing account events in `MultichainBalancesController` ([#5473](https://github.com/MetaMask/core/pull/5473))
  - This is needed since some Snaps might decrypt their state which needs the `KeyringController` to be unlocked.
- Fix runtime error in NFT detection when metadata is `null` ([#5455](https://github.com/MetaMask/core/pull/5455))

## [53.1.0]

### Added

- Add token display data controller for search & discovery ([#5307](https://github.com/MetaMask/core/pull/5307))

## [53.0.0]

### Added

- Add `getAssetMetadata` action to `MultichainAssetsController` ([#5430](https://github.com/MetaMask/core/pull/5430))

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^21.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/keyring-internal-api` from `^5.0.0` to `^6.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))
- **BREAKING:** Bump `@ethereumjs/util` from `^8.1.0` to `^9.1.0` ([#5347](https://github.com/MetaMask/core/pull/5347))

## [52.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^20.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/preferences-controller` peer dependency to `^16.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- Bump `@metamask/keyring-internal-api` from `^4.0.3` to `^5.0.0` ([#5405](https://github.com/MetaMask/core/pull/5405))

### Fixed

- Fixed conversion rates for MANTLE ([#5402](https://github.com/MetaMask/core/pull/5402))

## [51.0.2]

### Fixed

- `MultichainAssetsRatesController` now skips unnecessary Snap calls when the assets list is empty ([#5370](https://github.com/MetaMask/core/pull/5370))

## [51.0.1]

### Changed

- Bump `@metamask/keyring-api"` from `^17.0.0` to `^17.2.0` ([#5366](https://github.com/MetaMask/core/pull/5366))

## [51.0.0]

### Changed

- **BREAKING:** Rename `MultiChainAssetsRatesController` to `MultichainAssetsRatesController` ([#5354](https://github.com/MetaMask/core/pull/5354))
- Bump `@metamask/utils` from `^11.1.0` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

### Fixed

- Resolved an issue where rate polling would only begin after the default 3-minute interval by manually triggering a rate update upon initialization, ensuring an immediate refresh for a better user experience ([#5364](https://github.com/MetaMask/core/pull/5364))

## [50.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^23.0.1` to `^24.0.0` ([#5318](https://github.com/MetaMask/core/pull/5318))
- Removed legacy poll function to prevent redundant polling ([#5321](https://github.com/MetaMask/core/pull/5321))

### Fixed

- Ensure that the polling is not triggered on the constructor with the initialisation of the controller ([#5321](https://github.com/MetaMask/core/pull/5321))

## [49.0.0]

### Added

- Add new `MultiChainTokensRatesController` ([#5175](https://github.com/MetaMask/core/pull/5175))
  - A controller that manages multi‑chain token conversion rates within MetaMask. Its primary goal is to periodically poll for updated conversion rates of tokens associated with non‑EVM accounts (those using Snap metadata), ensuring that the conversion data remains up‑to‑date across supported chains.
- Add `updateBalance` to MultichainBalancesController ([#5295](https://github.com/MetaMask/core/pull/5295))

### Changed

- **BREAKING:** MultichainBalancesController messenger must now allow `MultichainAssetsController:getState` action and `MultichainAssetsController:stateChange` event ([#5295](https://github.com/MetaMask/core/pull/5295))
- Update `MultichainBalancesController` to get the full list of assets from `MultichainAssetsController` state instead of only requesting the native token ([#5295](https://github.com/MetaMask/core/pull/5295))
- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/polling-controller` from `^12.0.2` to `^12.0.3` ([#5305](https://github.com/MetaMask/core/pull/5305))

### Removed

- **BREAKING:** `NETWORK_ASSETS_MAP`, `MultichainNetworks`, and `MultichainNativeAssets` are no longer exported ([#5295](https://github.com/MetaMask/core/pull/5295))

## [48.0.0]

### Added

- Add `MultichainAssetsController` for non-EVM assets ([#5138](https://github.com/MetaMask/core/pull/5138))

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^22.0.0` to `^23.0.0` ([#5292](https://github.com/MetaMask/core/pull/5292))
- Bump `@metamask/keyring-api"` from `^16.1.0` to `^17.0.0` ([#5280](https://github.com/MetaMask/core/pull/5280))
- Bump `@metamask/snaps-utils` from `^8.9.0` to `^8.10.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))
- Removed polling mechanism in the `MultichainBalancesController` and now relies on the new `AccountsController:accountBalancesUpdated` event ([#5221](https://github.com/MetaMask/core/pull/5221))

### Fixed

- The tokens state is now updated only when the `tokenChainId` matches the currently selected chain ID. ([#5257](https://github.com/MetaMask/core/pull/5257))

## [47.0.0]

### Added

- Add `onBreak` and `onDegraded` methods to `CodefiTokenPricesServiceV2` ([#5109](https://github.com/MetaMask/core/pull/5109))
  - These serve the same purpose as the `onBreak` and `onDegraded` constructor options, but align more closely with the Cockatiel policy API.

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^21.0.0` to `^22.0.0` ([#5218](https://github.com/MetaMask/core/pull/5218))
- Deprecate `ClientConfigApiService` constructor options `onBreak` and `onDegraded` in favor of methods ([#5109](https://github.com/MetaMask/core/pull/5109))
- Add `@metamask/controller-utils@^11.4.5` as a dependency ([#5109](https://github.com/MetaMask/core/pull/5109))
  - `cockatiel` should still be in the dependency tree because it's now a dependency of `@metamask/controller-utils`
- Re-introduce `@metamask/keyring-api` as a runtime dependency ([#5206](https://github.com/MetaMask/core/pull/5206))
  - This was required since the introduction of the `MultichainBalancesController`.
- Bump `@metamask/keyring-api` from `^14.0.0` to `^16.1.0` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))
- Bump `@metamask/keyring-internal-api` from `^2.0.1` to `^4.0.1` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))
- Bump `@metamask/keyring-snap-client` from `^3.0.0` to `^3.0.3` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))

## [46.0.1]

### Changed

- Bump `@metamask/keyring-api` from `^13.0.0` to `^14.0.0` ([#5177](https://github.com/MetaMask/core/pull/5177))
- Bump `@metamask/keyring-internal-api` from `^2.0.0` to `^2.0.1` ([#5177](https://github.com/MetaMask/core/pull/5177))
- Bump `@metamask/keyring-snap-client` from `^2.0.0` to `^3.0.0` ([#5177](https://github.com/MetaMask/core/pull/5177))

### Fixed

- Fix type issue in `ERC721Standard.getDetails` ([#4985](https://github.com/MetaMask/core/pull/4985))
  - The image variable now returns a string instead of a promise when the token image uses the 'ipfs://' protocol.
- Relax NFTs metadata RPC calls ([#5134](https://github.com/MetaMask/core/pull/5134))
  - We now check the number of NFTs to update against a threshold value (500) to avoid sending an excessive amount of RPC calls to fetch NFTs metadata.

## [46.0.0]

### Added

- Add new `MultichainBalancesController` ([#4965](https://github.com/MetaMask/core/pull/4965))
  - This controller has been migrated from the MetaMask extension codebase.
- Added utility function `getKeyByValue` ([#5099](https://github.com/MetaMask/core/pull/5099))

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^20.0.0` to `^21.0.0` ([#5140](https://github.com/MetaMask/core/pull/5140))
- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.1` ([#5079](https://github.com/MetaMask/core/pull/5079)), ([#5135](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/keyring-api` from `^12.0.0` to `^13.0.0` ([#5066](https://github.com/MetaMask/core/pull/5066))
- Bump `@metamask/utils` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/rpc-errors` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))

### Fixed

- Fix Mantle price when calling `fetchMultiExchangeRate` ([#5099](https://github.com/MetaMask/core/pull/5099))
- Fix multicall revert in `TokenBalancesController` ([#5083](https://github.com/MetaMask/core/pull/5083))
  - `TokenBalancesController` was fixed to fetch erc20 token balances even if there's an invalid token in state whose address does not point to a smart contract.
- Fix state changes for `ignoreTokens` for non-selected networks ([#5014](https://github.com/MetaMask/core/pull/5014))

## [45.1.2]

### Changed

- Remove use of `@metamask/keyring-api` ([#4695](https://github.com/MetaMask/core/pull/4695))
  - `@metamask/providers` and `webextension-polyfill` peer dependencies are no longer required.
- Use new `@metamask/keyring-internal-api@^1.0.0` ([#4695](https://github.com/MetaMask/core/pull/4695))
  - This package has been split out from the Keyring API. Its types are compatible with the `@metamask/keyring-api` package used previously.

## [45.1.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.3.0` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))
- Bump `@metamask/polling-controller` from `^12.0.1` to `^12.0.2` ([#5012](https://github.com/MetaMask/core/pull/5012))

### Fixed

- Make implicit peer dependencies explicit ([#4974](https://github.com/MetaMask/core/pull/4974))
  - Add the following packages as peer dependencies of this package to satisfy peer dependency requirements from other dependencies:
    - `@metamask/providers` `^18.1.0` (required by `@metamask/keyring-api`)
    - `webextension-polyfill` `^0.10.0 || ^0.11.0 || ^0.12.0` (required by `@metamask/providers`)
  - These dependencies really should be present in projects that consume this package (e.g. MetaMask clients), and this change ensures that they now are.
  - Furthermore, we are assuming that clients already use these dependencies, since otherwise it would be impossible to consume this package in its entirety or even create a working build. Hence, the addition of these peer dependencies is really a formality and should not be breaking.
- Fix `TokensController.ignoreTokens` so that if a network is provided, `allIgnoredTokens`, `allTokens`, and `allDetectedTokens` for that network no longer get corrupted with tokens from the globally selected network ([#4967](https://github.com/MetaMask/core/pull/4967))
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@metamask/abi-utils`
  - `@metamask/contract-metadata`
  - `@metamask/eth-query`
  - `@ethereumjs/util`
  - `bn.js`
  - `cockatiel`
  - `lodash`
  - `single-call-balance-checker-abi`

## [45.1.0]

### Added

- `chainIdToNativeTokenAddress` to record chains with unique (non-zero) addresses ([#4952](https://github.com/MetaMask/core/pull/4952))
- `getNativeTokenAddress()` exported function to return the correct native token address for native assets ([#4952](https://github.com/MetaMask/core/pull/4952))
- add support for all added networks when switching account for Token Detection ([#4957](https://github.com/MetaMask/core/pull/4957))

### Changed

- Update price API calls to use the native token by chain instead of relying on the zero address. ([#4952](https://github.com/MetaMask/core/pull/4952))
- Update `TokenRatesController` market data mapping to use `getNativeTokenAddress` instead of the zero address for native tokens. ([#4952](https://github.com/MetaMask/core/pull/4952))

## [45.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^18.0.0` to `^19.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^19.0.0` to `^20.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))
- **BREAKING:** Bump `@metamask/preferences-controller` peer dependency from `^14.0.0` to `^15.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))

## [44.1.0]

### Changed

- An argument `networkClientId` is added to `TokensController.ignoreTokens`, allowing tokens to be ignored on specific chains. ([#4949](https://github.com/MetaMask/core/pull/4949))

## [44.0.1]

### Changed

- Fixes an issue where the token detection was unnecessarily falling back to an RPC approach, causing redundant detections. ([#4928](https://github.com/MetaMask/core/pull/4928))

- Fixes an issue where `TokensController.addTokens` was not respecting the network client id passed to it. ([#4940](https://github.com/MetaMask/core/pull/4940))

## [44.0.0]

### Changed

- **BREAKING**: The `TokenBalancesController` state is now across all chains and accounts under the field `tokenBalances`, as a mapping from account address -> chain id -> token address -> balance. ([#4782](https://github.com/MetaMask/core/pull/4782))

- **BREAKING**: The `TokenBalancesController` now extends `StaticIntervalPollingController`, and the new polling API `startPolling` must be used to initiate polling (`startPolling`, `stopPollingByPollingToken`). ([#4782](https://github.com/MetaMask/core/pull/4782))

- **BREAKING**: `TokenBalancesController` now requires subscriptions to the `PreferencesController:stateChange` and `NetworkController:stateChange` events. And access to the `NetworkController:getNetworkClientById`, `NetworkController:getState`, `TokensController:getState`, and `PreferencesController:getState` actions. ([#4782](https://github.com/MetaMask/core/pull/4782))

- **BREAKING**: `TokensController` requires a subscription to the `NetworkController:stateChange` event. It now now removes state for chain IDs when their network is removed. ([#4782](https://github.com/MetaMask/core/pull/4782))

- `TokenRatesController` now removes state for chain IDs when their network is removed. ([#4782](https://github.com/MetaMask/core/pull/4782))

## [43.1.1]

### Changed

- Fix a bug in `TokensController.addTokens` where tokens could be added from the wrong chain. ([#4924](https://github.com/MetaMask/core/pull/4924))

## [43.1.0]

### Added

- Add Solana to the polled exchange rates ([#4914](https://github.com/MetaMask/core/pull/4914))

## [43.0.0]

### Added

- `AccountTrackerController` now tracks balances of staked ETH for each account, under the state property `stakedBalance`. ([#4879](https://github.com/MetaMask/core/pull/4879))

### Changed

- **BREAKING**: The polling input for`TokenListController` is now `{chainId: Hex}` instead of `{networkClientId: NetworkClientId}`. ([#4878](https://github.com/MetaMask/core/pull/4878))
- **BREAKING**: The polling input for`TokenDetectionController` is now `{ chainIds: Hex[]; address: string; }` instead of `{ networkClientId: NetworkClientId; address: string; }`. ([#4894](https://github.com/MetaMask/core/pull/4894))
- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^17.0.0` to `^18.0.0` ([#4195](https://github.com/MetaMask/core/pull/4195))
- **BREAKING:** Bump `@metamask/preferences-controller` peer dependency from `^13.2.0` to `^14.0.0` ([#4909](https://github.com/MetaMask/core/pull/4909), [#4915](https://github.com/MetaMask/core/pull/4915))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^18.0.0` to `^19.0.0` ([#4915](https://github.com/MetaMask/core/pull/4915))
- Bump `@metamask/controller-utils` from `^11.4.2` to `^11.4.3` ([#4195](https://github.com/MetaMask/core/pull/4195))

## [42.0.0]

### Added

- Add `resetState` method to `NftController`, `TokensController`, `TokenBalancesController` and `TokenRatesController` to reset the controller's state back to their default state ([#4880](https://github.com/MetaMask/core/pull/4880))

### Changed

- **BREAKING**: A `platform` argument must now be passed to the `TokenDetectionController` constructor, indicating whether the platform is extension or mobile. ([#4877](https://github.com/MetaMask/core/pull/4877))
- **BREAKING**: The `TokenRatesController` now accepts `{chainId: Hex}` as its polling input to `startPolling()` instead of `{networkClientId: NetworkClientId}` ([#4887](https://github.com/MetaMask/core/pull/4887))
- When the `TokenRatesController`'s subscription to `TokensController:stateChange` is fired, token prices are now updated across all chain IDs whose tokens changed, instead of just the current chain. ([#4866](https://github.com/MetaMask/core/pull/4866))
- The `TokenDetectionController` now passes a `x-metamask-clientproduct` header when calling the account API. ([#4877](https://github.com/MetaMask/core/pull/4877))

## [41.0.0]

### Changed

- **BREAKING**: The polling input accepted by `CurrencyRateController` is now an object with a `nativeCurrencies` property that is defined as a `string` array type ([#4852](https://github.com/MetaMask/core/pull/4852))
  - The `input` parameters of the controller's `_executePoll`, `_startPolling`, `onPollingComplete` methods now only accept this new polling input type.
  - The `nativeCurrency` property (`string` type) has been removed.
- **BREAKING**: `RatesController` now types the `conversionRate` and `usdConversionRate` in its state as `number` instead of `string`, to match what it was actually storing. ([#4852](https://github.com/MetaMask/core/pull/4852))
- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/controller-utils` from `^11.4.0` to `^11.4.1` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump dev dependency `@metamask/approval-controller` from `^7.1.0` to `^7.1.1` ([#4862](https://github.com/MetaMask/core/pull/4862))

## [40.0.0]

### Changed

- **BREAKING:** The CurrencyRateController polling input is now `{ nativeCurrency: string }` instead of a network client ID ([#4839](https://github.com/MetaMask/core/pull/4839))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^22.0.0` ([#4841](https://github.com/MetaMask/core/pull/4841))
- Bump `@metamask/controller-utils` to `^11.4.0` ([#4834](https://github.com/MetaMask/core/pull/4834))
- Bump `@metamask/rpc-errors` to `^7.0.1` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/utils` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

### Fixed

- Update TokenRatesController to not reset market data just after network switch but before loading new market data ([#4832](https://github.com/MetaMask/core/pull/4832))

## [39.0.0]

### Changed

- **BREAKING:** `AccountTrackerController`, `CurrencyRateController`, `TokenDetectionController`, `TokenListController`, and `TokenRatesController` now use a new polling interface that accepts the generic parameter `PollingInput` ([#4752](https://github.com/MetaMask/core/pull/4752))
- **BREAKING:** The inherited `AbstractPollingController` method `startPollingByNetworkClientId` has been renamed to `startPolling` ([#4752](https://github.com/MetaMask/core/pull/4752))
- **BREAKING:** The inherited `AbstractPollingController` method `onPollingComplete` now returns the entire input object of type `PollingInput`, instead of a network client id ([#4752](https://github.com/MetaMask/core/pull/4752))

## [38.3.0]

### Changed

- The `includeDuplicateSymbolAssets` param is removed from our api call to TokenApi ([#4768](https://github.com/MetaMask/core/pull/4768))

## [38.2.0]

### Changed

- The `TokenRatesController` now fetches token rates for all accounts, instead of just the selected account ([#4759](https://github.com/MetaMask/core/pull/4759))

## [38.1.0]

### Changed

- Parallelization of detected tokens with balance ([#4697](https://github.com/MetaMask/core/pull/4697))
- Bump accounts related packages ([#4713](https://github.com/MetaMask/core/pull/4713)), ([#4728](https://github.com/MetaMask/core/pull/4728))
  - Those packages are now built slightly differently and are part of the [accounts monorepo](https://github.com/MetaMask/accounts).
  - Bump `@metamask/keyring-api` from `^8.1.0` to `^8.1.4`

## [38.0.1]

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
- Don't update currency rates on transient errors ([#4662](https://github.com/MetaMask/core/pull/4662))
  - In `CurrencyRateController` if unexpected errors occur during requests to
    crypto compare, the conversion rate in state will remain unchanged instead
    of being set to null.
- Fix fallback conversion rate for token market data ([#4615](https://github.com/MetaMask/core/pull/4615))
  - On networks where the native currency is not ETH, token market data is now
    correctly priced in the native currency.

## [38.0.0]

### Added

- Export `MarketDataDetails` type ([#4622](https://github.com/MetaMask/core/pull/4622))

### Changed

- **BREAKING:** Narrow `TokensController` constructor option `provider` by removing `undefined` from its type signature ([#4567](https://github.com/MetaMask/core/pull/4567))
- **BREAKING:** Bump devDependency and peerDependency `@metamask/network-controller` from `^20.0.0` to `^21.0.0` ([#4618](https://github.com/MetaMask/core/pull/4618), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/polling-controller` from `^9.0.1` to `^10.0.0` ([#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/keyring-api` to version `8.1.0` ([#4594](https://github.com/MetaMask/core/pull/4594))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- Fix `RatesController` `setCryptocurrencyList` method, which was not using the correct field when updating internal state ([#4572](https://github.com/MetaMask/core/pull/4572))
- Fetch correct price for the $OMNI native currency ([#4570](https://github.com/MetaMask/core/pull/4570))
- Add public `name` property to `AssetsContractController` ([#4564](https://github.com/MetaMask/core/pull/4564))

## [37.0.0]

### Added

- Add elements to the `AssetsContractController` class: ([#4397](https://github.com/MetaMask/core/pull/4397))
  - Add class field `messagingSystem`.
  - Add getters for `ipfsGateway` and `chainId`. As corresponding setters have not been defined, these properties are not externally mutable.
- Add and export the `AssetsContractControllerMessenger` type ([#4397](https://github.com/MetaMask/core/pull/4397))
  - `AssetsContractControllerMessenger` must allow the external actions `NetworkController:getNetworkClientById`, `NetworkController:getNetworkConfigurationByNetworkClientId`, `NetworkController:getSelectedNetworkClient`, `NetworkController:getState`.
  - `AssetsContractControllerMessenger` must allow the external events `PreferencesController:stateChange`, `NetworkController:networkDidChange`.
- Add and export new types: `AssetsContractControllerActions`, `AssetsContractControllerEvents`, `AssetsContractControllerGetERC20StandardAction`, `AssetsContractControllerGetERC721StandardAction`, `AssetsContractControllerGetERC1155StandardAction`, `AssetsContractControllerGetERC20BalanceOfAction`, `AssetsContractControllerGetERC20TokenDecimalsAction`, `AssetsContractControllerGetERC20TokenNameAction`, `AssetsContractControllerGetERC721NftTokenIdAction`, `AssetsContractControllerGetERC721TokenURIAction`, `AssetsContractControllerGetERC721AssetNameAction`, `AssetsContractControllerGetERC721AssetSymbolAction`, `AssetsContractControllerGetERC721OwnerOfAction`, `AssetsContractControllerGetERC1155TokenURIAction`, `AssetsContractControllerGetERC1155BalanceOfAction`, `AssetsContractControllerTransferSingleERC1155Action`, `AssetsContractControllerGetTokenStandardAndDetailsAction`, `AssetsContractControllerGetBalancesInSingleCallAction` ([#4397](https://github.com/MetaMask/core/pull/4397))
- Add a new `setProvider` method to `AssetsContractController` ([#4397](https://github.com/MetaMask/core/pull/4397))
  - Replaces the removed `provider` setter method, and widens the `provider` function parameter type from `Provider` to `Provider | undefined`.
- Export `TokenBalancesControllerState` type ([#4535](https://github.com/MetaMask/core/pull/4535))
  - This was defined but not exported in v34.0.0.
- Add `getNFTContractInfo` method to the `NFTController` for fetching NFT Collection Metadata from the NFT API ([#4524](https://github.com/MetaMask/core/pull/4524))

### Changed

- **BREAKING:** Add required constructor option `messenger` to the `AssetsContractController` class ([#4397](https://github.com/MetaMask/core/pull/4397))
- **BREAKING:** `TokenBalancesControllerMessenger` must allow the `AssetsContractController:getERC20BalanceOf` action in addition to its previous allowed actions ([#4397](https://github.com/MetaMask/core/pull/4397))
- **BREAKING:** `NftControllerMessenger` must allow the following actions in addition to its previous allowed actions: `AssetsContractController:getERC721AssetName`, `AssetsContractController:getERC721AssetSymbol`, `AssetsContractController:getERC721TokenURI`, `AssetsContractController:getERC721OwnerOf`, `AssetsContractController:getERC1155BalanceOf`, `AssetsContractController:getERC1155TokenURI` ([#4397](https://github.com/MetaMask/core/pull/4397))
- **BREAKING:** The type of `SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID` is narrowed from `Record<Hex, string>` to the const-asserted literal properties of the `SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID` object ([#4397](https://github.com/MetaMask/core/pull/4397))
  - The index signature is restricted to the union of the enum keys of `SupportedTokenDetectionNetworks`.
  - The property value type is restricted to the type union of the addresses defined in the object.
  - The object type is constrained by `Record<Hex, string>` using the `satisfies` keyword.
- **BREAKING:** Convert the `BalanceMap` type from an `interface` into a type alias ([#4397](https://github.com/MetaMask/core/pull/4397))
  - Type aliases have an index signature of `string` by default, and are compatible with the `StateConstraint` type defined in the `@metamask/base-controller` package.
- **BREAKING:** `getIpfsCIDv1AndPath`, `getFormattedIpfsUrl` are now async functions ([#3645](https://github.com/MetaMask/core/pull/3645))
- **BREAKING:** Bump peerDependency `@metamask/accounts-controller` from `^17.0.0` to `^18.0.0` ([#4548](https://github.com/MetaMask/core/pull/4548))
- Remove `@metamask/accounts-controller`, `@metamask/approval-controller`, `@metamask/keyring-controller`, and `@metamask/preferences-controller` dependencies [#4556](https://github.com/MetaMask/core/pull/4556)
  - These were listed under `peerDependencies` already, so they were redundant as dependencies.
- Add `immer` `^9.0.6` as a new dependency ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/abi-utils` from `^2.0.2` to `^2.0.3` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.1` to `^11.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))
- Bump `multiformats` from `^9.5.2` to `^13.1.0` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/polling-controller` from `^9.0.0` to `^9.0.1` ([#4548](https://github.com/MetaMask/core/pull/4548))

### Removed

- **BREAKING:** Remove elements from the `AssetsContractController` class: ([#4397](https://github.com/MetaMask/core/pull/4397))
  - **BREAKING:** `AssetsContractController` no longer inherits from `BaseControllerV1`.
  - **BREAKING:** Remove constructor option callbacks `onPreferencesStateChange`, `onNetworkDidChange`, `getNetworkClientById`, and replace with corresponding messenger actions and events.
  - **BREAKING:** Remove class fields: `name`, `config` (along with its properties `provider`, `ipfsGateway`, `chainId`).
  - **BREAKING:** Remove methods: `getProvider`, `getChainId`.
    - Use the getters `provider` and `chainId` instead.
  - **BREAKING:** Remove the `provider` setter method.
    - Use the `setProvider` method instead.
- **BREAKING:** Remove the `getERC20BalanceOf` constructor option callback from the `TokenBalancesControllerOptions` type and the `TokenBalancesController` constructor ([#4397](https://github.com/MetaMask/core/pull/4397))
  - The messenger is expected to allow `AssetsContractController:getERC20BalanceOf` messenger action so that it can be used instead.
- **BREAKING:** Remove `NftController` constructor option callbacks: `getERC721AssetName`, `getERC721AssetSymbol`, `getERC721TokenURI`, `getERC721OwnerOf`, `getERC1155BalanceOf`, `getERC1155TokenURI` ([#4397](https://github.com/MetaMask/core/pull/4397))
  - These are accessed through the messenger instead.
- **BREAKING:** Remove the `AssetsContractConfig` type ([#4397](https://github.com/MetaMask/core/pull/4397))
- **BREAKING:** Remove export for `MISSING_PROVIDER_ERROR` ([#4397](https://github.com/MetaMask/core/pull/4397))

### Fixed

- **BREAKING:** Convert the `getERC721NftTokenId` method of the `AssetsContractController` into an async function. ([#4397](https://github.com/MetaMask/core/pull/4397))

## [36.0.0]

### Added

- Add optional `topBid` property to the `NftMetadata` type. This property must be of type `TopBid`. ([#4522](https://github.com/MetaMask/core/pull/4522))
- Add optional `floorAsk` property to the `TokenCollection` type. This property must be of type `FloorAskCollection`. ([#4522](https://github.com/MetaMask/core/pull/4522))
- Add linea mainnet support to nft detection supported networks ([#4515](https://github.com/MetaMask/core/pull/4515))
- The `Collection` type is expanded to include the following 'string'-type optional properties: `contractDeployedAt`, `creator`, `ownerCount`, and an optional property `topBid` of the type `TopBid & { sourceDomain?: string; }`. ([#4443](https://github.com/MetaMask/core/pull/4443))

### Changed

- Fetch NFT collections data from the NFT-API `Get Collections` endpoint when calling the `detectNfts` method of `NftDetectionController`, and the `updateNftMetadata` and `watchNft` methods of `NftController`. ([#4443](https://github.com/MetaMask/core/pull/4443))
- Bump `@metamask/utils` to `^9.0.0` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/rpc-errors` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))

### Fixed

- **BREAKING:** The `attributes` property of the `NftMetadata` type must be of type `Attributes[]` ([#4522](https://github.com/MetaMask/core/pull/4522))
  - The `attributes` property was added and typed as `Attributes` on `v28.0.0`.

## [35.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/network-controller` to `^20.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- Bump `@metamask/polling-controller` to `^9.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- Bump `@metamask/accounts-controller` to `^17.2.0` ([#4498](https://github.com/MetaMask/core/pull/4498))

### Fixed

- Add support for tokenURI encoded images to `NftController` methods `addNft`, `watchNft` and `updateNftMetadata` ([#4482](https://github.com/MetaMask/core/pull/4482))

## [34.0.0]

### Added

- Add `AccountTrackerControllerGetStateAction`, `AccountTrackerControllerActions`, `AccountTrackerControllerStateChangeEvent`, and `AccountTrackerControllerEvents` types ([#4407](https://github.com/MetaMask/core/pull/4407))
- Add `setIntervalLength` and `getIntervalLength` methods to `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - `setIntervalLength` replaces updating the polling interval via `configure`.

### Changed

- **BREAKING** `TokenBalancesController` messenger must allow the action `AccountsController:getSelectedAccount` and remove `PreferencesController:getState`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenDetectionController` messenger must allow the action `AccountsController:getAccount`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenDetectionController` messenger must allow the event `AccountsController:selectedEvmAccountChange` and remove `AccountsController:selectedAccountChange`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenRatesController` messenger must allow the action `AccountsController:getAccount`, `AccountsController:getSelectedAccount` and remove `PreferencesController:getState`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenRatesController` messenger must allow the event `AccountsController:selectedEvmAccountChange` and remove `PreferencesController:stateChange`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokensController` messenger must allow the action `AccountsController:getAccount`, `AccountsController:getSelectedAccount`.
- **BREAKING** `TokensController` messenger must allow the event `AccountsController:selectedEvmAccountChange`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- Upgrade AccountTrackerController to BaseControllerV2 ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** Convert `AccountInformation` from interface to type ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** Rename `AccountTrackerState` to `AccountTrackerControllerState` and convert from interface to type ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** `AccountTrackerController` now inherits from `StaticIntervalPollingController` instead of `StaticIntervalPollingControllerV1` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - The constructor now takes a single options object rather than three arguments. Some options have been removed; see later entries.
- **BREAKING:** The `AccountTrackerController` messenger must now allow the actions `PreferencesController:getState`, `NetworkController:getState`, and `NetworkController:getNetworkClientById` ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** The `refresh` method is no longer pre-bound to the controller ([#4407](https://github.com/MetaMask/core/pull/4407))
  - You may now need to pre-bind it e.g. `accountTrackerController.refresh.bind(accountTrackerController)`.
- Bump `@metamask/accounts-controller` to `^17.1.0` ([#4460](https://github.com/MetaMask/core/pull/4460))

### Removed

- **BREAKING** `TokensController` removes `selectedAddress` constructor argument. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenDetectionController` removes `selectedAddress` constructor argument. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING:** Remove `AccountTrackerConfig` type ([#4407](https://github.com/MetaMask/core/pull/4407))
  - Some of these properties have been merged into the options that the `AccountTrackerController` constructor takes.
- **BREAKING:** Remove `config` property and `configure` method from `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - The controller now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `provider`, `getMultiAccountBalancesEnabled`, `getCurrentChainId`, and `getNetworkClientById` from configuration options for `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - The provider is now obtained directly from the network controller on demand.
  - The messenger is now used in place of the callbacks.

## [33.0.0]

### Added

- **BREAKING:** Add `messenger` as a constructor option for `AccountTrackerController` ([#4225](https://github.com/MetaMask/core/pull/4225))
- **BREAKING:** Add `messenger` option to `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - This messenger must allow the actions `TokensController:getState`, `NetworkController:getNetworkClientById`, `NetworkController:getState`, and `PreferencesController:getState` and allow the events `PreferencesController:stateChange`, `TokensController:stateChange`, and `NetworkController:stateChange`.
- Add types `TokenRatesControllerGetStateAction`, `TokenRatesControllerActions`, `TokenRatesControllerStateChangeEvent`, `TokenRatesControllerEvents`, `TokenRatesControllerMessenger`([#4314](https://github.com/MetaMask/core/pull/4314))
- Add function `getDefaultTokenRatesControllerState` ([#4314](https://github.com/MetaMask/core/pull/4314))
- Add `enable` and `disable` methods to `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - These are used to stop and restart polling.
- Export `ContractExchangeRates` type ([#4314](https://github.com/MetaMask/core/pull/4314))
  - Add `AccountTrackerControllerMessenger` type
- **BREAKING:** The `NftController` messenger must now allow `AccountsController:getAccount` and `AccountsController:getSelectedAccount` as messenger actions and `AccountsController:selectedEvmAccountChange` as a messenger event ([#4221](https://github.com/MetaMask/core/pull/4221))
- **BREAKING:** `NftDetectionController` messenger must now allow `AccountsController:getSelectedAccount` as a messenger action ([#4221](https://github.com/MetaMask/core/pull/4221))
- Token price API support for mantle network ([#4376](https://github.com/MetaMask/core/pull/4376))

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/accounts-controller` to `^17.0.0` ([#4413](https://github.com/MetaMask/core/pull/4413))
- **BREAKING:** `TokenRatesController` now inherits from `StaticIntervalPollingController` instead of `StaticIntervalPollingControllerV1` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - The constructor now takes a single options object rather than three arguments. Some options have been removed; see later entries.
- **BREAKING:** Rename `TokenRatesState` to `TokenRatesControllerState`, and convert from `interface` to `type` ([#4314](https://github.com/MetaMask/core/pull/4314))
- The `NftController` now reads the selected address via the `AccountsController`, using the `AccountsController:selectedEvmAccountChange` messenger event to stay up to date ([#4221](https://github.com/MetaMask/core/pull/4221))
- `NftDetectionController` now reads the currently selected account from `AccountsController` instead of `PreferencesController` ([#4221](https://github.com/MetaMask/core/pull/4221))
- Bump `@metamask/keyring-api` to `^8.0.0` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/eth-snap-keyring` to `^4.3.1` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/keyring-controller` to `^17.1.0` ([#4413](https://github.com/MetaMask/core/pull/4413))

### Removed

- **BREAKING:** Remove `nativeCurrency`, `chainId`, `selectedAddress`, `allTokens`, and `allDetectedTokens` from configuration options for `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - The messenger is now used to obtain information from other controllers where this data was originally expected to come from.
- **BREAKING:** Remove `config` property and `configure` method from `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - The controller now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `TokenRatesConfig` type ([#4314](https://github.com/MetaMask/core/pull/4314))
  - Some of these properties have been merged into the options that `TokenRatesController` takes.
- **BREAKING:** Remove `NftController` constructor options `selectedAddress`. ([#4221](https://github.com/MetaMask/core/pull/4221))
- **BREAKING:** Remove `AccountTrackerController` constructor options `getIdentities`, `getSelectedAddress` and `onPreferencesStateChange` ([#4225](https://github.com/MetaMask/core/pull/4225))
- **BREAKING:** Remove `value` property from the data for each token in `state.marketData` ([#4364](https://github.com/MetaMask/core/pull/4364))
  - The `price` property should be used instead.

### Fixed

- Prevent unnecessary state updates when executing the `NftController`'s `updateNftMetadata` method by comparing the metadata of fetched NFTs and NFTs in state and synchronizing state updates using a mutex lock. ([#4325](https://github.com/MetaMask/core/pull/4325))
- Prevent the use of market data when not available for a given token ([#4361](https://github.com/MetaMask/core/pull/4361))
- Fix `refresh` method remaining locked indefinitely after it was run successfully. Now lock is released on successful as well as failed runs. ([#4270](https://github.com/MetaMask/core/pull/4270))
- `TokenRatesController` uses checksum instead of lowercase format for token addresses ([#4377](https://github.com/MetaMask/core/pull/4377))

## [32.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump dependency and peer dependency `@metamask/accounts-controller` to `^16.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^7.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/keyring-controller` to `^17.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/preferences-controller` to `^13.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/polling-controller` to `^8.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [31.0.0]

### Added

- **BREAKING:** The `NftDetectionController` now takes a `messenger`, which can be used for communication ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This messenger must allow the following actions `ApprovalController:addRequest`, `NetworkController:getState`, `NetworkController:getNetworkClientById`, and `PreferencesController:getState`, and must allow the events `PreferencesController:stateChange` and `NetworkController:stateChange`
- Add `NftDetectionControllerMessenger` type ([#4312](https://github.com/MetaMask/core/pull/4312))
- Add `NftControllerGetStateAction`, `NftControllerActions`, `NftControllerStateChangeEvent`, and `NftControllerEvents` types ([#4310](https://github.com/MetaMask/core/pull/4310))
- Add `NftController:getState` and `NftController:stateChange` as an available action and event to the `NftController` messenger ([#4310](https://github.com/MetaMask/core/pull/4310))

### Changed

- **BREAKING:** Change `TokensController` to inherit from `BaseController` rather than `BaseControllerV1` ([#4304](https://github.com/MetaMask/core/pull/4304))
  - The constructor now takes a single options object rather than three arguments, and all properties in `config` are now part of options.
- **BREAKING:** Rename `TokensState` type to `TokensControllerState` ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Make all `TokensController` methods and properties starting with `_` private ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Convert `Token` from `interface` to `type` ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Replace `balanceError` property in `Token` with `hasBalanceError`; update `TokenBalancesController` so that it no longer captures the error resulting from getting the balance of an ERC-20 token ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Change `NftDetectionController` to inherit from `StaticIntervalPollingController` rather than `StaticIntervalPollingControllerV1` ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The constructor now takes a single options object rather than three arguments, and all properties in `config` are now part of options.
- **BREAKING:** Convert `ApiNft`, `ApiNftContract`, `ApiNftLastSale`, and `ApiNftCreator` from `interface` to `type` ([#4312](https://github.com/MetaMask/core/pull/4312))
- **BREAKING:** Change `NftController` to inherit from `BaseController` rather than `BaseControllerV1` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - The constructor now takes a single options object rather than three arguments, and all properties in `config` are now part of options.
- **BREAKING:** Convert `Nft`, `NftContract`, and `NftMetadata` from `interface` to `type` ([#4310](https://github.com/MetaMask/core/pull/4310))
- **BREAKING:** Rename `NftState` to `NftControllerState`, and convert to `type` ([#4310](https://github.com/MetaMask/core/pull/4310))
- **BREAKING:** Rename `getDefaultNftState` to `getDefaultNftControllerState` ([#4310](https://github.com/MetaMask/core/pull/4310))
- **BREAKING:** Bump dependency and peer dependency `@metamask/accounts-controller` to `^15.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^6.0.2` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/keyring-controller` to `^16.1.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/preferences-controller` to `^12.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Change `NftDetectionController` method `detectNfts` so that `userAddress` option is optional ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This will default to the currently selected address as kept by PreferencesController.
- Bump `async-mutex` to `^0.5.0` ([#4335](https://github.com/MetaMask/core/pull/4335))
- Bump `@metamask/polling-controller` to `^7.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Removed

- **BREAKING:** Remove `config` property and `configure` method from `TokensController` ([#4304](https://github.com/MetaMask/core/pull/4304))
  - The `TokensController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `TokensController` ([#4304](https://github.com/MetaMask/core/pull/4304))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `TokensConfig` type ([#4304](https://github.com/MetaMask/core/pull/4304))
  - These properties have been merged into the options that `TokensController` takes.
- **BREAKING:** Remove `config` property and `configure` method from `TokensController` ([#4312](https://github.com/MetaMask/core/pull/4312))
  - `TokensController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `NftDetectionController` ([#4312](https://github.com/MetaMask/core/pull/4312))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `chainId` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now read the `networkClientId` from the NetworkController state through the messenger when needed.
- **BREAKING:** Remove `getNetworkClientById` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now call `NetworkController:getNetworkClientId` through the messenger object.
- **BREAKING:** Remove `onPreferencesStateChange` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now call `PreferencesController:stateChange` through the messenger object.
- **BREAKING:** Remove `onNetworkStateChange` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now read the `networkClientId` from the NetworkController state through the messenger when needed.
- **BREAKING:** Remove `getOpenSeaApiKey` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This was never used.
- **BREAKING:** Remove `getNftApi` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This was never used.
- **BREAKING:** Remove `NftDetectionConfig` type ([#4312](https://github.com/MetaMask/core/pull/4312))
  - These properties have been merged into the options that `NftDetectionController` takes.
- **BREAKING:** Remove `config` property and `configure` method from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - `NftController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `onPreferencesStateChange` as a `NftController` constructor argument ([#4310](https://github.com/MetaMask/core/pull/4310))
  - The controller will now call `PreferencesController:stateChange` through the messenger object.
- **BREAKING:** Remove `onNetworkStateChange` as a `NftController` constructor argument ([#4310](https://github.com/MetaMask/core/pull/4310))
  - The controller will now call `NetworkController:stateChange` through the messenger object.
- **BREAKING:** Remove `NftConfig` type ([#4310](https://github.com/MetaMask/core/pull/4310))
  - These properties have been merged into the options that `NftController` takes.
- **BREAKING:** Remove `config` property and `configure` method from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - `NftController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `hub` property from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Modify `TokenListController` so that tokens fetched from the API and stored in state will no longer have `storage` and `erc20` properties ([#4235](https://github.com/MetaMask/core/pull/4235))
  - These properties were never officially supported, but they were present in state anyway.

## [30.0.0]

### Added

- Adds a new field `marketData` to the state of `TokenRatesController` ([#4206](https://github.com/MetaMask/core/pull/4206))
- Adds a new `RatesController` to manage prices for non-EVM blockchains ([#4242](https://github.com/MetaMask/core/pull/4242))

### Changed

- **BREAKING:** Changed price and token API endpoints from `*.metafi.codefi.network` to `*.api.cx.metamask.io` ([#4301](https://github.com/MetaMask/core/pull/4301))
- When fetching token list for Linea Mainnet, use `occurrenceFloor` parameter of 1 instead of 3, and filter tokens to those with a `lineaTeam` aggregator or more than 3 aggregators ([#4253](https://github.com/MetaMask/core/pull/4253))
- **BREAKING:** The NftController messenger must now allow the `NetworkController:getNetworkClientById` action ([#4305](https://github.com/MetaMask/core/pull/4305))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.2` ([#4332](https://github.com/MetaMask/core/pull/4332))
- Bump `@metamask/keyring-api` to `^6.1.1` ([#4262](https://github.com/MetaMask/core/pull/4262))

### Removed

- **BREAKING:** Removed `contractExchangeRates` and `contractExchangeRatesByChainId` from the state of `TokenRatesController` ([#4206](https://github.com/MetaMask/core/pull/4206))

### Fixed

- Only update NFT state when metadata actually changes ([#4143](https://github.com/MetaMask/core/pull/4143))

## [29.0.0]

### Added

- Add token detection on 7 more networks ([#4184](https://github.com/MetaMask/core/pull/4184))
  - New supported networks are: cronos, celo, gnosis, fantom, polygon_zkevm, moonbeam, and moonriver

### Changed

- **BREAKING** Changed `NftDetectionController` constructor `options` argument ([#4178](https://github.com/MetaMask/core/pull/4178))
  - Added `options.disabled` and `options.selectedAddress` properties
- **BREAKING** Bump `@metamask/keyring-controller` peer dependency to ^16.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- **BREAKING** Bump `@metamask/accounts-controller` peer dependency to ^14.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- **BREAKING** Bump `@metamask/preferences-controller` peer dependency to ^11.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/keyring-api` to `^6.0.0` ([#4193](https://github.com/MetaMask/core/pull/4193))
- Lower number of tokens returned by API calls ([#4207](https://github.com/MetaMask/core/pull/4207))
  - Limit changed from `200` to `50`
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/approval-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/polling-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))

## [28.0.0]

### Added

- Add reservoir migration ([#4030](https://github.com/MetaMask/core/pull/4030))

### Changed

- Fix getting nft tokenURI ([#4136](https://github.com/MetaMask/core/pull/4136))
- **BREAKING** Bump peer dependency on `@metamask/keyring-controller` ([#4090](https://github.com/MetaMask/core/pull/4090))
- Fix token detection during account change ([#4133](https://github.com/MetaMask/core/pull/4133))
- Fix update nft metadata when toggles off ([#4096](https://github.com/MetaMask/core/pull/4096))
- Adds `tokenMethodIncreaseAllowance` ([#4069](https://github.com/MetaMask/core/pull/4069))
- Fix mantle token mispriced ([#4045](https://github.com/MetaMask/core/pull/4045))

## [27.2.0]

### Added

- `CodefiTokenPricesServiceV2` exports `SUPPORTED_CHAIN_IDS`, an array of chain IDs supported by Codefi Price API V2. ([#4079](https://github.com/MetaMask/core/pull/4079))

- Added `tokenURI` key to `compareNftMetadata` function to compare nft metadata entries with. ([#3856](https://github.com/MetaMask/core/pull/3856))

## [27.1.0]

### Added

- Add `updateNftMetadata` method to `NftController` to update metadata for the requested NFTs ([#4008](https://github.com/MetaMask/core/pull/4008))

## [27.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [27.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/accounts-controller` to `^12.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/approval-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/keyring-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/preferences-controller` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Relax `TokensControllerGetStateAction` and `TokensControllerStateChangeEvent` types so that they no longer constrain the `TokensController` state in the action handler and event payload to `Record<string, Json>` ([#3949](https://github.com/MetaMask/core/pull/3949))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/polling-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [26.0.0]

### Added

- **BREAKING:** `TokenDetectionController` newly subscribes to the `PreferencesController:stateChange`, `AccountsController:selectedAccountChange`, `KeyringController:lock`, and `KeyringController:unlock` events, and allows messenger actions `AccountsController:getSelectedAccount`, `NetworkController:getNetworkClientById`, `NetworkController:getNetworkConfigurationByNetworkClientId`, `NetworkController:getState`, `KeyringController:getState`, `PreferencesController:getState`, `TokenListController:getState`, `TokensController:getState`, and `TokensController:addDetectedTokens` ([#3775](https://github.com/MetaMask/core/pull/3775/), [#3923](https://github.com/MetaMask/core/pull/3923/), [#3938](https://github.com/MetaMask/core/pull/3938))
- `TokensController` now exports `TokensControllerActions`, `TokensControllerGetStateAction`, `TokensControllerAddDetectedTokensAction`, `TokensControllerEvents`, and `TokensControllerStateChangeEvent` ([#3690](https://github.com/MetaMask/core/pull/3690/))

### Changed

- **BREAKING:** Add `@metamask/accounts-controller` `^11.0.0` as dependency and peer dependency ([#3775](https://github.com/MetaMask/core/pull/3775/), [#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** Add `@metamask/keyring-controller` `^13.0.0` as dependency and peer dependency ([#3775](https://github.com/MetaMask/core/pull/3775), [#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** Bump `@metamask/preferences-controller` dependency and peer dependency to `^8.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** `TokenDetectionController` is merged with `DetectTokensController` from the `metamask-extension` repo ([#3775](https://github.com/MetaMask/core/pull/3775/), [#3923](https://github.com/MetaMask/core/pull/3923)), ([#3938](https://github.com/MetaMask/core/pull/3938))
  - **BREAKING:** `TokenDetectionController` now resets its polling interval to the default value of 3 minutes when token detection is triggered by external controller events `KeyringController:unlock`, `TokenListController:stateChange`, `PreferencesController:stateChange`, `AccountsController:selectedAccountChange`.
  - **BREAKING:** `TokenDetectionController` now refetches tokens on `NetworkController:networkDidChange` if the `networkClientId` is changed instead of `chainId`.
  - **BREAKING:** `TokenDetectionController` cannot initiate polling or token detection if `KeyringController` state is locked.
  - **BREAKING:** The `detectTokens` method input option `accountAddress` has been renamed to `selectedAddress`.
  - **BREAKING:** The `detectTokens` method now excludes tokens that are already included in the `TokensController`'s `detectedTokens` list from the batch of incoming tokens it sends to the `TokensController` `addDetectedTokens` method.
  - **BREAKING:** The constructor for `TokenDetectionController` expects a new required property `trackMetaMetricsEvent`, which defines the callback that is called in the `detectTokens` method.
  - **BREAKING:** In Mainnet, even if the `PreferenceController`'s `useTokenDetection` option is set to false, automatic token detection is performed on the legacy token list (token data from the contract-metadata repo).
  - **BREAKING:** The `TokensState` type is now defined as a type alias rather than an interface. ([#3690](https://github.com/MetaMask/core/pull/3690/))
    - This is breaking because it could affect how this type is used with other types, such as `Json`, which does not support TypeScript interfaces.
  - The constructor option `selectedAddress` no longer defaults to `''` if omitted. Instead, the correct address is assigned using the `AccountsController:getSelectedAccount` messenger action.
- **BREAKING:** Change type of `provider` property in `AssetsContractController` from `any` to `Provider` from `@metamask/network-controller` ([#3818](https://github.com/MetaMask/core/pull/3818))
- **BREAKING:** Change type of `provider` property in `TokensController` from `any` to `Provider` from `@metamask/network-controller` ([#3818](https://github.com/MetaMask/core/pull/3818))
- Bump `@metamask/approval-controller` to `^5.1.3` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/ethjs-unit` to `^0.3.0` ([#3897](https://github.com/MetaMask/core/pull/3897))
- Bump `@metamask/network-controller` to `^17.2.1` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/polling-controller` to `^5.0.1` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3970](https://github.com/MetaMask/core/pull/3970), [#3954](https://github.com/MetaMask/core/pull/3954))
- Replace `ethereumjs-util` with `@ethereumjs/util` and `bn.js` ([#3943](https://github.com/MetaMask/core/pull/3943))
- Update `CodefiTokenPricesServiceV2` so that requests to the price API now use the `No-Cache` HTTP header ([#3939](https://github.com/MetaMask/core/pull/3939))

### Removed

- **BREAKING:** `TokenDetectionController` constructor no longer accepts options `networkClientId`, `onPreferencesStateChange`, `getPreferencesState`, `getTokensState`, or `addDetectedTokens` ([#3690](https://github.com/MetaMask/core/pull/3690/), [#3775](https://github.com/MetaMask/core/pull/3775/), [#3938](https://github.com/MetaMask/core/pull/3938))
- **BREAKING:** `TokenDetectionController` no longer allows the `NetworkController:stateChange` event. ([#3775](https://github.com/MetaMask/core/pull/3775/))
  - The `NetworkController:networkDidChange` event can be used instead.
- **BREAKING:** `TokenDetectionController` constructor no longer accepts options `networkClientId`, `onPreferencesStateChange`, `getPreferencesState`, `getTokensState`, or `addDetectedTokens` ([#3690](https://github.com/MetaMask/core/pull/3690/), [#3775](https://github.com/MetaMask/core/pull/3775/), [#3938](https://github.com/MetaMask/core/pull/3938))
- **BREAKING:** `TokenBalancesController` constructor no longer accepts options `onTokensStateChange`, `getSelectedAddress` ([#3690](https://github.com/MetaMask/core/pull/3690/))

### Fixed

- `TokenDetectionController.detectTokens()` now reads the chain ID keyed state properties from `TokenListController` and `TokensController` rather than incorrectly using the globally selected state properties when a network client ID is passed ([#3914](https://github.com/MetaMask/core/pull/3914))
- Fix `PreferencesController` state listener in `NftDetectionController` so that NFT detection is not run when any preference changes, but only when NFT detection is enabled ([#3917](https://github.com/MetaMask/core/pull/3917))
- Fix `isTokenListSupportedForNetwork` so that it returns false for chain 1337 ([#3777](https://github.com/MetaMask/core/pull/3777))
  - When used in combination with `TokensController`, this makes it possible to import an ERC-20 token on a locally run chain.

## [25.0.0]

### Added

- Add Linea to price api supported chains ([#3797](https://github.com/MetaMask/core/pull/3797))

### Changed

- **BREAKING:** Convert `TokenBalancesController` to `BaseControllerV2` ([#3750](https://github.com/MetaMask/core/pull/3750))
  - The constructor parameters have changed; rather than accepting a "config" parameter for interval and tokens we now pass both values as controller options, and a "state" parameter, there is now just a single object for all constructor arguments. This object has a mandatory `messenger` and an optional `state`, `tokens`, `interval` properties a disabled property has also been added.
  - State now saves tokens balances as strings and not as a BNs.
  - Additional BN export has been removed as it was intended to be removed in the next major release.
- **BREAKING:** Bump `@metamask/approval-controller` peer dependency to `^5.1.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/preferences-controller` peer dependency to `^7.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/polling-controller` to `^5.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [24.0.0]

### Added

- Add `getDefaultTokenListState` function to `TokenListController` ([#3744](https://github.com/MetaMask/core/pull/3744))
- Add `getDefaultNftState` function to the `NftController` ([#3742](https://github.com/MetaMask/core/pull/3742))
- Add `getDefaultTokensState` function to the `TokensController` ([#3743](https://github.com/MetaMask/core/pull/3743))

### Changed

- **BREAKING:** Bump `@metamask/preferences-controller` to ^6.0.0
- Price API perf improvements ([#3753](https://github.com/MetaMask/core/pull/3753), [#3755](https://github.com/MetaMask/core/pull/3755))
  - Reduce token batch size from 100 to 30
  - Sort token addresses in query params for more cache hits

## [23.1.0]

### Added

- Add support to `CodefiTokenPricesServiceV2` for tracking degraded service ([#3691](https://github.com/MetaMask/core/pull/3691))
  - The constructor has two new options: `onDegraded` and `degradedThreshold`. `onDegraded` is an event handler for instances of degraded service (i.e. failed or slow requests), and `degradedThreshold` determines how slow a request has to be before we consider service to be degraded.

## [23.0.0]

### Added

- Add `onBreak` handler to `CodefiTokenPricesServiceV2` ([#3677](https://github.com/MetaMask/core/pull/3677))
  - This allows listening for "circuit breaks", which can indicate an outage. Useful for metrics.
- Add `fetchTokenContractExchangeRates` utility method ([#3657](https://github.com/MetaMask/core/pull/3657))
- `TokenListController` now exports a `TokenListControllerMessenger` type ([#3609](https://github.com/MetaMask/core/pull/3609)).
- `TokenDetectionController` exports types `TokenDetectionControllerMessenger`, `TokenDetectionControllerActions`, `TokenDetectionControllerGetStateAction`, `TokenDetectionControllerEvents`, `TokenDetectionControllerStateChangeEvent` ([#3609](https://github.com/MetaMask/core/pull/3609)).
- Add `enable` and `disable` methods to `TokenDetectionController`, which control whether the controller is able to make polling requests or all of its network calls are blocked. ([#3609](https://github.com/MetaMask/core/pull/3609)).
  - Note that if the controller is initiated without the `disabled` constructor option set to `false`, the `enable` method will need to be called before the controller can make polling requests in response to subscribed events.

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` dependency and peer dependency from `^5.1.0` to `^5.1.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/network-controller` dependency and peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/preferences-controller` dependency and peer dependency from `^5.0.0` to `^5.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Update `OpenSeaV2Contract` type, renaming `supply` to `total_supply` ([#3692](https://github.com/MetaMask/core/pull/3692))
- **BREAKING:** `TokenDetectionController` is upgraded to extend `BaseControllerV2` and `StaticIntervalPollingController` ([#3609](https://github.com/MetaMask/core/pull/3609)).
  - The constructor now expects an options object as its only argument, with required properties `messenger`, `networkClientId`, required callbacks `onPreferencesStateChange`, `getBalancesInSingleCall`, `addDetectedTokens`, `getTokenState`, `getPreferencesState`, and optional properties `disabled`, `interval`, `selectedAddress`.
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/polling-controller` to `^4.0.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `cockatiel` from `3.1.1` to `^3.1.2` ([#3682](https://github.com/MetaMask/core/pull/3682))
- Bump `@metamask/controller-utils` from `8.0.0` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

### Fixed

- Fix error caused by OpenSea API rename of `supply` to `total_supply` ([#3692](https://github.com/MetaMask/core/pull/3692))
- Fix `CodefiTokenPricesServiceV2` support for Shiden ([#3683](https://github.com/MetaMask/core/pull/3683))
- Improve how `CodefiTokenPricesServiceV2` handles token price update failures ([#3687](https://github.com/MetaMask/core/pull/3687))
  - Previously a single failed token price update would prevent all other token prices from updating as well. With this update, we log and error and continue when we fail to update a token price, ensuring the others still get updated.

## [22.0.0]

### Changed

- **BREAKING:** OpenSea V2 API is used instead of V1 ([#3654](https://github.com/MetaMask/core/pull/3654))
  - `NftDetectionController` constructor now requires the `NftController.getNftApi` function.
  - NFT controllers will no longer return `last_sale` information for NFTs fetched after the OpenSea V2 update

## [21.0.0]

### Added

- Add `CodefiTokenPricesServiceV2` ([#3600](https://github.com/MetaMask/core/pull/3600), [#3655](https://github.com/MetaMask/core/pull/3655), [#3655](https://github.com/MetaMask/core/pull/3655))
  - This class can be used for the new `tokenPricesService` argument for TokenRatesController. It uses a MetaMask API to fetch prices for tokens instead of CoinGecko.
  - The `CodefiTokenPricesServiceV2` will retry if the token price update fails
    - We retry each request up to 3 times using a randomized exponential backoff strategy
    - If the token price update still fails 12 times consecutively (3 update attempts, each of which has 4 calls due to retries), we stop trying for 30 minutes before we try again.
- Add polling by `networkClientId` to `AccountTrackerController` ([#3586](https://github.com/MetaMask/core/pull/3586))
  - A new state property, `accountByChainId` has been added for keeping track of account balances across chains
  - `AccountTrackerController` implements `PollingController` and can now poll by `networkClientId` via the new methods `startPollingByNetworkClientId`, `stopPollingByPollingToken`, and `stopPollingByPollingToken`.
  - `AccountTrackerController` accepts an optional `networkClientId` value on the `refresh` method
  - `AccountTrackerController` accepts an optional `networkClientId` value as the last parameter of the `syncBalanceWithAddresses` method
- Support token detection on Base and zkSync ([#3584](https://github.com/MetaMask/core/pull/3584))
- Support token detection on Arbitrum and Optimism ([#2035](https://github.com/MetaMask/core/pull/2035))

### Changed

- **BREAKING:** `TokenRatesController` now takes a required argument `tokenPricesService` ([#3600](https://github.com/MetaMask/core/pull/3600))
  - This object is responsible for fetching the prices for tokens held by this controller.
- **BREAKING:** Update signature of `TokenRatesController.updateExchangeRatesByChainId` ([#3600](https://github.com/MetaMask/core/pull/3600), [#3653](https://github.com/MetaMask/core/pull/3653))
  - Change the type of `tokenAddresses` from `string[]` to `Hex[]`
- **BREAKING:** `AccountTrackerController` constructor params object requires `getCurrentChainId` and `getNetworkClientById` hooks ([#3586](https://github.com/MetaMask/core/pull/3586))
  - These are needed for the new "polling by `networkClientId`" feature
- **BREAKING:** `AccountTrackerController` has a new required state property, `accountByChainId`([#3586](https://github.com/MetaMask/core/pull/3586))
  - This is needed to track balances accross chains. It was introduced for the "polling by `networkClientId`" feature, but is useful on its own as well.
- **BREAKING:** `AccountTrackerController` adds a mutex to `refresh` making it only possible for one call to be executed at time ([#3586](https://github.com/MetaMask/core/pull/3586))
- **BREAKING:** `TokensController.watchAsset` now performs on-chain validation of the asset's symbol and decimals, if they're defined in the contract ([#1745](https://github.com/MetaMask/core/pull/1745))
  - The `TokensController` constructor no longer accepts a `getERC20TokenName` option. It was no longer needed due to this change.
  - Add new method `_getProvider`, though this is intended for internal use and should not be called externally.
  - Additionally, if the symbol and decimals are defined in the contract, they are no longer required to be passed to `watchAsset`
- **BREAKING:** Update controllers that rely on provider to listen to `NetworkController:networkDidChange` instead of `NetworkController:stateChange` ([#3610](https://github.com/MetaMask/core/pull/3610))
  - The `networkDidChange` event is safer in cases where the provider is used because the provider is guaranteed to have been updated by the time that event is emitted. The same is not true of the `stateChange` event.
  - The following controllers now accept a `onNetworkDidChange` constructor option instead of a `onNetworkStateChange` option:
    - `TokensController`
    - `AssetsContractController`
- Update `@metamask/polling-controller` to v3 ([#3636](https://github.com/MetaMask/core/pull/3636))
  - This update adds two new methods to each polling controller: `_startPollingByNetworkClientId` and `_stopPollingByPollingTokenSetId`. These methods are intended for internal use, and should not be called directly.
  - The affected controllers are:
    - `AccountTrackerController`
    - `CurrencyRateController`
    - `NftDetectionController`
    - `TokenDetectionController`
    - `TokenListController`
    - `TokenRatesController`
- Update `@metamask/controller-utils` to v7 ([#3636](https://github.com/MetaMask/core/pull/3636))
- Update `TokenListController` to fetch prefiltered set of tokens from the API, reducing response data and removing the need for filtering logic ([#2054](https://github.com/MetaMask/core/pull/2054))
- Update `TokenRatesController` to request token rates from the Price API in batches of 100 ([#3650](https://github.com/MetaMask/core/pull/3650))
- Add dependencies `cockatiel` and `lodash` ([#3586](https://github.com/MetaMask/core/pull/3586), [#3655](https://github.com/MetaMask/core/pull/3655))

### Removed

- **BREAKING:** Remove `fetchExchangeRate` method from TokenRatesController ([#3600](https://github.com/MetaMask/core/pull/3600))
  - This method (not to be confused with `updateExchangeRate`, which is still present) was only ever intended to be used internally and should not be accessed directly.
- **BREAKING:** Remove `getChainSlug` method from TokenRatesController ([#3600](https://github.com/MetaMask/core/pull/3600))
  - This method was previously used in TokenRatesController to access the CoinGecko API. There is no equivalent.
- **BREAKING:** Remove `CoinGeckoResponse` and `CoinGeckoPlatform` types ([#3600](https://github.com/MetaMask/core/pull/3600))
  - These types were previously used in TokenRatesController to represent data returned from the CoinGecko API. There is no equivalent.
- **BREAKING:** The TokenRatesController now only supports updating and polling rates for tokens tracked by the TokensController ([#3639](https://github.com/MetaMask/core/pull/3639))
  - The `tokenAddresses` option has been removed from `startPollingByNetworkClientId`
  - The `tokenContractAddresses` option has been removed from `updateExchangeRatesByChainId`
- **BREAKING:** `TokenRatesController.fetchAndMapExchangeRates` is no longer exposed publicly ([#3621](https://github.com/MetaMask/core/pull/3621))

### Fixed

- Prevent `TokenRatesController` from making redundant token rate updates when tokens change ([#3647](https://github.com/MetaMask/core/pull/3647), [#3663](https://github.com/MetaMask/core/pull/3663))
  - Previously, token rates would be re-fetched for the globally selected network on all TokensController state changes, but now token rates are always performed for a deduplicated and normalized set of addresses, and changes to this set determine whether rates should be re-fetched.
- Prevent redundant overlapping token rate updates in `TokenRatesController` ([#3635](https://github.com/MetaMask/core/pull/3635))
- Fix `TokenRatesController` bug where the `contractExchangeRates` state would sometimes be stale after calling `updateExchangeRatesByChainId` ([#3624](https://github.com/MetaMask/core/pull/3624))
- Make `TokenRatesController.updateExchangeRatesByChainId` respect `disabled` state ([#3596](https://github.com/MetaMask/core/pull/3596))
- Fix error in `NftController` when attempt to get NFT information from on-chain fails, and ensure metadata always contains contract address and blank `name` field ([#3629](https://github.com/MetaMask/core/pull/3629))
  - When fetching on-chain NFT information fails, we now proceed with whatever we have (either the OpenSea metadata, or a blank metadata object)
  - Previously, if we were unable to retrieve NFT metadata from on-chain or OpenSea, the returned NFT metadata would be missing a `name` field and the contract address. Now the returned metadata always has those entries, though the `name` is set to `null`.
  - This affects `watchNft` and `addNft` methods

## [20.0.0]

### Added

- **BREAKING**: `TokenRatesControllerState` now has required `contractExchangeRatesByChainId` property which an object keyed by `chainId` and `nativeCurrency` ([#2015](https://github.com/MetaMask/core/pull/2015))
- **BREAKING**: `TokenRatesController` constructor params now requires `getNetworkClientById` ([#2015](https://github.com/MetaMask/core/pull/2015))
- Add types `CurrencyRateControllerEvents` and `CurrencyRateControllerActions` ([#2029](https://github.com/MetaMask/core/pull/2029))
- Add polling-related methods to TokenRatesController ([#2015](https://github.com/MetaMask/core/pull/2015))
  - `startPollingByNetworkClientId`
  - `stopPollingByPollingToken`
  - `stopAllPolling`
  - `_executePoll`
- Add `updateExchangeRatesByChainId` method to TokenRatesController ([#2015](https://github.com/MetaMask/core/pull/2015))
  - This is a lower-level version of `updateExchangeRates` that takes chain ID, native currency, and token addresses.
- `TokenRatesController` constructor params now accepts optional `interval` and `threshold` ([#2015](https://github.com/MetaMask/core/pull/2015))
- `TokenRatesController.fetchExchangeRate()` now accepts an optional `tokenAddresses` as the last parameter ([#2015](https://github.com/MetaMask/core/pull/2015))
- `TokenRatesController.getChainSlug()` now accepts an optional `chainId` parameter ([#2015](https://github.com/MetaMask/core/pull/2015))
- `TokenRatesController.fetchAndMapExchangeRates()` now accepts an optional `tokenAddresses` as the last parameter ([#2015](https://github.com/MetaMask/core/pull/2015))

### Changed

- **BREAKING:** Bump dependency on `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/approval-controller` to ^5.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/polling-controller` to ^2.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/preferences-controller` to ^5.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [19.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Add optional `networkClientId` and `userAddress` args to remaining `NftController` public methods ([#2006](https://github.com/MetaMask/core/pull/2006))
  - `watchNft`, `removeNft`, `removeAndIgnoreNft`, `removeNftContract`, `updateNftFavoriteStatus`, and `checkAndUpdateAllNftsOwnershipStatus` methods on `NftController` all now accept an optional options object argument containing `networkClientId` and `userAddress` to identify where in state to mutate.
  - **BREAKING**: `addNft` no longer accepts a `chainId` property in its options argument since this value can be retrieved by the `networkClientId` property and is therefore redundant.
  - **BREAKING**: The third and fourth arguments on NftController's `addNftVerifyOwnership` method, have been replaced with an options object containing optional properties `networkClientId`, `userAddress` and `source`. This method signature is more aligned with the options pattern for passing `networkClientId` and `userAddress` on this controller and elsewhere.
  - **BREAKING**: `checkAndUpdateSingleNftOwnershipStatus` on NftController no longer accepts a `chainId` in its options argument. This is replaced with an optional `networkClientId` property which can be used to fetch chainId.
    **\*BREAKING**: The fourth argument of the `isNftOwner` method on `NftController` is now an options object with an optional `networkClientId` property. This method signature is more aligned with the options pattern for passing `networkClientId` on this controller and elsewhere.
  - **BREAKING**: `validateWatchNft` method on `NftController` is now private.
  - **BREAKING**: `detectNfts` on `NftDetectionController` now accepts a single object argument with optional properties `networkClientId` and `userAddress`, rather than taking these as two sequential arguments.
- Bump dependency `@metamask/eth-query` from ^3.0.1 to ^4.0.0 ([#2028](https://github.com/MetaMask/core/pull/2028))
- Bump dependency on `@metamask/polling-controller` to ^1.0.2
- Bump `@metamask/utils` from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

### Fixed

- Add name and symbol to the payload returned by the `ERC1155Standard` class `getDetails` method for `ERC1155` contracts ([#1727](https://github.com/MetaMask/core/pull/1727))

## [18.0.0]

### Changed

- **BREAKING**: `CurrencyRateController` is now keyed by `nativeCurrency` (i.e. ticker) for `conversionDate`, `conversionRate`, and `usdConversionRate` in the `currencyRates` object. `nativeCurrency`, `pendingNativeCurrency`, and `pendingCurrentCurrency` have been removed.
  - ```
    export type CurrencyRateState = {
      currentCurrency: string;
      currencyRates: Record<
        string, // nativeCurrency
        {
          conversionDate: number | null;
          conversionRate: number | null;
          usdConversionRate: number | null;
        }
      >;
    };
    ```
- **BREAKING**: `CurrencyRateController` now extends `PollingController` ([#1805](https://github.com/MetaMask/core/pull/1805))
  - `start()` and `stop()` methods replaced with `startPollingByNetworkClientId()`, `stopPollingByPollingToken()`, and `stopAllPolling()`
- **BREAKING:** `CurrencyRateController` now sends the `NetworkController:getNetworkClientById` action via messaging controller ([#1805](https://github.com/MetaMask/core/pull/1805))

### Fixed

- Parallelize network requests in assets controllers for performance enhancement ([#1801](https://github.com/MetaMask/core/pull/1801))
- Fix token detection on accounts when user changes account after token detection request is inflight ([#1848](https://github.com/MetaMask/core/pull/1848))

## [17.0.0]

### Changed

- **BREAKING:** Bump dependency on `@metamask/polling-controller` to ^1.0.0
- Bump dependency and peer dependency on `@metamask/network-controller` to ^15.1.0

## [16.0.0]

### Added

- Add way to start and stop different polling sessions for the same network client ID by providing extra scoping data ([#1776](https://github.com/MetaMask/core/pull/1776))
  - Add optional second argument to `stopPollingByPollingToken` (formerly `stopPollingByNetworkClientId`)
  - Add optional second argument to `onPollingCompleteByNetworkClientId`
- Add support for token detection for Linea mainnet and Linea Goerli ([#1799](https://github.com/MetaMask/core/pull/1799))

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- **BREAKING:** Make `executePoll` in TokenListController private ([#1810](https://github.com/MetaMask/core/pull/1810))
- **BREAKING:** Update TokenListController to rename `stopPollingByNetworkClientId` to `stopPollingByPollingToken` ([#1810](https://github.com/MetaMask/core/pull/1810))
- Add missing dependency on `@metamask/polling-controller` ([#1831](https://github.com/MetaMask/core/pull/1831))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.1
- Bump dependency and peer dependency on `@metamask/preferences-controller` to ^4.4.3
- Fix support for NFT metadata stored outside IPFS ([#1772](https://github.com/MetaMask/core/pull/1772))

## [15.0.0]

### Changed

- **BREAKING**: `NftController` now expects `getNetworkClientById` in constructor options ([#1698](https://github.com/MetaMask/core/pull/1698))
- **BREAKING**: `NftController.addNft` function signature has changed ([#1698](https://github.com/MetaMask/core/pull/1698))
  - Previously
    ```
    address: string,
    tokenId: string,
    nftMetadata?: NftMetadata,
    accountParams?: {
      userAddress: string;
      chainId: Hex;
    },
    source = Source.Custom,
    ```
    now:
    ```
    tokenAddress: string,
    tokenId: string,
    {
      nftMetadata?: NftMetadata;
      chainId?: Hex; // extracts from AccountParams
      userAddress?: string // extracted from AccountParams
      source?: Source;
      networkClientId?: NetworkClientId; // new
    },
    ```
- `NftController.addNftVerifyOwnership`: Now accepts optional 3rd argument `networkClientId` which is used to fetch NFT metadata and determine by which chainId the added NFT should be stored in state. Also accepts optional 4th argument `source` used for metrics to identify the flow in which the NFT was added to the wallet. ([#1698](https://github.com/MetaMask/core/pull/1698))
- `NftController.isNftOwner`: Now accepts optional `networkClientId` which is used to instantiate the provider for the correct chain and call the NFT contract to verify ownership ([#1698](https://github.com/MetaMask/core/pull/1698))
- `NftController.addNft` will use the chainId value derived from `networkClientId` if provided ([#1698](https://github.com/MetaMask/core/pull/1698))
- `NftController.watchNft` options now accepts optional `networkClientId` which is used to fetch NFT metadata and determine by which chainId the added NFT should be stored in state ([#1698](https://github.com/MetaMask/core/pull/1698))
- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.0
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0

### Fixed

- Fix bug in TokensController where batched `addToken` overwrote each other because mutex was acquired after reading state ([#1768](https://github.com/MetaMask/core/pull/1768))

## [14.0.0]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))
- Update `@metamask/rpc-errors` to `^6.0.0` ([#1690](https://github.com/MetaMask/core/pull/1690))

### Removed

- **BREAKING:** Remove AbortController polyfill
  - This package now assumes that the AbortController global exists

## [13.0.0]

### Changed

- **BREAKING**: `TokensController` now expects `getNetworkClientById` in constructor options ([#1676](https://github.com/MetaMask/core/pull/1676))
- **BREAKING**: `TokensController.addToken` now accepts a single options object ([#1676](https://github.com/MetaMask/core/pull/1676))
  ```
    {
      address: string;
      symbol: string;
      decimals: number;
      name?: string;
      image?: string;
      interactingAddress?: string;
      networkClientId?: NetworkClientId;
    }
  ```
- **BREAKING:** Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- **CHANGED**: `TokensController.addToken` will use the chain ID value derived from state for `networkClientId` if provided ([#1676](https://github.com/MetaMask/core/pull/1676))
- **CHANGED**: `TokensController.addTokens` now accepts an optional `networkClientId` as the last parameter ([#1676](https://github.com/MetaMask/core/pull/1676))
- **CHANGED**: `TokensController.addTokens` will use the chain ID value derived from state for `networkClientId` if provided ([#1676](https://github.com/MetaMask/core/pull/1676))
- **CHANGED**: `TokensController.watchAsset` options now accepts optional `networkClientId` which is used to get the ERC-20 token name if provided ([#1676](https://github.com/MetaMask/core/pull/1676))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- Bump dependency on `@metamask/preferences-controller` to ^4.4.1 ([#1676](https://github.com/MetaMask/core/pull/1676))

## [12.0.0]

### Added

- Add `AssetsContractController` methods `getProvider`, `getChainId`, `getERC721Standard`, and `getERC1155Standard` ([#1638](https://github.com/MetaMask/core/pull/1638))

### Changed

- **BREAKING**: Add `getNetworkClientById` to `AssetsContractController` constructor options ([#1638](https://github.com/MetaMask/core/pull/1638))
- Add optional `networkClientId` parameter to various `AssetContractController` methods ([#1638](https://github.com/MetaMask/core/pull/1638))
- The affected methods are:
  - `getERC20BalanceOf`
  - `getERC20TokenDecimals`
  - `getERC20TokenName`
  - `getERC721NftTokenId`
  - `getTokenStandardAndDetails`
  - `getERC721TokenURI`
  - `getERC721AssetName`
  - `getERC721AssetSymbol`
  - `getERC721OwnerOf`
  - `getERC1155TokenURI`
  - `getERC1155BalanceOf`
  - `transferSingleERC1155`
  - `getBalancesInSingleCall`

## [11.1.0]

### Added

- Add `tokenURI` to `NftMetadata` type ([#1577](https://github.com/MetaMask/core/pull/1577))
- Populate token URL for NFT metadata under `tokenURI` ([#1577](https://github.com/MetaMask/core/pull/1577))

### Changed

- Bump dependency and peer dependency on `@metamask/approval-controller` to ^3.5.1
- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^12.1.2
- Bump dependency and peer dependency on `@metamask/preferences-controller` to ^4.4.0
- Update NftController to add fallback for when IPFS gateway is disabled ([#1577](https://github.com/MetaMask/core/pull/1577))

## [11.0.1]

### Changed

- Replace `eth-query` ^2.1.2 with `@metamask/eth-query` ^3.0.1 ([#1546](https://github.com/MetaMask/core/pull/1546))

## [11.0.0]

### Added

- Add a `stop` method to stop polling

### Changed

- **BREAKING**: New required constructor parameters for the `TokenRatesController` ([#1497](https://github.com/MetaMask/core/pull/1497), [#1511](https://github.com/MetaMask/core/pull/1511))
  - The new required parameters are `ticker`, `onSelectedAddress`, and `onPreferencesStateChange`
- **BREAKING:** Remove `onCurrencyRateStateChange` constructor parameter from `TokenRatesController` ([#1496](https://github.com/MetaMask/core/pull/1496))
- **BREAKING:** Disable `TokenRatesController` automatic polling ([#1501](https://github.com/MetaMask/core/pull/1501))
  - Polling must be started explicitly by calling the `start` method
  - The token rates are not updated upon state changes when polling is disabled.
- **BREAKING:** Replace the `poll` method with `start` ([#1501](https://github.com/MetaMask/core/pull/1501))
  - The `start` method does not offer a way to change the interval. That must be done by calling `.configure` instead
- **BREAKING:** Remove `TokenRatecontroller` setter for `chainId` and `tokens` properties ([#1505](https://github.com/MetaMask/core/pull/1505))
- Bump @metamask/abi-utils from 1.2.0 to 2.0.1 ([#1525](https://github.com/MetaMask/core/pull/1525))
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Remove unnecessary `babel-runtime` dependency ([#1504](https://github.com/MetaMask/core/pull/1504))

### Fixed

- Fix bug where token rates were incorrect after first update if initialized with a non-Ethereum selected network ([#1497](https://github.com/MetaMask/core/pull/1497))
- Fix bug where token rates would be invalid if event handlers were triggered in the wrong order ([#1496](https://github.com/MetaMask/core/pull/1496), [#1511](https://github.com/MetaMask/core/pull/1511))
- Prevent redundant token rate updates ([#1512](https://github.com/MetaMask/core/pull/1512))

## [10.0.0]

### Added

- The method `getERC20TokenName` has been added to `AssetsContractController` ([#1127](https://github.com/MetaMask/core/pull/1127))
  - This method gets the token name from the token contract

### Changed

- **BREAKING:** The tokens controller now requires `onTokenListStateChange` and `getERC20TokenName` as constructor parameters ([#1127](https://github.com/MetaMask/core/pull/1127))
  - The `getERC20TokenName` method is used to get the token name for tokens added via `wallet_watchAsset`
  - The `onTokenListStateChange` method is used to trigger a name update when the token list changes. On each change, token names are copied from the token list if they're missing from token controller state.
- **BREAKING:** The signature of the tokens controller method `addToken` has changed
  - The fourth and fifth positional parameters (`image` and `interactingAddress`) have been replaced by an `options` object
  - The new options parameter includes the `image` and `interactingAddress` properties, and a new `name` property
- The token detection controller now sets the token name when new tokens are detected ([#1127](https://github.com/MetaMask/core/pull/1127))
- The `Token` type now includes an optional `name` field ([#1127](https://github.com/MetaMask/core/pull/1127))

## [9.2.0]

### Added

- Add validation that the nft standard matches the type argument of a `wallet_watchAsset` request when type is 'ERC721' or 'ERC1155' ([#1455](https://github.com/MetaMask/core/pull/1455))

## [9.1.0]

### Added

- Add a fifth argument, `source`, to NftController's `addNft` method ([#1417](https://github.com/MetaMask/core/pull/1417))
  - This argument can be used to specify whether the NFT was detected, added manually, or suggested by a dapp

### Fixed

- Fix `watchNft` in NftController to ensure that if the network changes before the user accepts the request, the NFT is added to the chain ID and address before the request was initiated ([#1417](https://github.com/MetaMask/core/pull/1417))

## [9.0.0]

### Added

- **BREAKING**: Add required options `getSelectedAddress` and `getMultiAccountBalancesEnabled` to AccountTrackerController constructor and make use of them when refreshing account balances ([#1146](https://github.com/MetaMask/core/pull/1146))
  - Previously, the controller would refresh all account balances, but these options can be used to only refresh the currently selected account
- **BREAKING:** Add logic to support validating and adding ERC721 and ERC1155 tokens to NFTController state via `wallet_watchAsset` API. ([#1173](https://github.com/MetaMask/core/pull/1173), [#1406](https://github.com/MetaMask/core/pull/1406))
  - The `NFTController` now has a new `watchNFT` method that can be called to send a message to the `ApprovalController` and prompt the user to add an NFT to their wallet state.
  - The `NFTController` now requires an instance of a ControllerMessenger to be passed to its constructor. This is messenger is used to pass the `watchNFT` message to the `ApprovalController`.

### Changed

- Add dependency on `@ethersproject/address` ([#1173](https://github.com/MetaMask/core/pull/1173))
- Replace `eth-rpc-errors` with `@metamask/rpc-errors` ([#1173](https://github.com/MetaMask/core/pull/1173))

## [8.0.0]

### Added

- Support NFT detection on Ethereum Mainnet custom RPC endpoints ([#1360](https://github.com/MetaMask/core/pull/1360))
- Enable token detection for the Aurora network ([#1327](https://github.com/MetaMask/core/pull/1327))

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Change format of chain ID in state to 0x-prefixed hex string ([#1367](https://github.com/MetaMask/core/pull/1367))
  - The functions `isTokenDetectionSupportedForNetwork` and `formatIconUrlWithProxy` now expect a chain ID as type `Hex` rather than as a decimal `string`
  - The assets contract controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The NFT controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The NFT controller methods `addNft`, `checkAndUpdateSingleNftOwnershipStatus`, `findNftByAddressAndTokenId`, `updateNft`, and `resetNftTransactionStatusByTransactionId` now expect the chain ID to be type `Hex` rather than a decimal `string`
  - The NFT controller state properties `allNftContracts` and `allNfts` are now keyed by address and `Hex` chain ID, rather than by address and decimal `string` chain ID
    - This requires a state migration
  - The NFT detection controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The token detection controller now expects the `chainId` configuration entry as type `Hex` rather than decimal `string`
  - The token list controller now expects the `chainId` constructor parameter as type `Hex` rather than decimal `string`
  - The token list controller state property `tokensChainsCache` is now keyed by `Hex` chain ID rather than by decimal `string` chain ID.
    - This requires a state migration
  - The token rates controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The token rates controller `chainId` setter now expects the chain ID as `Hex` rather than as a decimal string
  - The tokens controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The tokens controller `addDetectedTokens` method now accepts the `chainId` property of the `detectionDetails` parameter to be of type `Hex` rather than decimal `string`.
  - The tokens controller state properties `allTokens`, `allIgnoredTokens`, and `allDetectedTokens` are now keyed by chain ID in `Hex` format rather than decimal `string`.
    - This requires a state migration
- **BREAKING:** Use approval controller for suggested assets ([#1261](https://github.com/MetaMask/core/pull/1261), [#1268](https://github.com/MetaMask/core/pull/1268))
  - The actions `ApprovalController:acceptRequest` and `ApprovalController:rejectRequest` are no longer required by the token controller messenger.
  - The `suggestedAssets` state has been removed, which means that suggested assets are no longer persisted in state
  - The return type for `watchAsset` has changed. It now returns a Promise that settles after the request has been confirmed or rejected.
- **BREAKING:** Initialize controllers with the current network ([#1361](https://github.com/MetaMask/core/pull/1361))
  - The following controllers now have a new `chainId` required constructor parameter:
    - `AssetsContractController`
    - `NftController`
    - `NftDetectionController`
    - `TokenRatesController`
    - `TokensController`
- **BREAKING:** The token list controller messenger requires the `NetworkController:stateChange` event instead of the `NetworkController:providerConfigChange` event ([#1329](https://github.com/MetaMask/core/pull/1329))
- **BREAKING:** The token list controller `onNetworkStateChange` option now has a more restrictive type ([#1329](https://github.com/MetaMask/core/pull/1329))
  - The event handler parameter type has been changed from `NetworkState | ProviderConfig` to `NetworkState`
- **BREAKING:** Update the account tracker controller `provider` type ([#1266](https://github.com/MetaMask/core/pull/1266))
  - The `provider` setter and the `provider` config entry now use our `Provider` type from `eth-query` rather than `any`
- **BREAKING:** Update`@metamask/preferences-controller` dependency and add it as a peer dependency ([#1393](https://github.com/MetaMask/core/pull/1393))
- **BREAKING:** Update `@metamask/approval-controller` and `@metamask/network-controller` dependencies and peer dependencies
- Bump @metamask/abi-utils from 1.1.0 to 1.2.0 ([#1287](https://github.com/MetaMask/core/pull/1287))
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))

### Removed

- **BREAKING:** Remove the `networkType` configuration option from the NFT detection controller, NFT controller, and tokens controller ([#1360](https://github.com/MetaMask/core/pull/1360), [#1359](https://github.com/MetaMask/core/pull/1359))
- **BREAKING:** Remove the `SuggestedAssetMeta` and `SuggestedAssetMetaBase` types from the token controller ([#1268](https://github.com/MetaMask/core/pull/1268))
- **BREAKING:** Remove the `acceptWatchAsset` and `rejectWatchAsset` methods from the token controller ([#1268](https://github.com/MetaMask/core/pull/1268))
  - Suggested assets can be accepted or rejected using the approval controller instead

## [7.0.0]

### Changed

- **BREAKING**: peerDeps: @metamask/network-controller@6.0.0->8.0.0 ([#1196](https://github.com/MetaMask/core/pull/1196))

## [6.0.0]

### Changed

- **BREAKING:** Create approval requests using `@metamask/approval-controller` ([#1166](https://github.com/MetaMask/core/pull/1166))

## [5.1.0]

### Added

- Support watching assets on a specific account ([#1124](https://github.com/MetaMask/core/pull/1124))

## [5.0.1]

### Changed

- Update `@metamask/contract-metadata` from 2.1.0 to 2.3.1 ([#1141](https://github.com/MetaMask/core/pull/1141))

## [5.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [4.0.1]

### Fixed

- Update Nft Controller to add the NFT back to its own group if we are re-importing it ([#1082](https://github.com/MetaMask/core/pull/1082))

## [4.0.0]

### Added

- Add Sepolia support to the currency rate controller ([#1041](https://github.com/MetaMask/controllers/pull/1041))
  - The currency rate controller will now treat Sepolia as a testnet, and return the Mainnet exchange rate when asked for the Sepolia exchange rate.

### Changed

- **BREAKING:** Update `@metamask/network-controller` peer dependency to v3 ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- **BREAKING:** Migrate from `metaswap` to `metafi` subdomain for OpenSea proxy and token icons API ([#1060](https://github.com/MetaMask/core/pull/1060))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update ERC20Standard to use `@metamask/abi-utils` instead of `@ethersproject/abi` ([#985](https://github.com/MetaMask/controllers/pull/985))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## Removed

- **BREAKING**: Drop support for Ropsten, Rinkeby, and Kovan ([#1041](https://github.com/MetaMask/controllers/pull/1041))
  - The currency rate controller no longer has special handling of these three networks. It used to return the Mainnet exchange rate for these three networks, but now it includes no special handling for them.
  - The NFT controller no longer supports the Rinkeby OpenSea test API.

## [3.0.1]

### Changed

- Export `isTokenDetectionSupportedForNetwork` function ([#1034](https://github.com/MetaMask/controllers/pull/1034))
- Update `@metamask/contract-metadata` from 1.35.0 to 2.1.0 ([#1013](https://github.com/MetaMask/controllers/pull/1013))

### Fixed

- Fix token controller state updates ([#1015](https://github.com/MetaMask/controllers/pull/1015))
  - Attempts to empty the list of "added", "ignored", or "detected" tokens were not saved in state correctly, resulting in that operation being undone after switching account or network.

## [3.0.0]

### Changed

- **BREAKING:** A new private property, controlled by the `start` and `stop` methods, is added to the CurrencyRateController: `enabled`. When this is false, no network requests will be made from the controller. Previously, setNativeCurrency or setCurrentCurrency would trigger a network request. That is now prevented if `enabled` is false. ([#1002](https://github.com/MetaMask/core/pull/1002))

### Fixed

- The TokenRatesController no longer overwrites the `disabled` config property passed to the constructor, allowing the controller to be instantiated with `config.disabled` set to either true or false. ([#1002](https://github.com/MetaMask/core/pull/1002))
- This package will now warn if a required package is not present ([#1003](https://github.com/MetaMask/core/pull/1003))

## [2.0.0]

### Changed

- **BREAKING:** Update `onNetworkStateChange`, a constructor option for several controllers, to take an object with a `providerConfig` property instead of `provider` ([#995](https://github.com/MetaMask/core/pull/995))
  - This affects:
    - AssetsContractController
    - NftController
    - NftDetectionController
    - TokenDetectionController
    - TokenListController
    - TokenRatesController
    - TokenController
- **BREAKING:** [TokenDetectionController] Update `getNetworkState` constructor option to take an object with `providerConfig` property rather than `providerConfig` ([#995](https://github.com/MetaMask/core/pull/995))
- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, `@metamask/network-controller`, and `@metamask/preferences-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.1]

### Fixed

- Fix race condition where some token detections can get mistakenly added to the wrong account ([#956](https://github.com/MetaMask/core/pull/956))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/assets`
    - Asset-related functions from `src/util.ts` and accompanying tests

    All changes listed after this point were applied to this package following the monorepo conversion.

### Changed

- Use Ethers for AssetsContractController ([#845](https://github.com/MetaMask/core/pull/845))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@81.0.1...HEAD
[81.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@81.0.0...@metamask/assets-controllers@81.0.1
[81.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@80.0.0...@metamask/assets-controllers@81.0.0
[80.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@79.0.1...@metamask/assets-controllers@80.0.0
[79.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@79.0.0...@metamask/assets-controllers@79.0.1
[79.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@78.0.1...@metamask/assets-controllers@79.0.0
[78.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@78.0.0...@metamask/assets-controllers@78.0.1
[78.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@77.0.2...@metamask/assets-controllers@78.0.0
[77.0.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@77.0.1...@metamask/assets-controllers@77.0.2
[77.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@77.0.0...@metamask/assets-controllers@77.0.1
[77.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@76.0.0...@metamask/assets-controllers@77.0.0
[76.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@75.2.0...@metamask/assets-controllers@76.0.0
[75.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@75.1.0...@metamask/assets-controllers@75.2.0
[75.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@75.0.0...@metamask/assets-controllers@75.1.0
[75.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.3.3...@metamask/assets-controllers@75.0.0
[74.3.3]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.3.2...@metamask/assets-controllers@74.3.3
[74.3.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.3.1...@metamask/assets-controllers@74.3.2
[74.3.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.3.0...@metamask/assets-controllers@74.3.1
[74.3.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.2.0...@metamask/assets-controllers@74.3.0
[74.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.1.1...@metamask/assets-controllers@74.2.0
[74.1.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.1.0...@metamask/assets-controllers@74.1.1
[74.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@74.0.0...@metamask/assets-controllers@74.1.0
[74.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@73.3.0...@metamask/assets-controllers@74.0.0
[73.3.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@73.2.0...@metamask/assets-controllers@73.3.0
[73.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@73.1.0...@metamask/assets-controllers@73.2.0
[73.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@73.0.2...@metamask/assets-controllers@73.1.0
[73.0.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@73.0.1...@metamask/assets-controllers@73.0.2
[73.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@73.0.0...@metamask/assets-controllers@73.0.1
[73.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@72.0.0...@metamask/assets-controllers@73.0.0
[72.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@71.0.0...@metamask/assets-controllers@72.0.0
[71.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@70.0.1...@metamask/assets-controllers@71.0.0
[70.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@70.0.0...@metamask/assets-controllers@70.0.1
[70.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@69.0.0...@metamask/assets-controllers@70.0.0
[69.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@68.2.0...@metamask/assets-controllers@69.0.0
[68.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@68.1.0...@metamask/assets-controllers@68.2.0
[68.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@68.0.0...@metamask/assets-controllers@68.1.0
[68.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@67.0.0...@metamask/assets-controllers@68.0.0
[67.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@66.0.0...@metamask/assets-controllers@67.0.0
[66.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@65.0.0...@metamask/assets-controllers@66.0.0
[65.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@64.0.0...@metamask/assets-controllers@65.0.0
[64.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@63.1.0...@metamask/assets-controllers@64.0.0
[63.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@63.0.0...@metamask/assets-controllers@63.1.0
[63.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@62.0.0...@metamask/assets-controllers@63.0.0
[62.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@61.1.0...@metamask/assets-controllers@62.0.0
[61.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@61.0.0...@metamask/assets-controllers@61.1.0
[61.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@60.0.0...@metamask/assets-controllers@61.0.0
[60.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@59.0.0...@metamask/assets-controllers@60.0.0
[59.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@58.0.0...@metamask/assets-controllers@59.0.0
[58.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@57.0.0...@metamask/assets-controllers@58.0.0
[57.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@56.0.0...@metamask/assets-controllers@57.0.0
[56.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@55.0.1...@metamask/assets-controllers@56.0.0
[55.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@55.0.0...@metamask/assets-controllers@55.0.1
[55.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@54.0.0...@metamask/assets-controllers@55.0.0
[54.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@53.1.1...@metamask/assets-controllers@54.0.0
[53.1.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@53.1.0...@metamask/assets-controllers@53.1.1
[53.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@53.0.0...@metamask/assets-controllers@53.1.0
[53.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@52.0.0...@metamask/assets-controllers@53.0.0
[52.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@51.0.2...@metamask/assets-controllers@52.0.0
[51.0.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@51.0.1...@metamask/assets-controllers@51.0.2
[51.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@51.0.0...@metamask/assets-controllers@51.0.1
[51.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@50.0.0...@metamask/assets-controllers@51.0.0
[50.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@49.0.0...@metamask/assets-controllers@50.0.0
[49.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@48.0.0...@metamask/assets-controllers@49.0.0
[48.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@47.0.0...@metamask/assets-controllers@48.0.0
[47.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@46.0.1...@metamask/assets-controllers@47.0.0
[46.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@46.0.0...@metamask/assets-controllers@46.0.1
[46.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@45.1.2...@metamask/assets-controllers@46.0.0
[45.1.2]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@45.1.1...@metamask/assets-controllers@45.1.2
[45.1.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@45.1.0...@metamask/assets-controllers@45.1.1
[45.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@45.0.0...@metamask/assets-controllers@45.1.0
[45.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@44.1.0...@metamask/assets-controllers@45.0.0
[44.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@44.0.1...@metamask/assets-controllers@44.1.0
[44.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@44.0.0...@metamask/assets-controllers@44.0.1
[44.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@43.1.1...@metamask/assets-controllers@44.0.0
[43.1.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@43.1.0...@metamask/assets-controllers@43.1.1
[43.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@43.0.0...@metamask/assets-controllers@43.1.0
[43.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@42.0.0...@metamask/assets-controllers@43.0.0
[42.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@41.0.0...@metamask/assets-controllers@42.0.0
[41.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@40.0.0...@metamask/assets-controllers@41.0.0
[40.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@39.0.0...@metamask/assets-controllers@40.0.0
[39.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@38.3.0...@metamask/assets-controllers@39.0.0
[38.3.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@38.2.0...@metamask/assets-controllers@38.3.0
[38.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@38.1.0...@metamask/assets-controllers@38.2.0
[38.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@38.0.1...@metamask/assets-controllers@38.1.0
[38.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@38.0.0...@metamask/assets-controllers@38.0.1
[38.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@37.0.0...@metamask/assets-controllers@38.0.0
[37.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@36.0.0...@metamask/assets-controllers@37.0.0
[36.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@35.0.0...@metamask/assets-controllers@36.0.0
[35.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@34.0.0...@metamask/assets-controllers@35.0.0
[34.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@33.0.0...@metamask/assets-controllers@34.0.0
[33.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@32.0.0...@metamask/assets-controllers@33.0.0
[32.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@31.0.0...@metamask/assets-controllers@32.0.0
[31.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@30.0.0...@metamask/assets-controllers@31.0.0
[30.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@29.0.0...@metamask/assets-controllers@30.0.0
[29.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@28.0.0...@metamask/assets-controllers@29.0.0
[28.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.2.0...@metamask/assets-controllers@28.0.0
[27.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.1.0...@metamask/assets-controllers@27.2.0
[27.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.0.1...@metamask/assets-controllers@27.1.0
[27.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.0.0...@metamask/assets-controllers@27.0.1
[27.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@26.0.0...@metamask/assets-controllers@27.0.0
[26.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@25.0.0...@metamask/assets-controllers@26.0.0
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@24.0.0...@metamask/assets-controllers@25.0.0
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@23.1.0...@metamask/assets-controllers@24.0.0
[23.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@23.0.0...@metamask/assets-controllers@23.1.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@22.0.0...@metamask/assets-controllers@23.0.0
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@21.0.0...@metamask/assets-controllers@22.0.0
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@20.0.0...@metamask/assets-controllers@21.0.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@19.0.0...@metamask/assets-controllers@20.0.0
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@18.0.0...@metamask/assets-controllers@19.0.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@17.0.0...@metamask/assets-controllers@18.0.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@16.0.0...@metamask/assets-controllers@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@15.0.0...@metamask/assets-controllers@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@14.0.0...@metamask/assets-controllers@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@13.0.0...@metamask/assets-controllers@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@12.0.0...@metamask/assets-controllers@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@11.1.0...@metamask/assets-controllers@12.0.0
[11.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@11.0.1...@metamask/assets-controllers@11.1.0
[11.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@11.0.0...@metamask/assets-controllers@11.0.1
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@10.0.0...@metamask/assets-controllers@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@9.2.0...@metamask/assets-controllers@10.0.0
[9.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@9.1.0...@metamask/assets-controllers@9.2.0
[9.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@9.0.0...@metamask/assets-controllers@9.1.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@8.0.0...@metamask/assets-controllers@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@7.0.0...@metamask/assets-controllers@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@6.0.0...@metamask/assets-controllers@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.1.0...@metamask/assets-controllers@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.0.1...@metamask/assets-controllers@5.1.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.0.0...@metamask/assets-controllers@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@4.0.1...@metamask/assets-controllers@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@4.0.0...@metamask/assets-controllers@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@3.0.1...@metamask/assets-controllers@4.0.0
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@3.0.0...@metamask/assets-controllers@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@2.0.0...@metamask/assets-controllers@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@1.0.1...@metamask/assets-controllers@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@1.0.0...@metamask/assets-controllers@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/assets-controllers@1.0.0
