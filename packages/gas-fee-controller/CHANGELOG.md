# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.1]
### Changed
- Adjust types to align with new version of `NetworkController` ([#1091](https://github.com/MetaMask/core/pull/1091))

## [4.0.0]
### Changed
- **BREAKING:** Make the EIP-1559 endpoint a required argument ([#1083](https://github.com/MetaMask/core/pull/1083))

### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [3.0.0]
### Changed
- **BREAKING:** Update `@metamask/network-controller` peer dependency to v3 ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041)) 

## [2.0.1]
### Fixed
- This package will now warn if a required package is not present ([#1003](https://github.com/MetaMask/core/pull/1003))

## [2.0.0]
### Changed
- **BREAKING:** Bump `@metamask/network-controller` to 2.0.0 ([#995](https://github.com/MetaMask/core/pull/995))
  - GasFeeController now expects NetworkController to respond to the `NetworkController:providerChangeConfig` event (previously named `NetworkController:providerChange`). If you are depending directly on `@metamask/network-controller`, you should update your version to at least 2.0.0 as well.
- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, and `@metamask/network-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - Everything in `src/gas`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@4.0.1...HEAD
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@4.0.0...@metamask/gas-fee-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@3.0.0...@metamask/gas-fee-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@2.0.1...@metamask/gas-fee-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@2.0.0...@metamask/gas-fee-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@1.0.0...@metamask/gas-fee-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/gas-fee-controller@1.0.0
