# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2]

### Added

- added platform field when logging in to receive correct OIDC access token ([#4480](https://github.com/MetaMask/core/pull/4480))
- added metametrics validation in constructor ([#4480](https://github.com/MetaMask/core/pull/4480))

### Changed

- updated the `getMetaMetricsId` interface to support async calls to metametrics ID ([#4477](https://github.com/MetaMask/core/pull/4477))

## [0.1.1]

### Added

- export `defaultState` for `AuthenticationController` and `UserStorageController`. ([#4441](https://github.com/MetaMask/core/pull/4441))

### Changed

- `AuthType`, `Env`, `Platform` are changed from const enums to enums ([#4441](https://github.com/MetaMask/core/pull/4441))

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.2...HEAD
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.1...@metamask/profile-sync-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.0...@metamask/profile-sync-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-sync-controller@0.1.0
