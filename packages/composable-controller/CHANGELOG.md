# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.0]
### Uncategorized
- devDeps: update eslint packages ([#1498](https://github.com/MetaMask/core/pull/1498))

## [3.0.0]
### Changed
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

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
- Relax dependency on `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - `src/ComposableController.ts`
    - `src/ComposableController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@3.0.0...@metamask/composable-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@2.0.0...@metamask/composable-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@1.0.2...@metamask/composable-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@1.0.1...@metamask/composable-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@1.0.0...@metamask/composable-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/composable-controller@1.0.0
