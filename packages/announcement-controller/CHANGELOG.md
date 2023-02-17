# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [2.0.1]
### Changed
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041)) 

## [2.0.0]
### Changed
- **BREAKING:** Migrate to BaseControllerV2 ([#959](https://github.com/MetaMask/controllers/pull/959))
  - The announcement controller now extends `BaseControllerV2` rather than `BaseController`, which includes the following changes:
    - The constructor now accepts a single "args" object rather than positional parameters.
    - A restricted controller messenger instance must be passed into the constructor.
    - The controller configuration has been replaced by an `allAnnouncements` constructor parameter.
    - The following properties previously inherited from `BaseController` are no longer present:
      - `defaultConfig`
      - `defaultState`
      - `disabled`
      - `config`
      - `state`
    - The following methods previously inherited from `BaseController` are no longer present:
      - `configure`
      - `notify`
      - `subscribe`
      - `unsubscribe`
      - `update`
    - The `name` property is now readonly.

## [1.0.1]
### Changed
- Relax dependency on `@metamask/base-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - Everything in `src/announcement`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/announcement-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/announcement-controller@2.0.1...@metamask/announcement-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/announcement-controller@2.0.0...@metamask/announcement-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/announcement-controller@1.0.1...@metamask/announcement-controller@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/announcement-controller@1.0.0...@metamask/announcement-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/announcement-controller@1.0.0
