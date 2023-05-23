# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]
### Uncategorized
- BREAKING: Allow `RateLimitController` to define a rate-limit per method ([#1355](https://github.com/MetaMask/core/pull/1355))
- BREAKING: Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

## [2.0.1]
### Changed
- deps: eth-rpc-errors@4.0.0->4.0.2 ([#1215](https://github.com/MetaMask/core/pull/1215))

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
- Relax dependency on `@metamask/base-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - Everything in `src/ratelimit`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@2.0.1...@metamask/rate-limit-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@2.0.0...@metamask/rate-limit-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@1.0.2...@metamask/rate-limit-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@1.0.1...@metamask/rate-limit-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/rate-limit-controller@1.0.0...@metamask/rate-limit-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/rate-limit-controller@1.0.0
