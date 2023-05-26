# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]
### Changed
- **BREAKING:**: Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** The `addressBook` state property is now keyed by `Hex` chain ID rather than `string`, and the `chainId` property of each address book entry is also `Hex` rather than `string`.
  - This requires a state migration ([#1367](https://github.com/MetaMask/core/pull/1367))
- **BREAKING:** The methods `delete` and `set` now except the chain ID as `Hex` rather than as a decimal string ([#1367](https://github.com/MetaMask/core/pull/1367))
- Add `@metamask/utils` dependency ([#1367](https://github.com/MetaMask/core/pull/1367))

## [2.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [1.1.0]
### Changed
- Add optional `addressType` property to address book entries ([#828](https://github.com/MetaMask/controllers/pull/828), [#1068](https://github.com/MetaMask/core/pull/1068))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041)) 

## [1.0.1]
### Changed
- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - `src/user/AddressBookController.ts`
    - `src/user/AddressBookController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@2.0.0...@metamask/address-book-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@1.1.0...@metamask/address-book-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@1.0.1...@metamask/address-book-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@1.0.0...@metamask/address-book-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/address-book-controller@1.0.0
