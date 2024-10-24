# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: Bump `@metamask/utils` ([#4831](https://github.com/MetaMask/core.git/pull/4831))
- Release 226.0.0 ([#4834](https://github.com/MetaMask/core.git/pull/4834))

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

[Unreleased]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@8.0.1...HEAD
[8.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@8.0.0...@metamask/name-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@7.0.0...@metamask/name-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@6.0.1...@metamask/name-controller@7.0.0
[6.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@6.0.0...@metamask/name-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@5.0.0...@metamask/name-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@4.2.0...@metamask/name-controller@5.0.0
[4.2.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@4.1.0...@metamask/name-controller@4.2.0
[4.1.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@4.0.1...@metamask/name-controller@4.1.0
[4.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@4.0.0...@metamask/name-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@3.0.1...@metamask/name-controller@4.0.0
[3.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@3.0.0...@metamask/name-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@2.0.0...@metamask/name-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/name-controller@1.0.0...@metamask/name-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core.git/releases/tag/@metamask/name-controller@1.0.0
