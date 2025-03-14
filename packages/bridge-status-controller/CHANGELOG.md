# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.0.0]

### Uncategorized

- Release 327.0.0 ([#5481](https://github.com/MetaMask/core/pull/5481))
- Feat/bridge bridge status controller env config ([#5465](https://github.com/MetaMask/core/pull/5465))

### Fixed

- `@metamask/bridge-controller` dependency is no longer a peer dependency, just a direct dependency ([#5464](https://github.com/MetaMask/core/pull/5464)))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^49.0.0` ([#5471](https://github.com/MetaMask/core/pull/5471))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^48.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^5.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^47.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^4.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [3.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` to v3.0.0
- Improve `BridgeStatusController` API response validation readability by using `@metamask/superstruct` ([#5408](https://github.com/MetaMask/core/pull/5408))

## [2.0.0]

### Changed

- **BREAKING:** Change `BridgeStatusController` state structure to have all fields at root of state ([#5406](https://github.com/MetaMask/core/pull/5406))
- **BREAKING:** Redundant type `BridgeStatusState` removed from exports ([#5406](https://github.com/MetaMask/core/pull/5406))

## [1.0.0]

### Added

- Initial release ([#5317](https://github.com/MetaMask/core/pull/5317))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@7.0.0...HEAD
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@6.0.0...@metamask/bridge-status-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@5.0.0...@metamask/bridge-status-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@4.0.0...@metamask/bridge-status-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@3.0.0...@metamask/bridge-status-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@2.0.0...@metamask/bridge-status-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@1.0.0...@metamask/bridge-status-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/bridge-status-controller@1.0.0
