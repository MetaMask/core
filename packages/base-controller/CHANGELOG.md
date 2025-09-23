# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [8.4.0]

### Added

- Add optional `captureException` parameter to `deriveStateFromMetadata`, `getPersistentState`, and `getAnonymizedState` ([#6606](https://github.com/MetaMask/core/pull/6606))
  - This function will be used to capture any errors encountered during state derivation.

### Changed

- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- In experimental `next` export, rename `anonymous` metadata property to `includeInDebugSnapshot` ([#6593](https://github.com/MetaMask/core/pull/6593))
- In experimental `next` export, make `includeInStateLogs` and `usedInUi` metadata properties required ([#6593](https://github.com/MetaMask/core/pull/6593))
- In experimental `next` export, remove deprecated exports `getPersistentState` and `getAnonymizedState` ([#6611](https://github.com/MetaMask/core/pull/6611))
- Stop re-throwing state derivation errors in a `setTimeout` ([#6606](https://github.com/MetaMask/core/pull/6606))
  - Instead errors are captured with `captureException`, or logged to the console.
- Bump `@metamask/messenger` from `^0.2.0` to `^0.3.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

## [8.3.0]

### Added

- Add `deriveStateFromMetadata` export, which can derive state for any metadata property ([#6359](https://github.com/MetaMask/core/pull/6359))
  - This change has also been made to the experimental `next` export.
- Add optional `includeInStateLogs` and `usedInUi` metadata properties ([#6359](https://github.com/MetaMask/core/pull/6359))
  - State derivation is disallowed for `usedInUi`.
  - This change has also been made to the experimental `next` export.

### Changed

- Bump `@metamask/messenger` from `^0.1.0` to `^0.2.0` ([#6465](https://github.com/MetaMask/core/pull/6465))

### Deprecated

- Deprecate `getPersistentState` and `getAnonymizedState`, recommending `deriveStateFromMetadata` instead ([#6359](https://github.com/MetaMask/core/pull/6359))
  - This change has also been made to the experimental `next` export.

## [8.2.0]

### Added

- Add experimental `next` export for testing upcoming breaking changes ([#6316](https://github.com/MetaMask/core/pull/6316))
  - Note that this should generally not be used, and further breaking changes may be made under this export without a corresponding major version bump for this package.
  - Changes:
    - Update `BaseController` type and constructor to require new `Messenger` from `@metamask/messenger` rather than `RestrictedMessenger` ([#6318](https://github.com/MetaMask/core/pull/6318))
    - Rename `ListenerV2` type export to `StateChangeListener` ([#6339](https://github.com/MetaMask/core/pull/6339))
    - Rename `messagingSystem` protected instance variable to `messenger` ([#6337](https://github.com/MetaMask/core/pull/6337))
    - Remove `isBaseController` ([#6341](https://github.com/MetaMask/core/pull/6341))

### Changed

- Add dependency on `@metamask/messenger` ([#6318](https://github.com/MetaMask/core/pull/6318))
  - This is only used by the experimental `next` export for now.

## [8.1.0]

### Added

- Add `registerMethodActionHandlers` method to `Messenger`, and `RestrictedMessenger` for simplified bulk action handler registration ([#5927](https://github.com/MetaMask/core/pull/5927))
  - Allows registering action handlers that map to methods on a messenger client at once by passing an array of method names
  - Automatically binds action handlers to the given messenger client

### Changed

- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))
- Add default for `ReturnHandler` type parameter of `SelectorEventHandler` and `SelectorFunction` ([#6262](https://github.com/MetaMask/core/pull/6262), [#6264](https://github.com/MetaMask/core/pull/6264))

### Fixed

- Update `unsubscribe` type signature to support selector event handlers ([#6262](https://github.com/MetaMask/core/pull/6262))

## [8.0.1]

### Changed

- Don't emit `:stateChange` from `BaseController` unnecessarily ([#5480](https://github.com/MetaMask/core/pull/5480))

## [8.0.0]

### Changed

- **BREAKING:** Remove deprecated messenger-related exports and simplify `RestrictedMessenger` constructor ([#5260](https://github.com/MetaMask/core/pull/5260))
  - Remove `ControllerMessenger` export which was an alias for `Messenger`. Consumers should import `Messenger` directly
  - Remove `RestrictedControllerMessenger` export which was an alias for `RestrictedMessenger`. Consumers should import `RestrictedMessenger` directly
  - Remove `RestrictedControllerMessengerConstraint` type export which was an alias for `RestrictedMessengerConstraint`. Consumers should use `RestrictedMessengerConstraint` type directly
  - Simplify `RestrictedMessenger` constructor by removing deprecated `controllerMessenger` parameter. The messenger instance should now be passed using only the `messenger` parameter instead of supporting both options
- Widen input parameter for type guard `isBaseController` from `ControllerInstance` to `unknown` ([#5018](https://github.com/MetaMask/core/pull/5018/))
- Bump `@metamask/json-rpc-engine` from `^10.0.2` to `^10.0.3` ([#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

### Removed

- **BREAKING:** Remove class `BaseControllerV1` and type guard `isBaseControllerV1` ([#5018](https://github.com/MetaMask/core/pull/5018/))
- **BREAKING:** Remove types `BaseConfig`, `BaseControllerV1Instance`, `BaseState`, `ConfigConstraintV1`, `Listener`, `StateConstraintV1`, `LegacyControllerStateConstraint`, `ControllerInstance` ([#5018](https://github.com/MetaMask/core/pull/5018/))

## [7.1.1]

### Changed

- Bump `@metamask/utils` from `^10.0.0` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))

## [7.1.0]

### Changed

- Rename `ControllerMessenger` to `Messenger` ([#5050](https://github.com/MetaMask/core/pull/5050))
  - `ControllerMessenger` has been renamed to `Messenger`
  - `RestrictedControllerMessengerConstraint` has been renamed to `RestrictedMessengerConstraint`
  - `RestrictedControllerMessenger` has been renamed to `RestrictedMessenger`
  - The `RestrictedMessenger` constructor parameter `controllerMessenger` has been renamed to `messenger`, though the old name is still accepted
  - The old names remain exported as deprecated aliases of the new names, so this is not a breaking change.

## [7.0.2]

### Changed

- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [7.0.1]

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

## [7.0.0]

### Added

- Migrate from `@metamask/composable-controller@8.0.0` into `@metamask/base-controller`: types `LegacyControllerStateConstraint`, `RestrictedControllerMessengerConstraint` and type guard functions `isBaseController`, `isBaseControllerV1` ([#4581](https://github.com/MetaMask/core/pull/4581))
- Add and export types `ControllerInstance`, `BaseControllerInstance`, `StateDeriverConstraint`, `StateMetadataConstraint`, `StatePropertyMetadataConstraint`, `BaseControllerV1Instance`, `ConfigConstraintV1`, `StateConstraintV1` ([#4581](https://github.com/MetaMask/core/pull/4581))

### Fixed

- **BREAKING:** Fix `StateMetadata` type so that it requires associated metadata for all optional and non-optional top-level state properties ([#4612](https://github.com/MetaMask/core/pull/4612))
  - Fixes issue of runtime error being thrown during `BaseController` instantiation due to missing metadata for optional state properties.

## [6.0.3]

### Changed

- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [6.0.2]

### Changed

- Bump TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))

## [6.0.1]

### Changed

- Bump `@metamask/rpc-errors` from `6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` from `^8.3.0` to `^9.0.0` ([#4516](https://github.com/MetaMask/core/pull/4516))

## [6.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))

## [5.0.2]

### Changed

- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))

## [5.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [5.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add and export type `StateConstraint`, which is an alias for `Record<string, Json>` ([#3949](https://github.com/MetaMask/core/pull/3949))
  - This type represents the narrowest supertype of the state of all controllers.
  - Importing this type enables controllers to constrain state objects and types to be JSON-serializable without having to directly add `@metamask/utils` as a dependency.

### Changed

- **BREAKING:** Narrow the return types of functions `getAnonymizedState<ControllerState>` and `getPersistentState<ControllerState>` from `Record<string, Json>` to `Record<keyof ControllerState, Json>`. ([#3949](https://github.com/MetaMask/core/pull/3949), [#4040](https://github.com/MetaMask/core/pull/4040))
- **BREAKING:** Align type-level and runtime behavior of `getRestricted` so that omitted or empty inputs consistently represent a set of empty allowlists ([#4013](https://github.com/MetaMask/core/pull/4013))
  - If the `AllowedActions` and `AllowedEvents` generic parameters are omitted, they are always assumed to be `never`.
    - Previously, omission of these generic parameters resulted in the full allowlists for the controller being inferred as type constraints for the `allowedActions` and `allowedEvents` function parameters.
  - If the function parameters `allowedActions` and `allowedEvents` are a non-empty array, their corresponding type names must be explicitly passed into generic parameters `AllowedActions` and `AllowedEvents` to avoid type errors.
    - This may cause some duplication of allowlists between type-level and value-level code.
    - This requirement is only relevant for TypeScript code. A JavaScript consumer only needs to pass in the correct value-level function parameters. Because of this, these changes should not affect downstream JavaScript code, but may be disruptive to TypeScript code.
    - `getRestricted` is still able to flag `AllowedActions` and `AllowedEvents` members that should not be included in the allowlists, based on the `Action` and `Event` generic arguments passed into the `ControllerMessenger` instance.
- **BREAKING:** The `RestrictedControllerMessenger` class constructor now expects `allowedActions` and `allowedEvents` as required options ([#4013](https://github.com/MetaMask/core/pull/4013))
- **BREAKING**: Add `string` as generic constraint to the `Name` generic parameter of the types `NamespacedBy` and `NotNamespacedBy` ([#4036](https://github.com/MetaMask/core/pull/4036))
- **BREAKING:** The `getRestricted` method of the `ControllerMessenger` class now expects both `allowedActions` and `allowedEvents` as required parameters.
  - An empty array is required if no allowed actions or events are desired.
- Convert interface `StatePropertyMetadata` into a type alias ([#3949](https://github.com/MetaMask/core/pull/3949))

### Removed

- **BREAKING:** Remove the deprecated `subscribe` class field from `BaseController` ([#3949](https://github.com/MetaMask/core/pull/3949))
  - This property was used to differentiate between `BaseControllerV1` and `BaseController` (v2) controllers. It is no longer used.

### Fixed

- **BREAKING:** Narrow the generic constraint of the `ControllerState` parameter from `Record<string, unknown>` to `Record<string, Json>` for types `ControllerGetStateAction`, `ControllerStateChangeEvent`, `ControllerActions`, and `ControllerEvents` ([#3949](https://github.com/MetaMask/core/pull/3949))
- **BREAKING:** Fix `BaseController` so that mutating state directly now results in a runtime error ([#4011](https://github.com/MetaMask/core/pull/4011))
  - Directly modifying the state outside of an `update` call may lead to parts of the application being out of sync, because such modifications do not result in the `stateChange` event being fired.
  - Instead of mutating the state of a controller after instantiation, consumers should either initialize that controller with the proper state via options or should use the `update` method to safely modify the state.
- **BREAKING**: Fix `subscribe` on `ControllerMessenger` and `RestrictedControllerMessenger` to infer correct types for `selector` arguments ([#4012](https://github.com/MetaMask/core/pull/4012))
  - Previously, the types of the arguments that the `selector` function received would always be inferred as `never`, but now the types match those of `publish` (the "event payload"). This means that you shouldn't need to add use type annotations or assertions to type the `selector` arguments.

## [4.1.1]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))

## [4.1.0]

### Added

- Add `registerInitialEventPayload` to `ControllerMessenger` and `RestrictedControllerMessenger` ([#3697](https://github.com/MetaMask/core/pull/3697))
  - This allows registering an event payload function for an event, which has the benefit of ensuring the "subscription selector" feature works correctly the first time the event is fired after subscribing.

### Fixed

- Fix `subscribe` method selector support on first publish ([#3697](https://github.com/MetaMask/core/pull/3697))
  - An event with a registered initial event payload function will work better with selectors, in that it will correctly compare with the initial selected state and return the previous value the first time it's published. Without this, the initial published event will always return `undefined` as the previous value.
- Subscribers to the `stateChange` event of any `BaseControllerV2`-based controllers will now correctly handle the initial state change event ([#3702](https://github.com/MetaMask/core/pull/3702))
  - Previously the initial state change would always result in this event firing, even for subscriptions with selectors where the selected value has not changed. Additionally, the `previousValue` returned was always set to `undefined` the first time.
  - `BaseControllerV2` has been updated to correctly compare with the previous value even for the first state change. The returned `previousValue` is also now guaranteed to be correct even for the initial state change.

## [4.0.1]

### Changed

- Deprecate `subscribe` property from `BaseControllerV2` ([#3590](https://github.com/MetaMask/core/pull/3590), [#3698](https://github.com/MetaMask/core/pull/3698))
  - This property was used to differentiate between `BaseControllerV1` and `BaseControllerV2` controllers. It is no longer used, so it has been marked as deprecated.

## [4.0.0]

### Added

- Add `ControllerGetStateAction` and `ControllerStateChangeEvent` types ([#1890](https://github.com/MetaMask/core/pull/1890), [#2029](https://github.com/MetaMask/core/pull/2029))
- Add `NamespacedName` type ([#1890](https://github.com/MetaMask/core/pull/1890))
  - This is the narrowest supertype of all names defined within a given namespace.
- Add `NotNamespacedBy` type, which matches an action/event name if and only if it is not prefixed by a given namespace ([#2051](https://github.com/MetaMask/core/pull/2051))

### Changed

- **BREAKING:** Alter controller messenger `ActionHandler` type so `Action` type parameter must satisfy (updated) `ActionConstraint` ([#1890](https://github.com/MetaMask/core/pull/1890))
- **BREAKING:** Alter controller messenger `ExtractActionParameters` utility type so `Action` type parameter must satisfy (updated) `ActionConstraint` ([#1890](https://github.com/MetaMask/core/pull/1890))
- **BREAKING:** Alter controller messenger `ExtractEventHandler` utility type so `Event` type parameter must satisfy `EventConstraint` ([#1890](https://github.com/MetaMask/core/pull/1890))
- **BREAKING:** Alter controller messenger `ExtractEventPayload` utility type so `Event` type parameter must satisfy `EventConstraint` and `Event['payload']` must be an array (to match behavior of `ExtractEventHandler`) ([#1890](https://github.com/MetaMask/core/pull/1890))
- **BREAKING:** Alter controller messenger `SelectorFunction` type so that its generic parameter `Args` is replaced by `Event`, which must satisfy `EventConstraint`, and it returns a function whose arguments satisfy the event payload type specified by `Event` ([#1890](https://github.com/MetaMask/core/pull/1890))
- **BREAKING:** `BaseController` is now renamed to `BaseControllerV1` and has been deprecated; `BaseController` now points to what was previously called `BaseControllerV2` ([#2078](https://github.com/MetaMask/core/pull/2078))
  - This should encourage use of `BaseController` v2 for new controllers going forward.
  - If your controller is importing `BaseControllerV2`, you will need to import `BaseController` instead.
  - If your controller is still importing `BaseController` v1, you will need to import and use `BaseControllerV1` instead. That said, please consider migrating your controller to v2.
- **BREAKING:** The restricted controller messenger now allows calling all internal events and actions by default and prohibits explicitly allowlisting any of them ([#2050](https://github.com/MetaMask/core/pull/2050), [#2051](https://github.com/MetaMask/core/pull/2051))
  - Previously internal events and actions were only usable if they were listed as "allowed" via the `allowedActions` or `allowedEvents` options to the `RestrictedControllerMessenger` constructor or `ControllerMessenger.getRestricted()`. Now this works implicitly.
  - In fact, attempting to allowlist any of them will raise a type error, as otherwise, it would be possible to specify a partial list of allowed actions or events, and that would be misleading, since all of them are allowed anyway.
- **BREAKING:** Rename `Namespaced` type to `NamespacedBy` ([#2051](https://github.com/MetaMask/core/pull/2051))
- Alter controller messenger `ActionConstraint['handler']` type to remove usage of `any` ([#1890](https://github.com/MetaMask/core/pull/1890))
  - This type is now defined as the universal supertype of all functions, meaning any function can be safely assigned as an action handler, regardless of argument types, number of arguments, or return value type.
- Bump `@metamask/utils` to ^8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

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

- When deriving state, skip properties with invalid metadata ([#1529](https://github.com/MetaMask/core/pull/1529))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/base-controller@8.4.0...HEAD
[8.4.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@8.3.0...@metamask/base-controller@8.4.0
[8.3.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@8.2.0...@metamask/base-controller@8.3.0
[8.2.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@8.1.0...@metamask/base-controller@8.2.0
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@8.0.1...@metamask/base-controller@8.1.0
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@8.0.0...@metamask/base-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@7.1.1...@metamask/base-controller@8.0.0
[7.1.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@7.1.0...@metamask/base-controller@7.1.1
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@7.0.2...@metamask/base-controller@7.1.0
[7.0.2]: https://github.com/MetaMask/core/compare/@metamask/base-controller@7.0.1...@metamask/base-controller@7.0.2
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@7.0.0...@metamask/base-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@6.0.3...@metamask/base-controller@7.0.0
[6.0.3]: https://github.com/MetaMask/core/compare/@metamask/base-controller@6.0.2...@metamask/base-controller@6.0.3
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/base-controller@6.0.1...@metamask/base-controller@6.0.2
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@6.0.0...@metamask/base-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@5.0.2...@metamask/base-controller@6.0.0
[5.0.2]: https://github.com/MetaMask/core/compare/@metamask/base-controller@5.0.1...@metamask/base-controller@5.0.2
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@5.0.0...@metamask/base-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@4.1.1...@metamask/base-controller@5.0.0
[4.1.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@4.1.0...@metamask/base-controller@4.1.1
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@4.0.1...@metamask/base-controller@4.1.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/base-controller@4.0.0...@metamask/base-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/base-controller@3.2.3...@metamask/base-controller@4.0.0
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
