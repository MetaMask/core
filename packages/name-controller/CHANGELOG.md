# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/name-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@2.0.0...@metamask/name-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/name-controller@1.0.0...@metamask/name-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/name-controller@1.0.0
