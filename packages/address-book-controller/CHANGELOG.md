# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [4.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [3.1.7]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [3.1.6]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))

## [3.1.5]

### Changed

- Bump `@metamask/utils` to ^8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))
- Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is not a breaking change because this controller still inherits from BaseController v1.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [3.1.4]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2

## [3.1.3]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [3.1.2]

### Changed

- Bump dependency on `@metamask/controller-utils` to ^5.0.0

## [3.1.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2

## [3.1.0]

### Changed

- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@4.0.1...HEAD
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@4.0.0...@metamask/address-book-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.7...@metamask/address-book-controller@4.0.0
[3.1.7]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.6...@metamask/address-book-controller@3.1.7
[3.1.6]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.5...@metamask/address-book-controller@3.1.6
[3.1.5]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.4...@metamask/address-book-controller@3.1.5
[3.1.4]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.3...@metamask/address-book-controller@3.1.4
[3.1.3]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.2...@metamask/address-book-controller@3.1.3
[3.1.2]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.1...@metamask/address-book-controller@3.1.2
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.1.0...@metamask/address-book-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@3.0.0...@metamask/address-book-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@2.0.0...@metamask/address-book-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@1.1.0...@metamask/address-book-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@1.0.1...@metamask/address-book-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/address-book-controller@1.0.0...@metamask/address-book-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/address-book-controller@1.0.0
