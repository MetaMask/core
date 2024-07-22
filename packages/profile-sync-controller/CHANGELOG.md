# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Please hold off on new releases of this package until the yarn resolution for `@metamask/providers` is removed.
  - This is blocked by a `@metamask/snaps-sdk` release with `@metamask/providers` bumped to `>=17.1.1`.
    - See: [Fix regressions introduced by @metamask/providers@17.1.1](https://github.com/MetaMask/snaps/pull/2579)
  - Build error fixed by yarn resolution: [MetaMask/core/actions/runs/10011688901/job/27675682526?pr=3645](https://github.com/MetaMask/core/actions/runs/10011688901/job/27675682526?pr=3645)

## [0.1.4]

### Added

- added `LoginResponse` validation in profile syncing SDK ([#4541](https://github.com/MetaMask/core/pull/4541))

- added snap caching when calling the message signing snap ([#4532](https://github.com/MetaMask/core/pull/4532))

### Removed

- removed a server-side node dependency from profile-sync-sdk ([#4539](https://github.com/MetaMask/core/pull/4539))

### Fixed

- removed a catch statement call in AuthenticationController to prevent infinite crashes. ([#4533](https://github.com/MetaMask/core/pull/4533))

## [0.1.3]

### Changed

- Switch ethers to a devDependency ([#4518](https://github.com/MetaMask/core/pull/4518))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.4...HEAD
[0.1.4]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.3...@metamask/profile-sync-controller@0.1.4
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.2...@metamask/profile-sync-controller@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.1...@metamask/profile-sync-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.0...@metamask/profile-sync-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-sync-controller@0.1.0
