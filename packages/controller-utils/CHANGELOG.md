# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/controllers/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/controllers/tree/v33.0.0), namely:
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

[Unreleased]: https://github.com/MetaMask/controllers/compare/@metamask/controller-utils@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/controllers/releases/tag/@metamask/controller-utils@1.0.0
