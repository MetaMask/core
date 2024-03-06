# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [8.0.4]

### Changed

- Replace `ethereumjs-util` with `@ethereumjs/util` ([#3943](https://github.com/MetaMask/core/pull/3943))

## [8.0.3]

### Changed

- Bump `@metamask/ethjs-unit` to `^0.3.0` ([#3897](https://github.com/MetaMask/core/pull/3897))

## [8.0.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))

## [8.0.1]

### Changed

- There are no consumer-facing changes to this package. This version is a part of a synchronized release across all packages in our monorepo.

## [8.0.0]

### Changed

- **BREAKING**: `OPENSEA_PROXY_URL` now points to OpenSea's v2 API. `OPENSEA_API_URL` + `OPENSEA_TEST_API_URL` have been removed ([#3654](https://github.com/MetaMask/core/pull/3654))

## [7.0.0]

### Changed

- **BREAKING:** Make `safelyExecute` generic so they preserve types ([#3629](https://github.com/MetaMask/core/pull/3629))
- Update `successfulFetch` so that a URL instance can now be passed to it ([#3600](https://github.com/MetaMask/core/pull/3600))
- Update `handleFetch` so that a URL instance can now be passed to it ([#3600](https://github.com/MetaMask/core/pull/3600))

## [6.1.0]

### Added

- Add `isInfuraNetworkType` type guard for `InfuraNetworkType` ([#2055](https://github.com/MetaMask/core/pull/2055))

### Fixed

- Restore missing dependency `eth-query`([#3578](https://github.com/MetaMask/core/pull/3578))
  - This was mistakenly recategorized as a devDependency in v6.0.0

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/eth-query` to ^4.0.0 ([#2028](https://github.com/MetaMask/core/pull/2028))
  - This affects `query`: the `sendAsync` method on the given EthQuery must now have a narrower type
- Bump `@metamask/utils` from ^8.1.0 to ^8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))
- Change `BUILT_IN_NETWORKS` so that `rpc` entry now has a dummy `ticker` ([#1794](https://github.com/MetaMask/core/pull/1794))
- Replace `ethjs-unit` ^0.1.6 with `@metamask/ethjs-unit` ^0.2.1 ([#2064](https://github.com/MetaMask/core/pull/2064))

### Fixed

- Move `@metamask/eth-query` from a development dependency to a runtime dependency ([#1815](https://github.com/MetaMask/core/pull/1815))

## [5.0.2]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Move `eth-rpc-errors@^4.0.2` dependency to `@metamask/rpc-errors@^6.0.2` ([#1743](https://github.com/MetaMask/core/pull/1743))

### Fixed

- Update linea goerli explorer url ([#1666](https://github.com/MetaMask/core/pull/1666))

## [5.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [5.0.0]

### Changed

- **BREAKING**: Rename `NETWORK_ID_TO_ETHERS_NETWORK_NAME_MAP` to `CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP` ([#1633](https://github.com/MetaMask/core/pull/1633))
  - Change it to a map of `Hex` chain ID to `BuiltInNetworkName`

### Removed

- **BREAKING**: Remove `NetworkId` constant and type ([#1633](https://github.com/MetaMask/core/pull/1633))

## [4.3.2]

### Changed

- There are no consumer-facing changes to this package. This version is a part of a synchronized release across all packages in our monorepo.

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@8.0.4...HEAD
[8.0.4]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@8.0.3...@metamask/controller-utils@8.0.4
[8.0.3]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@8.0.2...@metamask/controller-utils@8.0.3
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@8.0.1...@metamask/controller-utils@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@8.0.0...@metamask/controller-utils@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@7.0.0...@metamask/controller-utils@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@6.1.0...@metamask/controller-utils@7.0.0
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@6.0.0...@metamask/controller-utils@6.1.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@5.0.2...@metamask/controller-utils@6.0.0
[5.0.2]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@5.0.1...@metamask/controller-utils@5.0.2
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@5.0.0...@metamask/controller-utils@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.3.2...@metamask/controller-utils@5.0.0
[4.3.2]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@4.3.1...@metamask/controller-utils@4.3.2
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
