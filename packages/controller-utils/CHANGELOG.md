# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.0]
### Added
- Add SIWE detection support for PersonalMessageManager ([#1139](https://github.com/MetaMask/core/pull/1139))
- Add `NetworkType` ([#1132](https://github.com/MetaMask/core/pull/1132))
- Add `isSafeChainId` ([#1064](https://github.com/MetaMask/core/pull/1064))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@3.1.0...HEAD
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@3.0.0...@metamask/controller-utils@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@2.0.0...@metamask/controller-utils@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/controller-utils@1.0.0...@metamask/controller-utils@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/controller-utils@1.0.0
