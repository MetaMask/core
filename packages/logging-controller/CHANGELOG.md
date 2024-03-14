# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [3.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [2.0.3]

### Changed

- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))

## [2.0.2]

### Changed

- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [2.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [1.0.4]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))
- Bump dependency on `@metamask/controller-utils` to ^5.0.2 ([#1747](https://github.com/MetaMask/core/pull/1747))

## [1.0.3]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [1.0.2]

### Changed

- Bump dependency on `@metamask/controller-utils` to ^5.0.0

## [1.0.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2

## [1.0.0]

### Added

- Initial Release
  - Add logging controller ([#1089](https://github.com/MetaMask/core.git/pull/1089))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@3.0.1...HEAD
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@3.0.0...@metamask/logging-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@2.0.3...@metamask/logging-controller@3.0.0
[2.0.3]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@2.0.2...@metamask/logging-controller@2.0.3
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@2.0.1...@metamask/logging-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@2.0.0...@metamask/logging-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@1.0.4...@metamask/logging-controller@2.0.0
[1.0.4]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@1.0.3...@metamask/logging-controller@1.0.4
[1.0.3]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@1.0.2...@metamask/logging-controller@1.0.3
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@1.0.1...@metamask/logging-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@1.0.0...@metamask/logging-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/logging-controller@1.0.0
