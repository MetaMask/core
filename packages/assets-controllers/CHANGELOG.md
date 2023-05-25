# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [8.0.0]
### Added
- Support NFT detection on Ethereum Mainnet custom RPC endpoints ([#1360](https://github.com/MetaMask/core/pull/1360))
- Enable token detection for the Aurora network ([#1327](https://github.com/MetaMask/core/pull/1327))

### Changed
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Update `@metamask/network-controller` peerDependency ([#1367](https://github.com/MetaMask/core/pull/1367))
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
- Bump @metamask/abi-utils from 1.1.0 to 1.2.0 ([#1287](https://github.com/MetaMask/core/pull/1287))
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))

### Removed
- **BREAKING:** Remove the `networkType` configuration option from the NFT detection controller, NFT controller, and tokens controller ([#1360](https://github.com/MetaMask/core/pull/1360), [#1359](https://github.com/MetaMask/core/pull/1359))
- **BREAKING:** Remove the `SuggestedAssetMeta` type from the token controller ([#1268](https://github.com/MetaMask/core/pull/1268))

## [7.0.0]
### Changed
- **BREAKING**: peerDeps: @metamask/network-controller@6.0.0->8.0.0 ([#1196](https://github.com/MetaMask/core/pull/1196))

## [6.0.0]
### Changed
- **BREAKING:** Create approval requests using `@metamask/approval-controller` ([#1166](https://github.com/MetaMask/core/pull/1166))
- **BREAKING:** Make `setProviderType` async ([#1191](https://github.com/MetaMask/core/pull/1191))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@8.0.0...HEAD
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
