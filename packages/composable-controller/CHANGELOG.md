# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [6.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add and export functions `isBaseControllerV1` and `isBaseController`, which are type guards for validating controller instances ([#3904](https://github.com/MetaMask/core/pull/3904))
- `ComposableController` now accommodates `BaseControllerV1` controllers that use a messenger (specifically, which have a `messagingSystem` property which is an instance of `RestrictedControllerMessenger`), by subscribing to the `stateChange` event of the messenger instead of using the `subscribe` method on the controller ([#3964](https://github.com/MetaMask/core/pull/3964))

### Changed

- **BREAKING:** Passing a non-controller into `controllers` constructor option now throws an error ([#3904](https://github.com/MetaMask/core/pull/3904))
- **BREAKING:** The `AllowedAction` parameter of the `ComposableControllerMessenger` type is narrowed from `string` to `never`, as `ComposableController` does not use any external controller actions ([#3904](https://github.com/MetaMask/core/pull/3904))
- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Relax `payload` in `ComposableControllerStateChangeEvent` to use `Record<string, any>` rather than `Record<string, unknown>` ([#3949](https://github.com/MetaMask/core/pull/3949))
- Bump `@metamask/json-rpc-engine` to `^8.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

### Removed

- **BREAKING:** Remove `flatState` getter from `ComposableController` ([#3877](https://github.com/MetaMask/core/pull/3877))
  - This method was confusing to use in practice. Consumers should use the `ComposableController` state directly.
- **BREAKING:** Remove `ControllerList` as an exported type ([#3904](https://github.com/MetaMask/core/pull/3904))
  - There is no replacement.

## [5.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))

## [5.0.0]

### Added

- Add types `ComposableControllerState`, `ComposableControllerStateChangeEvent`, `ComposableControllerEvents`, `ComposableControllerMessenger` ([#3590](https://github.com/MetaMask/core/pull/3590))

### Changed

- **BREAKING:** `ComposableController` is upgraded to extend `BaseControllerV2` ([#3590](https://github.com/MetaMask/core/pull/3590))
  - The constructor now expects an options object with required properties `controllers` and `messenger` as its only argument.
  - `ComposableController` no longer has a `subscribe` method. Instead, listeners for `ComposableController` events must be registered to the controller messenger that generated the restricted messenger assigned to the instance's `messagingSystem` class field.
  - Any getters for `ComposableController` state that access the internal class field directly should be refactored to instead use listeners that are subscribed to `ComposableControllerStateChangeEvent`.
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.

## [3.0.3]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))

## [3.0.2]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [3.0.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@6.0.1...HEAD
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@6.0.0...@metamask/composable-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@5.0.1...@metamask/composable-controller@6.0.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@5.0.0...@metamask/composable-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@4.0.0...@metamask/composable-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@3.0.3...@metamask/composable-controller@4.0.0
[3.0.3]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@3.0.2...@metamask/composable-controller@3.0.3
[3.0.2]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@3.0.1...@metamask/composable-controller@3.0.2
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@3.0.0...@metamask/composable-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@2.0.0...@metamask/composable-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@1.0.2...@metamask/composable-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@1.0.1...@metamask/composable-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@1.0.0...@metamask/composable-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/composable-controller@1.0.0
