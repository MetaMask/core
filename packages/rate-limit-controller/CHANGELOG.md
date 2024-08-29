# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release 193.0.0 ([#4643](https://github.com/MetaMask/core/pull/4643))
- Add way to view pkg changes since latest release ([#1390](https://github.com/MetaMask/core/pull/1390))
- Release 188.0.0 ([#4625](https://github.com/MetaMask/core/pull/4625))
- Bump `typescript` from `~5.1.6` to `~5.2.2` ([#4584](https://github.com/MetaMask/core/pull/4584))
- Bump `typescript` from `~5.0.4` to `~5.1.6` ([#4576](https://github.com/MetaMask/core/pull/4576))
- Release 179.0.0 ([#4544](https://github.com/MetaMask/core/pull/4544))
- Upgrade to TypeScript v5.0 and set `module{,Resolution}` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))
- Release/172.0.0 ([#4517](https://github.com/MetaMask/core/pull/4517))
- chore(deps): Bump `@metamask/utils` to `^9.0.0`, `@metamask/rpc-errors` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Restore ESLint warnings as errors (ignoring them for now) ([#4382](https://github.com/MetaMask/core/pull/4382))

## [6.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [5.0.2]

### Changed

- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.comMetaMask/core/pull/4232))

## [5.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [5.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add and export types `RateLimitedApiMap` and `RateLimitedRequests` ([#3963](https://github.com/MetaMask/core/pull/3963))
  - `RateLimitedApiMap` represents the type of the `RateLimitedApis` generic parameter used throughout the controller.
  - `RateLimitedRequests` represents the type of the `request` property of `RateLimitState`.

### Changed

- **BREAKING:** Rename types to align with conventions followed by other controllers ([#3963](https://github.com/MetaMask/core/pull/3963))
  - `GetRateLimitState` is now `RateLimitControllerGetStateAction`.
  - `RateLimitStateChange` is now `RateLimitControllerStateChangeEvent`.
  - `CallApi` is now `RateLimitControllerCallApiAction`.
- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3970](https://github.com/MetaMask/core/pull/3970))
- Add `@metamask/utils` `^8.3.0` as a dependency ([#3963](https://github.com/MetaMask/core/pull/3963))

### Fixed

- **BREAKING:** Correct action and event payloads for `RateLimitControllerGetStateAction` (formerly `GetRateLimitState)` and `RateLimitStateChange` (formerly `RateLimitControllerStateChangeEvent`) by replacing `RateLimitedApis` with `RateLimitState<RateLimitedApis>` ([#3949](https://github.com/MetaMask/core/pull/3949))
  - The wrong type was introduced in 4.0.0.

## [4.0.2]

### Changed

- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))

## [4.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [4.0.0]

### Changed

- **BREAKING:** Enforce that `RateLimitedApi['method']` matches action handler type instead of using `any` ([#1890](https://github.com/MetaMask/core/pull/1890))
- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.

## [3.0.3]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))
- Move from `eth-rpc-errors` ^4.0.2 to `@metamask/rpc-errors` ^6.1.0 ([#1653](https://github.com/MetaMask/core/pull/1653))

## [3.0.2]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [3.0.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1

## [3.0.0]

### Changed

- **BREAKING:** Allow `RateLimitController` to define a rate-limit per method ([#1355](https://github.com/MetaMask/core/pull/1355))
  - The constructor `implementations` option now maps API names to objects with a `method` property, rather than mapping to a function. This object may also have `rateLimitCount` and `rateLimitTimeout` properties, allowing custom rate limits for that method.
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

## [2.0.1]

### Changed

- deps: eth-rpc-errors@4.0.0->4.0.2 ([#1215](https://github.com/MetaMask/core/pull/1215))

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

- Relax dependency on `@metamask/base-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/ratelimit`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@5.0.2...@metamask/rate-limit-controller@6.0.0
[5.0.2]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@5.0.1...@metamask/rate-limit-controller@5.0.2
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@5.0.0...@metamask/rate-limit-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@4.0.2...@metamask/rate-limit-controller@5.0.0
[4.0.2]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@4.0.1...@metamask/rate-limit-controller@4.0.2
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@4.0.0...@metamask/rate-limit-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@3.0.3...@metamask/rate-limit-controller@4.0.0
[3.0.3]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@3.0.2...@metamask/rate-limit-controller@3.0.3
[3.0.2]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@3.0.1...@metamask/rate-limit-controller@3.0.2
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@3.0.0...@metamask/rate-limit-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@2.0.1...@metamask/rate-limit-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@2.0.0...@metamask/rate-limit-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@1.0.2...@metamask/rate-limit-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@1.0.1...@metamask/rate-limit-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@1.0.0...@metamask/rate-limit-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/rate-limit-controller@1.0.0
