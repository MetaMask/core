# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/base-controller@4.1.1...HEAD
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
