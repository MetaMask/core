# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

+- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6459](https://github.com/MetaMask/core/pull/6459))
+  - Previously, `DelegationController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

## [0.7.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` from `^22.0.0` to `^23.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))

## [0.6.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [0.5.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [0.4.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))

## [0.3.0]

### Changed

- **BREAKING:** bump `@metamask/keyring-controller` peer dependency to `^22.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))

## [0.2.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.0.1` ([#5722](https://github.com/MetaMask/core/pull/5722))

## [0.1.0]

### Added

- Initial release ([#5592](https://github.com/MetaMask/core/pull/5592))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.7.0...HEAD
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.6.0...@metamask/delegation-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.5.0...@metamask/delegation-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.4.0...@metamask/delegation-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.3.0...@metamask/delegation-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.2.0...@metamask/delegation-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.1.0...@metamask/delegation-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/delegation-controller@0.1.0
