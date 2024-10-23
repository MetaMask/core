# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release 226.0.0 ([#4834](https://github.com/MetaMask/core/pull/4834))

## [6.0.1]

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [6.0.0]

### Added

- Define and export new types: `LoggingControllerGetStateAction`, `LoggingControllerStateChangeEvent`, `LoggingControllerEvents` ([#4633](https://github.com/MetaMask/core/pull/4633))

### Changed

- **BREAKING:** `LoggingControllerMessenger` must allow internal events defined in the `LoggingControllerEvents` type ([#4633](https://github.com/MetaMask/core/pull/4633))
- `LoggingControllerActions` is widened to include the `LoggingController:getState` action ([#4633](https://github.com/MetaMask/core/pull/4633))
- Bump `@metamask/base-controller` from `^6.0.0` to `^7.0.0` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544), [#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `typescript` from `~4.9.5` to `~5.2.2` and set `module{,Resolution}` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [5.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [4.0.0]

### Changed

- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Removed

- **BREAKING:** Remove `EthSign` from `SigningMethod` ([#4319](https://github.com/MetaMask/core/pull/4319))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.0.1...HEAD
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.0.0...@metamask/logging-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@5.0.0...@metamask/logging-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@4.0.0...@metamask/logging-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@3.0.1...@metamask/logging-controller@4.0.0
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
