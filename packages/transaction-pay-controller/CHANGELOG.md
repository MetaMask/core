# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.1]

### Fixed

- Fix use of native Polygon as payment token in Bridge strategy ([#7008](https://github.com/MetaMask/core/pull/7008))
  - Ignore required tokens with no quotes when calculating totals.
  - Use correct feature flag key.

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^85.0.0` to `^86.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^57.0.0` to `^58.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))
- **BREAKING:** Bump `@metamask/bridge-status-controller` from `^57.0.0` to `^58.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))

## [1.0.0]

### Added

- Initial release ([#6820](https://github.com/MetaMask/core/pull/6820))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@2.0.1...HEAD
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@2.0.0...@metamask/transaction-pay-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@1.0.0...@metamask/transaction-pay-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/transaction-pay-controller@1.0.0
