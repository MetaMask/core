# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^48.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^47.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [3.0.0]

### Changed

- **BREAKING:** Switch over from `ethers` at v6 to `@ethersproject` packages at v5.7.0 for mobile compatibility ([#5416](https://github.com/MetaMask/core/pull/5416))
- Improve `BridgeController` API response validation readability by using `@metamask/superstruct` ([#5408](https://github.com/MetaMask/core/pull/5408))

## [2.0.0]

### Added

- Mobile feature flags ([#5359](https://github.com/MetaMask/core/pull/5359))

### Changed

- **BREAKING:** Change `BridgeController` state structure to have all fields at root of state ([#5406](https://github.com/MetaMask/core/pull/5406))
- **BREAKING:** Change `BridgeController` state defaults to `null` instead of `undefined` ([#5406](https://github.com/MetaMask/core/pull/5406))

## [1.0.0]

### Added

- Initial release ([#5317](https://github.com/MetaMask/core/pull/5317))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@5.0.0...HEAD
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@4.0.0...@metamask/bridge-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@3.0.0...@metamask/bridge-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@2.0.0...@metamask/bridge-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@1.0.0...@metamask/bridge-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/bridge-controller@1.0.0
