# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- chore(lint): Fix suppressed ESLint errors in `rate-limit-controller` package ([#7431](https://github.com/MetaMask/core/pull/7431))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- chore: Fix all auto-fixable ESLint warnings ([#7105](https://github.com/MetaMask/core/pull/7105))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- feat: New `base-controller` API ([#6926](https://github.com/MetaMask/core/pull/6926))
- Release 641.0.0 ([#6940](https://github.com/MetaMask/core/pull/6940))
- feat: add `signEip7702Authorization` to `KeyringController` ([#5301](https://github.com/MetaMask/core/pull/5301))
- chore(rate-limit): Rename `ControllerMessenger` to `Messenger` ([#5255](https://github.com/MetaMask/core/pull/5255))
- Release 262.0.0 ([#5012](https://github.com/MetaMask/core/pull/5012))
- Release 202.0.0 ([#4704](https://github.com/MetaMask/core/pull/4704))
- Release 193.0.0 ([#4643](https://github.com/MetaMask/core/pull/4643))
- Add way to view pkg changes since latest release ([#1390](https://github.com/MetaMask/core/pull/1390))
- Release 188.0.0 ([#4625](https://github.com/MetaMask/core/pull/4625))
- Release 179.0.0 ([#4544](https://github.com/MetaMask/core/pull/4544))
- Release/172.0.0 ([#4517](https://github.com/MetaMask/core/pull/4517))
- Restore ESLint warnings as errors (ignoring them for now) ([#4382](https://github.com/MetaMask/core/pull/4382))
- Release 158.0.0 ([#4351](https://github.com/MetaMask/core/pull/4351))
- Revert "Release 158.0.0 (#4342)" ([#4342](https://github.com/MetaMask/core/pull/4342))
- Release 158.0.0 ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))
- Release 125.0.0 ([#4048](https://github.com/MetaMask/core/pull/4048))
- [base-controller] Make `allowed{Actions,Events}` required parameters of `getRestricted` ([#4035](https://github.com/MetaMask/core/pull/4035))
- Fix `getRestricted` method: aligns runtime and type-level handling of omitted or empty inputs ([#4013](https://github.com/MetaMask/core/pull/4013))
- Bump `@metamask/rpc-errors` to `^6.2.0` ([#3954](https://github.com/MetaMask/core/pull/3954))
- Use Prettier to format changelogs ([#3850](https://github.com/MetaMask/core/pull/3850))
- Add script to update changelogs of a release candidate ([#3668](https://github.com/MetaMask/core/pull/3668))
- Enable `@typescript-eslint/no-explicit-any` ([#3660](https://github.com/MetaMask/core/pull/3660))
- [`base-controller`] Enforce that `RestrictedControllerMessenger` is not initialized with internal actions/events in allow lists ([#2051](https://github.com/MetaMask/core/pull/2051))
- Deprecate `BaseControllerV1` and use `BaseControllerV2` as default ([#2078](https://github.com/MetaMask/core/pull/2078))
- Refactor controllers to use `"getState"` action, `"stateChange"` event types defined in `base-controller` ([#2029](https://github.com/MetaMask/core/pull/2029))
- Bump @metamask/auto-changelog from 3.4.2 to 3.4.3 ([#1997](https://github.com/MetaMask/core/pull/1997))
- Change `test` build scripts to only show output for failed tests by default ([#1949](https://github.com/MetaMask/core/pull/1949))
- bump `@metamask/auto-changelog` to `^3.4.2` ([#1905](https://github.com/MetaMask/core/pull/1905))
- Bump @metamask/auto-changelog from 3.2.0 to 3.4.0 ([#1870](https://github.com/MetaMask/core/pull/1870))
- Release 82.0.0 ([#1803](https://github.com/MetaMask/core/pull/1803))
- devDeps: @metamask/eslint-config\*->12.1.0 ([#1740](https://github.com/MetaMask/core/pull/1740))
- Add `test:clean` build script that clears jest cache before running tests ([#1714](https://github.com/MetaMask/core/pull/1714))
- Release 79.0.0 ([#1739](https://github.com/MetaMask/core/pull/1739))
- chore: Update `typedoc` and related packages ([#1717](https://github.com/MetaMask/core/pull/1717))
- Release 74.0.0 ([#1634](https://github.com/MetaMask/core/pull/1634))
- Use static versions for interdependencies ([#1623](https://github.com/MetaMask/core/pull/1623))
- Publish preview builds to NPM instead of GitHub ([#1622](https://github.com/MetaMask/core/pull/1622))
- devDeps: update eslint packages ([#1498](https://github.com/MetaMask/core/pull/1498))
- Release 53.0.0 ([#1385](https://github.com/MetaMask/core/pull/1385))
- Release 49.0.0 ([#1263](https://github.com/MetaMask/core/pull/1263))
- Bump Jest to v27 ([#1198](https://github.com/MetaMask/core/pull/1198))
- Release 42.0.0 ([#1108](https://github.com/MetaMask/core/pull/1108))
- Release 39.0.0 ([#1066](https://github.com/MetaMask/core/pull/1066))
- Release 36.0.0 ([#999](https://github.com/MetaMask/core/pull/999))
- Release 34.0.0 ([#960](https://github.com/MetaMask/core/pull/960))
- Publish a preview build ([#965](https://github.com/MetaMask/core/pull/965))
- Bump @metamask/auto-changelog to 3.1.0 ([#964](https://github.com/MetaMask/core/pull/964))

### Changed

- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [7.0.1]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))

## [7.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6503](https://github.com/MetaMask/core/pull/6503))
  - Previously, `RateLimitController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6503](https://github.com/MetaMask/core/pull/6503))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [6.1.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [6.1.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6525](https://github.com/MetaMask/core/pull/6525))

### Changed

- Bump `@metamask/utils` from `^11.2.0` to `^11.8.1` ([#6054](https://github.com/MetaMask/core/pull/6054), [#6588](https://github.com/MetaMask/core/pull/6588), [#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.4.1` ([#5722](https://github.com/MetaMask/core/pull/5722), [#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632), [#6807](https://github.com/MetaMask/core/pull/6807))

## [6.0.3]

### Changed

- Bump `@metamask/base-controller` from `^7.0.2` to `^8.0.0` ([#5079](https://github.com/MetaMask/core/pull/5079)), ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/rpc-errors` from `^7.0.1` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/utils` from `^10.0.0` to `^11.1.0` ([#5080](https://github.com/MetaMask/core/pull/5080)), ([#5223](https://github.com/MetaMask/core/pull/5223))

## [6.0.2]

### Changed

- Bump `@metamask/rpc-errors` from `^6.3.1` to `^7.0.1` ([#4769](https://github.com/MetaMask/core/pull/4769), [#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [6.0.1]

### Changed

- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))
- Bump `@metamask/rpc-errors` from `^6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump TypeScript from `~4.9.5` to `~5.2.2` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@7.0.1...HEAD
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@7.0.0...@metamask/rate-limit-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@6.1.1...@metamask/rate-limit-controller@7.0.0
[6.1.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@6.1.0...@metamask/rate-limit-controller@6.1.1
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@6.0.3...@metamask/rate-limit-controller@6.1.0
[6.0.3]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@6.0.2...@metamask/rate-limit-controller@6.0.3
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@6.0.1...@metamask/rate-limit-controller@6.0.2
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@6.0.0...@metamask/rate-limit-controller@6.0.1
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
