# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [13.0.0]
### Uncategorized
- TokensController.addToken use networkClientId ([#1676](https://github.com/MetaMask/core/pull/1676))

## [12.0.0]
### Added
- Add `AssetsContractController` methods `getProvider`, `getChainId`, `getERC721Standard`, and `getERC1155Standard` ([#1638](https://github.com/MetaMask/core/pull/1638))

### Changed
- **BREAKING**: Add `getNetworkClientById` to `AssetsContractController` constructor options ([#1638](https://github.com/MetaMask/core/pull/1638))
-  Add optional `networkClientId` parameter to various `AssetContractController` methods ([#1638](https://github.com/MetaMask/core/pull/1638))
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
- **BREAKING**: Remove `onCurrencyRateStateChange` constructor parameter from `TokenRatesController` ([#1496](https://github.com/MetaMask/core/pull/1496))
- **BREAKING**: Disable `TokenRatesController` automatic polling ([#1501](https://github.com/MetaMask/core/pull/1501))
  - Polling must be started explicitly by calling the `start` method
  - The token rates are not updated upon state changes when polling is disabled.
- **BREAKING**: Replace the `poll` method with `start` ([#1501](https://github.com/MetaMask/core/pull/1501))
  - The `start` method does not offer a way to change the interval. That must be done by calling `.configure` instead
- **BREAKING**: Remove `TokenRatecontroller` setter for `chainId` and `tokens` properties ([#1505](https://github.com/MetaMask/core/pull/1505))
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
- Add dependency on `@ethersproject/address` ([#1173](https://github.com/MetaMask/core.git/pull/1173))
- Replace `eth-rpc-errors` with `@metamask/rpc-errors` ([#1173](https://github.com/MetaMask/core.git/pull/1173))

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
- **BREAKING**: Use approval controller for suggested assets ([#1261](https://github.com/MetaMask/core/pull/1261), [#1268](https://github.com/MetaMask/core/pull/1268))
  - The actions `ApprovalController:acceptRequest` and `ApprovalController:rejectRequest` are no longer required by the token controller messenger.
  - The `suggestedAssets` state has been removed, which means that suggested assets are no longer persisted in state
  - The return type for `watchAsset` has changed. It now returns a Promise that settles after the request has been confirmed or rejected.
- **BREAKING:** Initialize controllers with the current network ([#1361](https://github.com/MetaMask/core/pull/1361))
  - The following controllers now have a new `chainId` required constructor parameter:
    * `AssetsContractController`
    * `NftController`
    * `NftDetectionController`
    * `TokenRatesController`
    * `TokensController`
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@13.0.0...HEAD
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
