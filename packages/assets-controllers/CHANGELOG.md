# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.1]
### Changed
- Export `isTokenDetectionSupportedForNetwork` function ([#1034](https://github.com/MetaMask/controllers/pull/1034))
- Update `@metamask/contract-metadata` from 1.35.0 to 2.1.0 ([#1013](https://github.com/MetaMask/controllers/pull/1013))

### Fixed
- Fix token controller state updates ([#1015](https://github.com/MetaMask/controllers/pull/1015))
  - Attempts to empty the list of "added", "ignored", or "detected" tokens were not saved in state correctly, resulting in that operation being undone after switching account or network.

## [3.0.0]
### Changed
- **BREAKING:** A new private property, controlled by the `start` and `stop` methods, is added to the CurrencyRateController: `enabled`. When this is false, no network requests will be made from the controller. Previously, setNativeCurrency or setCurrentCurrency would trigger a network request. That is now prevented if `enabled` is false. ([#1002](https://github.com/MetaMask/controllers/pull/1002))

### Fixed
- The TokenRatesController no longer overwrites the `disabled` config property passed to the constructor, allowing the controller to be instantiated with `config.disabled` set to either true or false. ([#1002](https://github.com/MetaMask/controllers/pull/1002))
- This package will now warn if a required package is not present ([#1003](https://github.com/MetaMask/controllers/pull/1003))

## [2.0.0]
### Changed
- **BREAKING:** Update `onNetworkStateChange`, a constructor option for several controllers, to take an object with a `providerConfig` property instead of `provider` ([#995](https://github.com/MetaMask/controllers/pull/995))
  - This affects:
    - AssetsContractController
    - NftController
    - NftDetectionController
    - TokenDetectionController
    - TokenListController
    - TokenRatesController
    - TokenController
- **BREAKING:** [TokenDetectionController] Update `getNetworkState` constructor option to take an object with `providerConfig` property rather than `providerConfig` ([#995](https://github.com/MetaMask/controllers/pull/995))
- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, `@metamask/network-controller`, and `@metamask/preferences-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/controllers/pull/998))

## [1.0.1]
### Fixed
- Fix race condition where some token detections can get mistakenly added to the wrong account ([#956](https://github.com/MetaMask/controllers/pull/956))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/controllers/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/controllers/tree/v33.0.0), namely:
    - Everything in `src/assets`
    - Asset-related functions from `src/util.ts` and accompanying tests

    All changes listed after this point were applied to this package following the monorepo conversion.

### Changed
- Use Ethers for AssetsContractController ([#845](https://github.com/MetaMask/controllers/pull/845))

[Unreleased]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@3.0.1...HEAD
[3.0.1]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@3.0.0...@metamask/assets-controllers@3.0.1
[3.0.0]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@2.0.0...@metamask/assets-controllers@3.0.0
[2.0.0]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@1.0.1...@metamask/assets-controllers@2.0.0
[1.0.1]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@1.0.0...@metamask/assets-controllers@1.0.1
[1.0.0]: https://github.com/MetaMask/controllers/releases/tag/@metamask/assets-controllers@1.0.0
