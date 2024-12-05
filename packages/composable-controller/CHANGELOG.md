# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** `ComposableController` constructor option `controllers` and generic type argument `ChildControllers` are re-defined from an array of controller instances to an object that maps controller names to controller instances ([#4968](https://github.com/MetaMask/core/pull/4968))
- **BREAKING:** `ComposableController` class field objects `state` and `metadata` exclude child controllers that do not extend from `BaseController` or `BaseControllerV1`. Any non-controller entries that are passed into the constructor will be removed automatically ([#4968](https://github.com/MetaMask/core/pull/4968))

### Fixed

- **BREAKING:** `ComposableController` class field object `metadata` now assigns the `StateMetadataProperty`-type object `{ persist: true, anonymous: true }` to each child controller name ([#4968](https://github.com/MetaMask/core/pull/4968))
  - Previously, V2 child controllers were erroneously assigned their own metadata object. This issue was introduced in `@metamask/base-controller@6.0.0`.

## [9.0.1]

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [9.0.0]

### Changed

- Bump `@metamask/base-controller` from `^6.0.3` to `^7.0.0` ([#4643](https://github.com/MetaMask/core/pull/4643))

### Removed

- **BREAKING:** Remove exports for types `LegacyControllerStateConstraint`, `RestrictedControllerMessengerConstraint`, and type guard functions `isBaseController`, `isBaseControllerV1` ([#4467](https://github.com/MetaMask/core/pull/4467))
  - These have been migrated to `@metamask/base-controller@7.0.0`.

## [8.0.0]

### Changed

- **BREAKING:** Add two required generic parameters to the `ComposableController` class: `ComposedControllerState` (constrained by `LegacyComposableControllerStateConstraint`) and `ChildControllers` (constrained by `ControllerInstance`) ([#4467](https://github.com/MetaMask/core/pull/4467))
- **BREAKING:** The type guard `isBaseController` now validates that the input has an object-type property named `metadata` in addition to its existing checks ([#4467](https://github.com/MetaMask/core/pull/4467))
- **BREAKING:** The type guard `isBaseControllerV1` now validates that the input has object-type properties `config`, `state`, and function-type property `subscribe`, in addition to its existing checks ([#4467](https://github.com/MetaMask/core/pull/4467))
- **BREAKING:** Narrow `LegacyControllerStateConstraint` type from `BaseState | StateConstraint` to `BaseState & object | StateConstraint` ([#4467](https://github.com/MetaMask/core/pull/4467))
- Add an optional generic parameter `ControllerName` to the `RestrictedControllerMessengerConstraint` type, which extends `string` and defaults to `string` ([#4467](https://github.com/MetaMask/core/pull/4467))
- Bump `@metamask/base-controller` from `~6.0.0` to `~6.0.3` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544), [#4625](https://github.com/MetaMask/core/pull/4625))
- Bump `typescript` from `~4.9.5` to `~5.2.2` and set `module{,Resolution}` options to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- **BREAKING:** The `ComposableController` class raises a type error if a non-controller with no `state` property is passed into the `ChildControllers` generic parameter or the `controllers` constructor option ([#4467](https://github.com/MetaMask/core/pull/4467))
  - Previously, a runtime error was thrown at class instantiation with no type-level enforcement.
- When the `ComposableController` class is instantiated, its messenger now attempts to subscribe to all child controller `stateChange` events that are included in the messenger's events allowlist ([#4467](https://github.com/MetaMask/core/pull/4467))
  - This was always the expected behavior, but a bug introduced in `@metamask/composable-controller@6.0.0` caused `stateChange` event subscriptions to fail.
- `isBaseController` and `isBaseControllerV1` no longer return false negatives ([#4467](https://github.com/MetaMask/core/pull/4467))
  - The `instanceof` operator is no longer used to validate that the input is a subclass of `BaseController` or `BaseControllerV1`.
- The `ChildControllerStateChangeEvents` type checks that the child controller's state extends from the `StateConstraintV1` type instead of from `Record<string, unknown>` ([#4467](https://github.com/MetaMask/core/pull/4467))
  - V1 controllers define their state types using the `interface` keyword, which are incompatible with `Record<string, unknown>` by default. This resulted in `ChildControllerStateChangeEvents` failing to generate `stateChange` events for V1 controllers and returning `never`.

## [7.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [6.0.2]

### Added

- Adds and exports new types: ([#3952](https://github.com/MetaMask/core/pull/3952))
  - `RestrictedControllerMessengerConstraint`, which is the narrowest supertype of all controller-messenger instances.
  - `LegacyControllerStateConstraint`, a universal supertype for the controller state object, encompassing both BaseControllerV1 and BaseControllerV2 state.
  - `ComposableControllerStateConstraint`, the narrowest supertype for the composable controller state object.

### Changed

- **BREAKING:** The `ComposableController` class is now a generic class that expects one generic argument `ComposableControllerState` ([#3952](https://github.com/MetaMask/core/pull/3952)).
  - **BREAKING:** For the `ComposableController` class to be typed correctly, any of its child controllers that extend `BaseControllerV1` must have an overridden `name` property that is defined using the `as const` assertion.
- **BREAKING:** The types `ComposableControllerStateChangeEvent`, `ComposableControllerEvents`, `ComposableControllerMessenger` are now generic types that expect one generic argument `ComposableControllerState` ([#3952](https://github.com/MetaMask/core/pull/3952)).
- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@9.0.1...HEAD
[9.0.1]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@9.0.0...@metamask/composable-controller@9.0.1
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@8.0.0...@metamask/composable-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@7.0.0...@metamask/composable-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@6.0.2...@metamask/composable-controller@7.0.0
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/composable-controller@6.0.1...@metamask/composable-controller@6.0.2
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
