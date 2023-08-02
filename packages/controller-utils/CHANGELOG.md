# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.3.1]
### Changed
- Replace `eth-query` ^2.1.2 with `@metamask/eth-query` ^3.0.1 ([#1546](https://github.com/MetaMask/core/pull/1546))

## [4.3.0]
### Changed
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Remove unnecessary `babel-runtime` dependency ([#1504](https://github.com/MetaMask/core/pull/1504))

## [4.2.0]
### Added
- Add support for Linea networks ([#1423](https://github.com/MetaMask/core/pull/1423))
  - Add `LINEA_GOERLI` to `TESTNET_TICKER_SYMBOLS` map
  - Add `linea-goerli` and `linea-mainnet` to `BUILT_IN_NETWORKS` map, as well as `NetworkType`, `InfuraNetworkType`, `ChainId`, and `NetworkId `enums
  - Add `LineaGoerli` and `LineaMainnet` to `BuiltInNetworkName` enum

## [4.1.0]
### Added
- Add approval types for result pages ([#1442](https://github.com/MetaMask/core/pull/1442))

## [4.0.1]
### Changed
- Add dependencies `eth-query` and `babel-runtime` ([#1447](https://github.com/MetaMask/core/pull/1447))

### Fixed
- Fix bug where query function failed to call built-in EthQuery methods ([#1447](https://github.com/MetaMask/core/pull/1447))

## [4.0.0]
### Added
- Add constants `BuiltInNetwork` and `ChainId` ([#1354](https://github.com/MetaMask/core/pull/1354))
- Add Aurora network to the `ChainId` constant ([#1327](https://github.com/MetaMask/core/pull/1327))
- Add `InfuraNetworkType` enum ([#1264](https://github.com/MetaMask/core/pull/1264))

### Changed
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** The `isSafeChainId` chain ID parameter is now type `Hex` rather than `number` ([#1367](https://github.com/MetaMask/core/pull/1367))
- **BREAKING:** The `ChainId` enum and the `GANACHE_CHAIN_ID` constant are now formatted as 0x-prefixed hex strings rather than as decimal strings. ([#1367](https://github.com/MetaMask/core/pull/1367))
- The `query` function has improved type checks for the `ethQuery` argument ([#1266](https://github.com/MetaMask/core/pull/1266))
  - This type change could be breaking, but only if you were passing in an invalid `ethQuery` parameter. In that circumstance this would have thrown an error at runtime anyway. Effectively this should be non-breaking for any usage that isn't already broken.
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))

### Removed
- **BREAKING:** Remove `Json` type ([#1370](https://github.com/MetaMask/core/pull/1370))
- **BREAKING:** Remove `NetworksChainId` constant ([#1354](https://github.com/MetaMask/core/pull/1354))
  - Use the new `ChainId` constant or the pre-existing `NetworkId` constant instead
- **BREAKING:** Remove localhost network ([#1313](https://github.com/MetaMask/core/pull/1313))
  - Remove the entry for localhost from `BUILT_IN_NETWORKS`, `NetworkType`, `ChainId`, and `NetworksTicker`
- **BREAKING:** Remove `hasProperty` function ([#1275](https://github.com/MetaMask/core/pull/1275))
  - Use the `hasProperty` function from `@metamask/utils` instead
- **BREAKING:** Remove constants `MAINNET` and `TESTNET_TICKER_SYMBOLS` ([#1132](https://github.com/MetaMask/core/pull/1132))
  - These were actually removed in v3.1.0, but are listed here again because that release (and the minor releases following it) have been deprecated due to the breaking change
  - We didn't discover this until many releases later, which is why this happened in a minor release

## [3.4.0] [DEPRECATED]
### Added
- add WalletConnect in approval type ([#1240](https://github.com/MetaMask/core/pull/1240))

## [3.3.0] [DEPRECATED]
### Added
- Add Sign-in-with-Ethereum origin validation ([#1163](https://github.com/MetaMask/core/pull/1163))
- Add `NetworkId` enum and `NETWORK_ID_TO_ETHERS_NETWORK_NAME_MAP` constant that includes entries for each built-in Infura network ([#1170](https://github.com/MetaMask/core/pull/1170))

## [3.2.0] [DEPRECATED]
### Added
- Add `ORIGIN_METAMASK` constant ([#1166](https://github.com/MetaMask/core/pull/1166))
- Add `ApprovalType` enum ([#1174](https://github.com/MetaMask/core/pull/1174))

### Changed
- Improve return type of `toHex` ([#1195](https://github.com/MetaMask/core/pull/1195))

## [3.1.0] [DEPRECATED]
### Added
- Add SIWE detection support for PersonalMessageManager ([#1139](https://github.com/MetaMask/core/pull/1139))
- Add `NetworkType` ([#1132](https://github.com/MetaMask/core/pull/1132))
- Add `isSafeChainId` ([#1064](https://github.com/MetaMask/core/pull/1064))

### Removed
- **BREAKING:** Remove constants `MAINNET` and `TESTNET_TICKER_SYMBOLS` ([#1132](https://github.com/MetaMask/core/pull/1132))
  - We didn't discover this until many releases later, which is why this happened in a minor release

## [3.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [2.0.0]
### Added
- Add Sepolia-related constants ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Update `getBuyURL` function to return Sepolia faucet for Sepolia network ([#1041](https://github.com/MetaMask/controllers/pull/1041))

### Changed
- **BREAKING:**: Migrate from `metaswap` to `metafi` subdomain for OpenSea proxy ([#1060](https://github.com/MetaMask/core/pull/1060))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))

### Removed
- **BREAKING:** Remove all constants associated with Ropsten, Rinkeby, and Kovan ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- **BREAKING:** Remove support for Ropsten, Rinkeby, and Kovan from `getBuyUrl` function ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - `src/constants.ts` (but see below)
    - `src/util.ts` (but see below)
    - `src/util.test.ts` (but see below)
    - `NetworkType` and `NetworkChainsId` from `src/network/NetworkController.ts` (via `types.ts`)
  - `ESTIMATE_GAS_ERROR`, which used to be exported by `src/constants.ts`, is now available via the `@metamask/gas-fee-controller` package.
  - A number of functions and types that were previously exported by `src/util.ts` are now available via other packages. Here's a breakdown of these exports and their new locations:
    - `@metamask/assets-controllers`:
      - `SupportedTokenDetectionNetworks`
      - `addUrlProtocolPrefix`
      - `getFormattedIpfsUrl`
      - `getIpfsCIDv1AndPath`
      - `isTokenDetectionSupportedForNetwork`
      - `isTokenListSupportedForNetwork`
      - `removeIpfsProtocolPrefix`
      - `validateTokenToWatch`
    - `@metamask/message-manager`:
      - `normalizeMessageData`
      - `validateSignMessageData`
      - `validateTypedSignMessageDataV1`
      - `validateTypedSignMessageDataV3`
    - `@metamask/transaction-controller`:
      - `getEtherscanApiUrl`
      - `getIncreasedPriceFromExisting`
      - `getIncreasedPriceHex`
      - `handleTransactionFetch`
      - `isEIP1559Transaction`
      - `isFeeMarketEIP1559Values`
      - `isGasPriceValue`
      - `normalizeTransaction`
      - `validateGasValues`
      - `validateMinimumIncrease`
      - `validateTransaction`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.3.1...HEAD
[4.3.1]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.3.0...@metamask/controller-utils@4.3.1
[4.3.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.2.0...@metamask/controller-utils@4.3.0
[4.2.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.1.0...@metamask/controller-utils@4.2.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.0.1...@metamask/controller-utils@4.1.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.0.0...@metamask/controller-utils@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@3.4.0...@metamask/controller-utils@4.0.0
[3.4.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@3.3.0...@metamask/controller-utils@3.4.0
[3.3.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@3.2.0...@metamask/controller-utils@3.3.0
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@3.1.0...@metamask/controller-utils@3.2.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@3.0.0...@metamask/controller-utils@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@2.0.0...@metamask/controller-utils@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@1.0.0...@metamask/controller-utils@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/controller-utils@1.0.0
