# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/snaps-sdk` from `^7.1.0` to `^8.1.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/snaps-utils` from `^9.4.0` to `^10.1.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/snaps-controllers` from `^12.3.1` to `^13.1.1` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump peer dependency `@metamask/snaps-controllers` from `^12.0.0` to `^13.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))

## [0.4.0]

### Changed

- Update wallet names ([#6024](https://github.com/MetaMask/core/pull/6024))

## [0.3.0]

### Added

- Export ID conversions functions and constants ([#6006](https://github.com/MetaMask/core/pull/6006))

## [0.2.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [0.1.1]

### Fixed

- Fix `AccountWallet.metadata` type ([#5947](https://github.com/MetaMask/core/pull/5947))
  - Was using `AccountGroupMetadata` instead of `AccountWalletMetadata`.
- Add `AccountTreeControllerStateChangeEvent` to `AccountTreeControllerEvents` ([#5958](https://github.com/MetaMask/core/pull/5958))

## [0.1.0]

### Added

- Initial release ([#5847](https://github.com/MetaMask/core/pull/5847))
  - Grouping accounts into 3 main categories: Entropy source, Snap ID, keyring types.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.3.0...@metamask/account-tree-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.2.0...@metamask/account-tree-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.1.1...@metamask/account-tree-controller@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.1.0...@metamask/account-tree-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/account-tree-controller@0.1.0
