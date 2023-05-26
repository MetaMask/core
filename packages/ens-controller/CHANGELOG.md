# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@3.1.0...@metamask/ens-controller@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@3.0.0...@metamask/ens-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@2.0.0...@metamask/ens-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.2...@metamask/ens-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.1...@metamask/ens-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.0...@metamask/ens-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ens-controller@1.0.0
