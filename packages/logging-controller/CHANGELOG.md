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
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))
- chore: simplify auto-generated file header comment ([#8279](https://github.com/MetaMask/core/pull/8279))
- Release/869.0.0 ([#8225](https://github.com/MetaMask/core/pull/8225))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: Fix all auto-fixable ESLint warnings ([#7105](https://github.com/MetaMask/core/pull/7105))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- Release/650.0.0 ([#7003](https://github.com/MetaMask/core/pull/7003))
- feat: New `base-controller` API ([#6926](https://github.com/MetaMask/core/pull/6926))
- Release 641.0.0 ([#6940](https://github.com/MetaMask/core/pull/6940))
- Revert "Release 319.0.0 (#5437)" ([#5437](https://github.com/MetaMask/core/pull/5437))
- Release 319.0.0 ([#5437](https://github.com/MetaMask/core/pull/5437))
- chore(logging): Rename `ControllerMessenger` to `Messenger` ([#5235](https://github.com/MetaMask/core/pull/5235))
- Release 202.0.0 ([#4704](https://github.com/MetaMask/core/pull/4704))
- Release 194.0.0 ([#4651](https://github.com/MetaMask/core/pull/4651))
- Release 191.0.0 ([#4639](https://github.com/MetaMask/core/pull/4639))
- Add way to view pkg changes since latest release ([#1390](https://github.com/MetaMask/core/pull/1390))
- Enable `resetMocks` Jest configuration option ([#4417](https://github.com/MetaMask/core/pull/4417))
- Restore ESLint warnings as errors (ignoring them for now) ([#4382](https://github.com/MetaMask/core/pull/4382))
- Release 158.0.0 ([#4351](https://github.com/MetaMask/core/pull/4351))
- Release 157.0.0 ([#4337](https://github.com/MetaMask/core/pull/4337))
- Release 136.0.0 ([#4153](https://github.com/MetaMask/core/pull/4153))
- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))
- Release 127.0.0 ([#4065](https://github.com/MetaMask/core/pull/4065))
- Release 125.0.0 ([#4048](https://github.com/MetaMask/core/pull/4048))
- [base-controller] Make `allowed{Actions,Events}` required parameters of `getRestricted` ([#4035](https://github.com/MetaMask/core/pull/4035))
- Fix `getRestricted` method: aligns runtime and type-level handling of omitted or empty inputs ([#4013](https://github.com/MetaMask/core/pull/4013))
- Release 116.0.0 ([#3915](https://github.com/MetaMask/core/pull/3915))
- Use Prettier to format changelogs ([#3850](https://github.com/MetaMask/core/pull/3850))
- Add script to update changelogs of a release candidate ([#3668](https://github.com/MetaMask/core/pull/3668))
- Enable `@typescript-eslint/no-explicit-any` ([#3660](https://github.com/MetaMask/core/pull/3660))
- Remove superfluous typescript reference paths ([#3608](https://github.com/MetaMask/core/pull/3608))
- Deprecate `BaseControllerV1` and use `BaseControllerV2` as default ([#2078](https://github.com/MetaMask/core/pull/2078))
- Bump @metamask/auto-changelog from 3.4.2 to 3.4.3 ([#1997](https://github.com/MetaMask/core/pull/1997))
- Change `test` build scripts to only show output for failed tests by default ([#1949](https://github.com/MetaMask/core/pull/1949))
- bump `@metamask/auto-changelog` to `^3.4.2` ([#1905](https://github.com/MetaMask/core/pull/1905))
- Bump @metamask/auto-changelog from 3.2.0 to 3.4.0 ([#1870](https://github.com/MetaMask/core/pull/1870))
- Release 82.0.0 ([#1803](https://github.com/MetaMask/core/pull/1803))
- devDeps: @metamask/eslint-config\*->12.1.0 ([#1740](https://github.com/MetaMask/core/pull/1740))
- Add `test:clean` build script that clears jest cache before running tests ([#1714](https://github.com/MetaMask/core/pull/1714))
- Release 79.0.0 ([#1739](https://github.com/MetaMask/core/pull/1739))
- chore: Update `typedoc` and related packages ([#1717](https://github.com/MetaMask/core/pull/1717))
- Release 78.0.0 ([#1708](https://github.com/MetaMask/core/pull/1708))
- Release 74.0.0 ([#1634](https://github.com/MetaMask/core/pull/1634))
- Use static versions for interdependencies ([#1623](https://github.com/MetaMask/core/pull/1623))
- Publish preview builds to NPM instead of GitHub ([#1622](https://github.com/MetaMask/core/pull/1622))
- devDeps: update eslint packages ([#1498](https://github.com/MetaMask/core/pull/1498))
- Release 55.0.0 ([#1408](https://github.com/MetaMask/core/pull/1408))

### Changed

- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [8.0.1]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [8.0.0]

### Added

- Expose missing public `LoggingController` methods through its messenger ([#8183](https://github.com/MetaMask/core/pull/8183))
  - The following action is now available:
    - `LoggingController:clear`
  - Corresponding action type (`LoggingControllerClearAction`) is available as well.

### Changed

- **BREAKING:** Standardize names of `LoggingController` messenger action types ([#8183](https://github.com/MetaMask/core/pull/8183))
  - All existing types for messenger actions have been renamed so they end in `Action` and include the controller name (e.g. `AddLog` -> `LoggingControllerAddAction`). You will need to update imports appropriately.
  - This change only affects the types. The action type strings themselves have not changed, so you do not need to update the list of actions you pass when initializing `LoggingController` messengers.
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.19.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7995](https://github.com/MetaMask/core/pull/7995))

## [7.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [7.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6463](https://github.com/MetaMask/core/pull/6463))
  - Previously, `LoggingController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6463](https://github.com/MetaMask/core/pull/6463))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [6.1.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [6.1.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6473](https://github.com/MetaMask/core/pull/6473))

### Changed

- Bump `@metamask/base-controller` from `^8.0.0` to `^8.4.1` ([#5722](https://github.com/MetaMask/core/pull/5722), [#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632), [#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.5.0` to `^11.14.1` ([#5439](https://github.com/MetaMask/core/pull/5439), [#5583](https://github.com/MetaMask/core/pull/5583), [#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812), [#5935](https://github.com/MetaMask/core/pull/5935), [#6069](https://github.com/MetaMask/core/pull/6069), [#6303](https://github.com/MetaMask/core/pull/6303), [#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629), [#6807](https://github.com/MetaMask/core/pull/6807))

## [6.0.4]

### Changed

- Bump `@metamask/base-controller` from `^7.0.2` to `^8.0.0` ([#5079](https://github.com/MetaMask/core/pull/5079)), ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/controller-utils` from `^11.4.4` to `^11.5.0` ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5272](https://github.com/MetaMask/core/pull/5272))

## [6.0.3]

### Changed

- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))

## [6.0.2]

### Changed

- Bump `@metamask/controller-utils` from `^11.3.0` to `^11.4.3` ([#4870](https://github.com/MetaMask/core/pull/4870), [#4862](https://github.com/MetaMask/core/pull/4862), [#4834](https://github.com/MetaMask/core/pull/4834), [#4915](https://github.com/MetaMask/core/pull/4915))
- Bump `@metamask/base-controller` from `^7.0.1` to `^^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@8.0.1...HEAD
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@8.0.0...@metamask/logging-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@7.0.1...@metamask/logging-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@7.0.0...@metamask/logging-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.1.1...@metamask/logging-controller@7.0.0
[6.1.1]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.1.0...@metamask/logging-controller@6.1.1
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.0.4...@metamask/logging-controller@6.1.0
[6.0.4]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.0.3...@metamask/logging-controller@6.0.4
[6.0.3]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.0.2...@metamask/logging-controller@6.0.3
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/logging-controller@6.0.1...@metamask/logging-controller@6.0.2
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
