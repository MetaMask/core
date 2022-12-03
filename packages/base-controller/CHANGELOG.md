# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1]
### Changed
- Relax dependency on `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/controllers/pull/998))

## [1.1.0]
### Added
- Add `applyPatches` function to BaseControllerV2 ([#980](https://github.com/MetaMask/controllers/pull/980))

### Changed
- Action and event handler types are now exported ([#987](https://github.com/MetaMask/controllers/pull/987))
- Update `update` function to expose patches ([#980](https://github.com/MetaMask/controllers/pull/980))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/controllers/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/controllers/tree/v33.0.0), namely:
    - `src/BaseController.ts`
    - `src/BaseController.test.ts`
    - `src/BaseControllerV2.ts`
    - `src/BaseControllerV2.test.ts`
    - `src/ComposableController.ts`
    - `src/ComposableController.test.ts`
    - `src/ControllerMessenger.ts`
    - `src/ControllerMessenger.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/controllers/compare/@metamask/base-controller@1.1.1...HEAD
[1.1.1]: https://github.com/MetaMask/controllers/compare/@metamask/base-controller@1.1.0...@metamask/base-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/controllers/compare/@metamask/base-controller@1.0.0...@metamask/base-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/controllers/releases/tag/@metamask/base-controller@1.0.0
