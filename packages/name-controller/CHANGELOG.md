# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Use Oxfmt for import sorting instead of `import-x/order` ([#8438](https://github.com/MetaMask/core/pull/8438))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))
- chore: simplify auto-generated file header comment ([#8279](https://github.com/MetaMask/core/pull/8279))
- Release/869.0.0 ([#8225](https://github.com/MetaMask/core/pull/8225))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
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
- fix: typos in documentation files ([#5114](https://github.com/MetaMask/core/pull/5114))
- feat: add `signEip7702Authorization` to `KeyringController` ([#5301](https://github.com/MetaMask/core/pull/5301))
- chore(name): Rename `RestrictedControllerMessenger` to `RestrictedMessenger` ([#5236](https://github.com/MetaMask/core/pull/5236))
- Release 202.0.0 ([#4704](https://github.com/MetaMask/core/pull/4704))
- Release 194.0.0 ([#4651](https://github.com/MetaMask/core/pull/4651))
- Release 193.0.0 ([#4643](https://github.com/MetaMask/core/pull/4643))
- Release 191.0.0 ([#4639](https://github.com/MetaMask/core/pull/4639))
- Add way to view pkg changes since latest release ([#1390](https://github.com/MetaMask/core/pull/1390))
- Release 188.0.0 ([#4625](https://github.com/MetaMask/core/pull/4625))
- Release 179.0.0 ([#4544](https://github.com/MetaMask/core/pull/4544))
- Release/172.0.0 ([#4517](https://github.com/MetaMask/core/pull/4517))
- Enable `resetMocks` Jest configuration option ([#4417](https://github.com/MetaMask/core/pull/4417))
- Restore ESLint warnings as errors (ignoring them for now) ([#4382](https://github.com/MetaMask/core/pull/4382))
- Release 158.0.0 ([#4351](https://github.com/MetaMask/core/pull/4351))
- Release 157.0.0 ([#4337](https://github.com/MetaMask/core/pull/4337))
- Release 136.0.0 ([#4153](https://github.com/MetaMask/core/pull/4153))
- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))
- Release 125.0.0 ([#4048](https://github.com/MetaMask/core/pull/4048))
- Initialize controller state as deeply frozen ([#4011](https://github.com/MetaMask/core/pull/4011))
- Use Prettier to format changelogs ([#3850](https://github.com/MetaMask/core/pull/3850))
- Release 109.0.0 ([#3783](https://github.com/MetaMask/core/pull/3783))
- refactor: Update `@metamask/utils` and use `createDeferredPromise` from utils ([#3769](https://github.com/MetaMask/core/pull/3769))
- Release 108.0.0 ([#3760](https://github.com/MetaMask/core/pull/3760))
- fix(base-controller): Fix `stateChange` subscriptions with selectors ([#3702](https://github.com/MetaMask/core/pull/3702))
- Release 106.0.0 ([#3735](https://github.com/MetaMask/core/pull/3735))
- Add script to update changelogs of a release candidate ([#3668](https://github.com/MetaMask/core/pull/3668))
- Enable `@typescript-eslint/no-explicit-any` ([#3660](https://github.com/MetaMask/core/pull/3660))
- Deprecate `BaseControllerV1` and use `BaseControllerV2` as default ([#2078](https://github.com/MetaMask/core/pull/2078))
- Refactor controllers to use `"getState"` action, `"stateChange"` event types defined in `base-controller` ([#2029](https://github.com/MetaMask/core/pull/2029))
- Bump @metamask/auto-changelog from 3.4.2 to 3.4.3 ([#1997](https://github.com/MetaMask/core/pull/1997))
- Change `test` build scripts to only show output for failed tests by default ([#1949](https://github.com/MetaMask/core/pull/1949))
- bump `@metamask/auto-changelog` to `^3.4.2` ([#1905](https://github.com/MetaMask/core/pull/1905))
- Bump @metamask/auto-changelog from 3.2.0 to 3.4.0 ([#1870](https://github.com/MetaMask/core/pull/1870))
- Release 81.0.0 ([#1747](https://github.com/MetaMask/core/pull/1747))
- devDeps: @metamask/eslint-config\*->12.1.0 ([#1740](https://github.com/MetaMask/core/pull/1740))
- Release 80.0.0 ([#1744](https://github.com/MetaMask/core/pull/1744))
- Add `test:clean` build script that clears jest cache before running tests ([#1714](https://github.com/MetaMask/core/pull/1714))
- Release 79.0.0 ([#1739](https://github.com/MetaMask/core/pull/1739))
- chore: Update `typedoc` and related packages ([#1717](https://github.com/MetaMask/core/pull/1717))
- Release 76.0.0 ([#1663](https://github.com/MetaMask/core/pull/1663))

### Changed

- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [9.1.1]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [9.1.0]

### Added

- Expose missing public `NameController` methods through its messenger ([#8183](https://github.com/MetaMask/core/pull/8183))
  - The following actions are now available:
    - `NameController:setName`
    - `NameController:updateProposedNames`
  - Corresponding action types (e.g. `NameControllerSetNameAction`) are available as well.

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.19.0` ([#7202](https://github.com/MetaMask/core/pull/7202), [#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7995](https://github.com/MetaMask/core/pull/7995))

## [9.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6541](https://github.com/MetaMask/core/pull/6541))
  - Previously, `NameController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6541](https://github.com/MetaMask/core/pull/6541))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [8.1.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [8.1.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6473](https://github.com/MetaMask/core/pull/6473))

### Changed

- Bump `@metamask/utils` from `^11.2.0` to `^11.8.1` ([#6054](https://github.com/MetaMask/core/pull/6054)[#6588](https://github.com/MetaMask/core/pull/6588), [#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.4.1` ([#5722](https://github.com/MetaMask/core/pull/5722), [#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632), [#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.5.0` to `^11.14.1` ([#5439](https://github.com/MetaMask/core/pull/5439), [#5583](https://github.com/MetaMask/core/pull/5583), [#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812), [#5935](https://github.com/MetaMask/core/pull/5935), [#6069](https://github.com/MetaMask/core/pull/6069), [#6303](https://github.com/MetaMask/core/pull/6303), [#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629), [#6807](https://github.com/MetaMask/core/pull/6807))

## [8.0.3]

### Changed

- Bump `@metamask/base-controller` from `^7.1.0` to `^8.0.0` ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/controller-utils` from `^11.4.4` to `^11.5.0` ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/utils` from `^10.0.0` to `^11.1.0` ([#5080](https://github.com/MetaMask/core/pull/5080)), ([#5223](https://github.com/MetaMask/core/pull/5223))
- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.0` ([#5079](https://github.com/MetaMask/core/pull/5079))

## [8.0.2]

### Changed

- Bump `@metamask/controller-utils` from `^11.3.0` to `^11.4.4` ([#4834](https://github.com/MetaMask/core/pull/4834), [#4862](https://github.com/MetaMask/core/pull/4862), [#4870](https://github.com/MetaMask/core/pull/4870), [#4915](https://github.com/MetaMask/core/pull/4915), [#5012](https://github.com/MetaMask/core/pull/5012))
- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))

## [8.0.1]

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

## [8.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [7.0.0]

### Changed

- **BREAKING:** Changed token API endpoint from `*.metafi.codefi.network` to `*.api.cx.metamask.io` ([#4301](https://github.com/MetaMask/core/pull/4301))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `async-mutex` to `^0.5.0` ([#4335](https://github.com/MetaMask/core/pull/4335))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Fixed

- Fix `setName` and `updateProposedNames` methods to protect against prototype-polluting assignments ([#4041](https://github.com/MetaMask/core/pull/4041)

## [6.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [6.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add support for Linea Sepolia (chain ID `0xe705`) ([#3995](https://github.com/MetaMask/core/pull/3995))

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Remove support for Optimism Goerli (chain ID `0x1a4`); replace with support for Optimism Sepolia (chain ID `0xaa37dc`) ([#3999](https://github.com/MetaMask/core/pull/3999))

## [5.0.0]

### Changed

- **BREAKING:** Add expire limit for proposed names ([#3748](https://github.com/MetaMask/core/pull/3748))
  - Expired names now get removed on every call to `updateProposedNames`
- Bump `@metamask/base-controller` to `^4.1.1` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [4.2.0]

### Added

- Add `origin` property to `NameEntry` and `SetNameRequest` ([#3751](https://github.com/MetaMask/core/pull/3751))

## [4.1.0]

### Added

- Add fallback variation for petnames ([#3705](https://github.com/MetaMask/core/pull/3705))

## [4.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/utils` to ^8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [3.0.1]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3

## [3.0.0]

### Changed

- **BREAKING**: Normalize addresses and chain IDs ([#1732](https://github.com/MetaMask/core/pull/1732))
  - Save addresses and chain IDs as lowercase in state
  - Remove `getChainId` constructor callback
  - Require a `variation` property when calling `setName` or `updateProposedNames` with the `ethereumAddress` type

## [2.0.0]

### Changed

- **BREAKING**: Support rate limiting in name providers ([#1715](https://github.com/MetaMask/core/pull/1715))
  - Breaking changes:
    - Change `proposedNames` property in `NameEntry` type from string array to new `ProposedNamesEntry` type
    - Remove `proposedNamesLastUpdated` property from `NameEntry` type
  - Add `onlyUpdateAfterDelay` option to `UpdateProposedNamesRequest` type
  - Add `updateDelay` constructor option
  - Add `updateDelay` property to `NameProviderSourceResult` type
  - Add `isEnabled` callback option to `ENSNameProvider`, `EtherscanNameProvider`, `LensNameProvider`, and `TokenNameProvider`
  - Existing proposed names in state are only updated if the `NameProvider` has no errors and the `proposedNames` property is not `undefined`
- Dormant proposed names are automatically removed when calling `updateProposedNames` ([#1688](https://github.com/MetaMask/core/pull/1688))
- The `setName` method accepts a `null` value for the `name` property to enable removing saved names ([#1688](https://github.com/MetaMask/core/pull/1688))
- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [1.0.0]

### Added

- Initial Release ([#1647](https://github.com/MetaMask/core/pull/1647))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/name-controller@9.1.1...HEAD
[9.1.1]: https://github.com/MetaMask/core/compare/@metamask/name-controller@9.1.0...@metamask/name-controller@9.1.1
[9.1.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@9.0.0...@metamask/name-controller@9.1.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@8.1.1...@metamask/name-controller@9.0.0
[8.1.1]: https://github.com/MetaMask/core/compare/@metamask/name-controller@8.1.0...@metamask/name-controller@8.1.1
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@8.0.3...@metamask/name-controller@8.1.0
[8.0.3]: https://github.com/MetaMask/core/compare/@metamask/name-controller@8.0.2...@metamask/name-controller@8.0.3
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/name-controller@8.0.1...@metamask/name-controller@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/name-controller@8.0.0...@metamask/name-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@7.0.0...@metamask/name-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@6.0.1...@metamask/name-controller@7.0.0
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/name-controller@6.0.0...@metamask/name-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@5.0.0...@metamask/name-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@4.2.0...@metamask/name-controller@5.0.0
[4.2.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@4.1.0...@metamask/name-controller@4.2.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@4.0.1...@metamask/name-controller@4.1.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/name-controller@4.0.0...@metamask/name-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@3.0.1...@metamask/name-controller@4.0.0
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/name-controller@3.0.0...@metamask/name-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@2.0.0...@metamask/name-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@1.0.0...@metamask/name-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/name-controller@1.0.0
