# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.2]
### Changed
- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, `@metamask/network-controller`, and `@metamask/preferences-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/controllers/pull/998))
- Align with changes to `@metamask/network-controller`'s `NetworkState` type (`provider` -> `providerConfig`) ([#995](https://github.com/MetaMask/controllers/pull/995))

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

[Unreleased]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@1.0.2...HEAD
[1.0.2]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@1.0.1...@metamask/assets-controllers@1.0.2
[1.0.1]: https://github.com/MetaMask/controllers/compare/@metamask/assets-controllers@1.0.0...@metamask/assets-controllers@1.0.1
[1.0.0]: https://github.com/MetaMask/controllers/releases/tag/@metamask/assets-controllers@1.0.0
