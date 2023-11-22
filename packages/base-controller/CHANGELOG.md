# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Uncategorized
- [`base-controller`] Enforce that `RestrictedControllerMessenger` is not initialized with internal actions/events in allow lists ([#2051](https://github.com/MetaMask/core/pull/2051))
- Deprecate `BaseControllerV1` and use `BaseControllerV2` as default ([#2078](https://github.com/MetaMask/core/pull/2078))
- [`base-controller`] Add `RestrictedControllerMessenger` tests for runtime error handling ([#2058](https://github.com/MetaMask/core/pull/2058))
- feat(base-controller): Allow using internal events/actions ([#2050](https://github.com/MetaMask/core/pull/2050))
- Refactor controllers to use `"getState"` action, `"stateChange"` event types defined in `base-controller` ([#2029](https://github.com/MetaMask/core/pull/2029))
- refactor(base-controller): Replace `private` keyword ([#2048](https://github.com/MetaMask/core/pull/2048))
- refactor: Move RestrictedControllerMessenger to separate file ([#2045](https://github.com/MetaMask/core/pull/2045))
- [`base-controller`] Fix single-letter type param names ([#2030](https://github.com/MetaMask/core/pull/2030))
- [`base-controller`] Fix all `any` usage, apply universal supertype for functions ([#1890](https://github.com/MetaMask/core/pull/1890))
- Re-enable @typescript-eslint/consistent-type-definitions ([#1933](https://github.com/MetaMask/core/pull/1933))
- Bump @metamask/auto-changelog from 3.4.2 to 3.4.3 ([#1997](https://github.com/MetaMask/core/pull/1997))
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))
- Change `test` build scripts to only show output for failed tests by default ([#1949](https://github.com/MetaMask/core/pull/1949))
- bump `@metamask/auto-changelog` to `^3.4.2` ([#1905](https://github.com/MetaMask/core/pull/1905))
- Bump @metamask/auto-changelog from 3.2.0 to 3.4.0 ([#1870](https://github.com/MetaMask/core/pull/1870))
- Remove `for..in` loops and reenable eslint rules: `guard-for-in`, `no-for-in-array` ([#1865](https://github.com/MetaMask/core/pull/1865))

## [3.2.3]
### Changed
- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))

## [3.2.2]
### Changed
- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [3.2.1]
### Changed
- There are no consumer-facing changes to this package. This version is a part of a synchronized release across all packages in our monorepo.

## [3.2.0]
### Changed
- When deriving state, skip properties with invalid metadata  ([#1529](https://github.com/MetaMask/core/pull/1529))
  - The previous behavior was to throw an error
  - An error is thrown in a timeout handler so that it can still be captured in the console, and by global unhandled error handlers.
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [3.1.0]
### Changed
- Prevent event publish from throwing error ([#1475](https://github.com/MetaMask/core/pull/1475))
  - The controller messenger will no longer throw when an event subscriber throws an error. Calls to `publish` (either within controllers or on a messenger instance directly) will no longer throw errors.
  - Errors are thrown in a timeout handler so that they can still be logged and captured.

## [3.0.0]
### Changed
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- Replace `@metamask/controller-utils` dependency with `@metamask/utils` ([#1370](https://github.com/MetaMask/core/pull/1370))

## [2.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [1.1.2]
### Changed
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041)) 

## [1.1.1]
### Changed
- Relax dependency on `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.1.0]
### Added
- Add `applyPatches` function to BaseControllerV2 ([#980](https://github.com/MetaMask/core/pull/980))

### Changed
- Action and event handler types are now exported ([#987](https://github.com/MetaMask/core/pull/987))
- Update `update` function to expose patches ([#980](https://github.com/MetaMask/core/pull/980))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - `src/BaseController.ts`
    - `src/BaseController.test.ts`
    - `src/BaseControllerV2.ts`
    - `src/BaseControllerV2.test.ts`
    - `src/ComposableController.ts`
    - `src/ComposableController.test.ts`
    - `src/ControllerMessenger.ts`
    - `src/ControllerMessenger.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/base-controller@3.2.3...HEAD
[3.2.3]: https://github.com/MetaMask/core/compare/@metamask/base-controller@3.2.2...@metamask/base-controller@3.2.3
[3.2.2]: https://github.com/MetaMask/core/compare/@metamask/base-controller@3.2.1...@metamask/base-controller@3.2.2
[3.2.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@3.2.0...@metamask/base-controller@3.2.1
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@3.1.0...@metamask/base-controller@3.2.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@3.0.0...@metamask/base-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@2.0.0...@metamask/base-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@1.1.2...@metamask/base-controller@2.0.0
[1.1.2]: https://github.com/MetaMask/core/compare/@metamask/base-controller@1.1.1...@metamask/base-controller@1.1.2
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@1.1.0...@metamask/base-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@1.0.0...@metamask/base-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/base-controller@1.0.0
