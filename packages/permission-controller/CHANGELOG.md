# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.0]
### Added
- Add side-effects to permissions ([#1069](https://github.com/MetaMask/core/pull/1069))

## [3.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [2.0.0]
### Added
- Add `updateCaveat` action ([#1071](https://github.com/MetaMask/core/pull/1071))

### Changed
- **BREAKING:** Update `@metamask/network-controller` peer dependency to v3 ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041)) 

## [1.0.2]
### Fixed
- This package will now warn if a required package is not present ([#1003](https://github.com/MetaMask/core/pull/1003))

## [1.0.1]
### Changed
- Relax dependencies on `@metamask/approval-controller`, `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - Everything in `src/permissions`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@3.1.0...HEAD
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@3.0.0...@metamask/permission-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@2.0.0...@metamask/permission-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@1.0.2...@metamask/permission-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@1.0.1...@metamask/permission-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@1.0.0...@metamask/permission-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/permission-controller@1.0.0
