# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [5.0.2]

### Changed

- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [5.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [5.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.

## [4.0.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))

## [4.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/utils` to ^8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [3.1.3]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3

## [3.1.2]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [3.1.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1

## [3.1.0]

### Changed

- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [3.0.0]

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- Add `@metamask/utils` dependency ([#1275](https://github.com/MetaMask/core/pull/1275))

## [2.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [1.0.2]

### Changed

- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [1.0.1]

### Changed

- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/notification`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@5.0.2...@metamask/notification-controller@6.0.0
[5.0.2]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@5.0.1...@metamask/notification-controller@5.0.2
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@5.0.0...@metamask/notification-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@4.0.2...@metamask/notification-controller@5.0.0
[4.0.2]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@4.0.1...@metamask/notification-controller@4.0.2
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@4.0.0...@metamask/notification-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@3.1.3...@metamask/notification-controller@4.0.0
[3.1.3]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@3.1.2...@metamask/notification-controller@3.1.3
[3.1.2]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@3.1.1...@metamask/notification-controller@3.1.2
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@3.1.0...@metamask/notification-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@3.0.0...@metamask/notification-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@2.0.0...@metamask/notification-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@1.0.2...@metamask/notification-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@1.0.1...@metamask/notification-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/notification-controller@1.0.0...@metamask/notification-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/notification-controller@1.0.0
