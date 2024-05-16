# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [10.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [10.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add support for Holesky and Sepolia registries ([#4006](https://github.com/MetaMask/core/pull/4006))
- Add optional constructor option `registriesByChainId`, which allows overriding the default ENS network map ([#4006](https://github.com/MetaMask/core/pull/4006))
- Update default value of `ensEntries` state property to include entry for `.` ([#4006](https://github.com/MetaMask/core/pull/4006))
- Update `get` so that it now returns registry address for chain when queried for the name `.` ([#4006](https://github.com/MetaMask/core/pull/4006))
- Update `delete` so that entry for `.` can be removed ([#4006](https://github.com/MetaMask/core/pull/4006))

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [9.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [8.0.0]

### Changed

- **BREAKING:** Replace constructor parameter `onNetworkStateChange` with `onNetworkDidChange` ([#3610](https://github.com/MetaMask/core/pull/3610))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

### Fixed

- Remove `@metamask/network-controller` dependency ([#3607](https://github.com/MetaMask/core/pull/3607))

## [7.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [6.0.1]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [6.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0

## [5.0.2]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0

## [5.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [5.0.0]

### Changed

- **BREAKING**: Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- Use `providerConfig.chainId` instead of `providerConfig.networkId` to determine ENS compatability ([#1633](https://github.com/MetaMask/core/pull/1633))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))

## [4.1.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^12.1.2

## [4.1.0]

### Changed

- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [4.0.0]

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Add `@metamask/network-controller` as a dependency and peer dependency ([#1367](https://github.com/MetaMask/core/pull/1367), [#1362](https://github.com/MetaMask/core/pull/1362))
- **BREAKING:** The `ensEntries` state property is now keyed by `Hex` chain ID rather than `string`, and the `chainId` property of each ENS entry is also `Hex` rather than `string`. ([#1367](https://github.com/MetaMask/core/pull/1367))
  - This requires a state migration
- **BREAKING:** The methods `get`, `set`, and `delete` have been updated to accept and return chain IDs as 0x-prefixed hex strings, rather than decimal strings. ([#1367](https://github.com/MetaMask/core/pull/1367))
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))

### Fixed

- Fix ENS controller failure to initialize after switching networks ([#1362](https://github.com/MetaMask/core/pull/1362))

## [3.1.0]

### Changed

- Add support for reverse ENS address resolution ([#1170](https://github.com/MetaMask/core/pull/1170))
  - This controller can now resolve a network address to an ENS address. This feature was ported from the extension ENS controller.

## [3.0.0]

### Changed

- **BREAKING:** Convert the ENS controller to the BaseController v2 API ([#1134](https://github.com/MetaMask/core/pull/1134))

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

- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - `src/third-party/EnsController.ts`
    - `src/third-party/EnsController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@10.0.1...HEAD
[10.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@10.0.0...@metamask/ens-controller@10.0.1
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@9.0.0...@metamask/ens-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@8.0.0...@metamask/ens-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@7.0.0...@metamask/ens-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@6.0.1...@metamask/ens-controller@7.0.0
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@6.0.0...@metamask/ens-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@5.0.2...@metamask/ens-controller@6.0.0
[5.0.2]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@5.0.1...@metamask/ens-controller@5.0.2
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@5.0.0...@metamask/ens-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@4.1.1...@metamask/ens-controller@5.0.0
[4.1.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@4.1.0...@metamask/ens-controller@4.1.1
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@4.0.0...@metamask/ens-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@3.1.0...@metamask/ens-controller@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@3.0.0...@metamask/ens-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@2.0.0...@metamask/ens-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.2...@metamask/ens-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.1...@metamask/ens-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.0...@metamask/ens-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ens-controller@1.0.0
