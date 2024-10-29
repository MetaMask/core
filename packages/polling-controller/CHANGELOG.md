# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [12.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^22.0.0` ([#4841](https://github.com/MetaMask/core/pull/4841))
- Bump `@metamask/controller-utils` to `^11.4.0` ([#4834](https://github.com/MetaMask/core/pull/4834))
- Bump `@metamask/utils` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [11.0.0]

### Changed

- **BREAKING**: `AbstractPollingController` now accepts a generic type parameter `PollingInput` which is polymorphic, unlike the previous monomorphic required input of a network client id ([#4752](https://github.com/MetaMask/core/pull/4752))
- **BREAKING:** The `AbstractPollingController` method `startPollingByNetworkClientId` has been renamed to `startPolling` ([#4752](https://github.com/MetaMask/core/pull/4752))
- **BREAKING:** The `AbstractPollingController` method `onPollingComplete` now returns the entire input object of type `PollingInput`, instead of a network client id ([#4752](https://github.com/MetaMask/core/pull/4752))

## [10.0.1]

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

## [10.0.0]

### Changed

- **BREAKING:** Bump devDependency and peerDependency `@metamask/network-controller` from `^20.0.0` to `^21.0.0` ([#4618](https://github.com/MetaMask/core/pull/4618), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [9.0.1]

### Changed

- Remove `@metamask/network-controller` dependency [#4556](https://github.com/MetaMask/core/pull/4556)
  - This was listed under `peerDependencies` already, so it was redundant as a dependency.
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

## [9.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/network-controller` to `^20.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))

## [8.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [7.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Fixed

- `StaticIntervalPollingControllerOnly`, `StaticIntervalPollingController`, and `StaticIntervalPollingControllerV1` now properly stops polling when a stop is requested while `_executePoll` has not yet resolved for the current loop ([#4230](https://github.com/MetaMask/core/pull/4230))

## [6.0.2]

### Changed

- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))
- Bump `@metamask/network-controller` to `^18.1.0` ([#4121](https://github.com/MetaMask/core/pull/4121))
- Bump `@metamask/controller-utils` to `^9.1.0` ([#4153](https://github.com/MetaMask/core/pull/4153), [#4065](https://github.com/MetaMask/core/pull/4065))

## [6.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [6.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [5.0.1]

### Changed

- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/network-controller` to `^17.2.1` ([#4007](https://github.com/MetaMask/core/pull/4007))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` dependency and peer dependency from `^17.0.0` to `^17.1.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678))

## [3.0.0]

### Added

- `BlockTrackerPollingController`, `BlockTrackerPollingControllerV1` and `BlockTrackerPollingControllerOnly` have been added and can be used by subclasses to poll with a blockTracker using the same API as the `StaticIntervalPollingController` versions - the only exception is the requirement to implement the abstract method `_getNetworkClientById` on subclasses.

### Changed

- **BREAKING:** `PollingController`, `PollingControllerV1` and `PollingControllerOnly` are all removed and replaced by `StaticIntervalPollingController`, `StaticIntervalPollingControllerV1` and `StaticIntervalPollingControllerOnly` ([#3636](https://github.com/MetaMask/core/pull/3636))

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [1.0.2]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [1.0.1]

### Fixed

- Export `PollingControllerOnly` ([#1921](https://github.com/MetaMask/core/pull/1921))

## [1.0.0]

### Added

- Add `PollingControllerOnly` to extend from an empty class. This will allow classes that previously are just classes that don't extend from BaseV1 or V2 to extend from this new `PollingControllerOnly`. ([#1873](https://github.com/MetaMask/core/pull/1873))

### Changed

- **BREAKING:** `_executePoll()` is called immediately on start if no polling interval is already active for the networkClientId + options combination ([#1874](https://github.com/MetaMask/core/pull/1874))
- Bump dependency and peer dependency on `@metamask/network-controller` to ^15.1.0

## [0.2.0]

### Added

- Add way to start and stop different polling sessions for the same network client ID by providing extra scoping data ([#1776](https://github.com/MetaMask/core/pull/1776))
  - Add optional second argument to `stopPollingByPollingToken` (formerly `stopPollingByNetworkClientId`)
  - Add optional second argument to `onPollingCompleteByNetworkClientId`

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- **BREAKING:** Polling controllers are expected to override `_executePoll` instead of `executePoll` ([#1810](https://github.com/MetaMask/core/pull/1810))
- **BREAKING:** Rename `stopPollingByNetworkClientId` to `stopPollingByPollingToken` ([#1810](https://github.com/MetaMask/core/pull/1810))
- Add dependency on `fast-json-stable-stringify` ^2.1.0

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@12.0.0...HEAD
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@11.0.0...@metamask/polling-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@10.0.1...@metamask/polling-controller@11.0.0
[10.0.1]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@10.0.0...@metamask/polling-controller@10.0.1
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@9.0.1...@metamask/polling-controller@10.0.0
[9.0.1]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@9.0.0...@metamask/polling-controller@9.0.1
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@8.0.0...@metamask/polling-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@7.0.0...@metamask/polling-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@6.0.2...@metamask/polling-controller@7.0.0
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@6.0.1...@metamask/polling-controller@6.0.2
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@6.0.0...@metamask/polling-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@5.0.1...@metamask/polling-controller@6.0.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@5.0.0...@metamask/polling-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@4.0.0...@metamask/polling-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@3.0.0...@metamask/polling-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@2.0.0...@metamask/polling-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@1.0.2...@metamask/polling-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@1.0.1...@metamask/polling-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@1.0.0...@metamask/polling-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@0.2.0...@metamask/polling-controller@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@0.1.0...@metamask/polling-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/polling-controller@0.1.0
