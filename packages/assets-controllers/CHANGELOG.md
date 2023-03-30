# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.0.1...HEAD
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.0.0...@metamask/assets-controllers@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@4.0.1...@metamask/assets-controllers@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@4.0.0...@metamask/assets-controllers@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@3.0.1...@metamask/assets-controllers@4.0.0
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@3.0.0...@metamask/assets-controllers@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@2.0.0...@metamask/assets-controllers@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@1.0.1...@metamask/assets-controllers@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@1.0.0...@metamask/assets-controllers@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/assets-controllers@1.0.0
