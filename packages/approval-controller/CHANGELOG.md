# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [1.1.0]
### Added
- Add `updateRequestState` action to `ApprovalController` ([#1059](https://github.com/MetaMask/controllers/pull/1059))

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
    - Everything in `src/approval`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@1.1.0...@metamask/approval-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@1.0.1...@metamask/approval-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@1.0.0...@metamask/approval-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/approval-controller@1.0.0
