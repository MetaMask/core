# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/name-controller@8.0.0...HEAD
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
