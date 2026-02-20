# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.19.0` ([#7583](https://github.com/MetaMask/core/pull/7583), [#7995](https://github.com/MetaMask/core/pull/7995))

### Fixed

- Add optional `prevClientVersion` constructor argument to invalidate cached flags when the client version changes ([#7827](https://github.com/MetaMask/core/pull/7827))

## [4.0.0]

### Changed

- **BREAKING:** Improve threshold-based feature flag processing to ensure independent user assignment across different flags ([#7511](https://github.com/MetaMask/core/pull/7511)):
  - Persist threshold values in controller state to avoid recalculating on app restart
  - Skip cryptographic operations for non-threshold arrays
  - Batch cache updates and cleanup into single state change
  - Automatically remove stale cache entries when flags are deleted
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511)) for native `crypto.subtle.digest` optimization ([#7511](https://github.com/MetaMask/core/pull/7511))
- Remove `@noble/hashes` dependency since hashing utilities are now available in upgraded `@metamask/utils` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Changes to exported types ([#7511](https://github.com/MetaMask/core/pull/7511)):
  - Add optional field `thresholdCache` to `RemoteFeatureFlagControllerState`
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))

## [3.1.0]

### Added

- Add override functionality to remote feature flags ([#7271](https://github.com/MetaMask/core/pull/7271))
  - `setFlagOverride(flagName, value)` - Set a local override for a specific feature flag
  - `removeFlagOverride(flagName)` - Clear the local override for a specific feature flag
  - `clearAllFlagOverrides()` - Clear all local feature flag overrides
- Add new optional controller state properties ([#7271](https://github.com/MetaMask/core/pull/7271))
  - `localOverrides` - Local overrides for feature flags that take precedence over remote flags
  - `rawRemoteFeatureFlags` - Raw flag value for all feature flags
- Export additional controller action types ([#7271](https://github.com/MetaMask/core/pull/7271))
  - `RemoteFeatureFlagControllerSetFlagOverrideAction`
  - `RemoteFeatureFlagControllerremoveFlagOverrideAction`
  - `RemoteFeatureFlagControllerclearAllFlagOverridesAction`

## [3.0.0]

### Added

- Add version-gated feature flags with multi-version support ([#7277](https://github.com/MetaMask/core/pull/7277))
  - Support for feature flags with multiple version entries: `{ versions: { "13.1.0": {...}, "13.2.0": {...} } }`
  - Automatic selection of highest qualifying version based on semantic version comparison
  - New utility functions: `isVersionFeatureFlag()`, `getVersionData()`, `isVersionAtLeast()`
  - Enhanced type safety with `VersionEntry` and `MultiVersionFeatureFlagValue` types
  - Comprehensive validation ensures only properly structured version entries are processed

### Changed

- **BREAKING:** Add required `clientVersion` parameter to constructor for version-based filtering (expects semantic version string of client app) ([#7277](https://github.com/MetaMask/core/pull/7277))

## [2.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [2.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6502](https://github.com/MetaMask/core/pull/6502))
  - Previously, `RemoteFeatureFlagController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6502](https://github.com/MetaMask/core/pull/6502))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [1.9.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [1.9.0]

### Added

- Export additional controller types from package index ([#6835](https://github.com/MetaMask/core/pull/6835))
  - Export `RemoteFeatureFlagControllerActions` - union type of all controller actions
  - Export `RemoteFeatureFlagControllerUpdateRemoteFeatureFlagsAction` - action type for updating feature flags
  - Export `RemoteFeatureFlagControllerEvents` - union type of all controller events
  - Export `RemoteFeatureFlagControllerStateChangeEvent` - state change event type

## [1.8.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6574](https://github.com/MetaMask/core/pull/6574))

### Changed

- Bump `@metamask/utils` from `^11.4.2` to `^11.8.1` ([#6588](https://github.com/MetaMask/core/pull/6588), [#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.4.1` ([#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632), [#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.14.1` ([#6303](https://github.com/MetaMask/core/pull/6303), [#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629), [#6807](https://github.com/MetaMask/core/pull/6807))

## [1.7.0]

### Added

- Add `EnvironmentType` `Beta`, `Test`, and `Exp` ([#6228](https://github.com/MetaMask/core/pull/6228))

### Changed

- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))
- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))
- Bump `@metamask/controller-utils` to `^11.11.0` ([#5439](https://github.com/MetaMask/core/pull/5439), [#5583](https://github.com/MetaMask/core/pull/5583), [#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812), [#5935](https://github.com/MetaMask/core/pull/5935), [#6069](https://github.com/MetaMask/core/pull/6069))

### Deprecated

- Deprecate `DistributionType` option `Beta` in favor of using `DistributionType` `Main` with `EnvironmentType` `Beta` ([#6228](https://github.com/MetaMask/core/pull/6228))

## [1.6.0]

### Added

- Add `DitributionType.Beta` flag ([#5407](https://github.com/MetaMask/core/pull/5407))

## [1.5.0]

### Added

- Export generateDeterministicRandomNumber for use within mobile ([#5341](https://github.com/MetaMask/core/pull/5341))

### Changed

- Bump `@metamask/utils` from `^11.1.0` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

## [1.4.0]

### Added

- Add `onBreak` and `onDegraded` methods to `ClientConfigApiService` ([#5109](https://github.com/MetaMask/core/pull/5109))
  - These serve the same purpose as the `onBreak` and `onDegraded` constructor options, but align more closely with the Cockatiel policy API.

### Changed

- Deprecate `ClientConfigApiService` constructor options `onBreak` and `onDegraded` in favor of methods ([#5109](https://github.com/MetaMask/core/pull/5109))
- Add `@metamask/controller-utils@^11.5.0` as a dependency ([#5109](https://github.com/MetaMask/core/pull/5109)), ([#5272](https://github.com/MetaMask/core/pull/5272))
  - `cockatiel` should still be in the dependency tree because it's now a dependency of `@metamask/controller-utils`
- Bump `@metamask/base-controller` from `^7.1.0` to `^8.0.0` ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

## [1.3.0]

### Changed

- Improve user segmentation with BigInt-based random generation ([#5110](https://github.com/MetaMask/core/pull/5110))
- Change getMetaMetricsId to only sync func type ([#5108](https://github.com/MetaMask/core/pull/5108))
- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.0` ([#5079](https://github.com/MetaMask/core/pull/5079))

## [1.2.0]

### Added

- Added support for threshold-based feature flag scoping ([#5051](https://github.com/MetaMask/core/pull/5051))
  - Enables percentage-based feature flag distribution across user base
  - Uses deterministic random group assignment based on metaMetricsId from the client

## [1.1.0]

### Added

- Update metadata to declare feature flags as anonymous ([#5004](https://github.com/MetaMask/core/pull/5004))
  - This lets us capture these in debug state snapshots to help diagnose errors

### Fixed

- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `cockatiel`

## [1.0.0]

### Added

- Initial release of the RemoteFeatureFlagController. ([#4931](https://github.com/MetaMask/core/pull/4931))
  - This controller manages the retrieval and caching of remote feature flags. It fetches feature flags from a remote API, caches them, and provides methods to access and manage these flags. The controller ensures that feature flags are refreshed based on a specified interval and handles cases where the controller is disabled or the network is unavailable.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@3.1.0...@metamask/remote-feature-flag-controller@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@3.0.0...@metamask/remote-feature-flag-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@2.0.1...@metamask/remote-feature-flag-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@2.0.0...@metamask/remote-feature-flag-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.9.1...@metamask/remote-feature-flag-controller@2.0.0
[1.9.1]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.9.0...@metamask/remote-feature-flag-controller@1.9.1
[1.9.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.8.0...@metamask/remote-feature-flag-controller@1.9.0
[1.8.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.7.0...@metamask/remote-feature-flag-controller@1.8.0
[1.7.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.6.0...@metamask/remote-feature-flag-controller@1.7.0
[1.6.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.5.0...@metamask/remote-feature-flag-controller@1.6.0
[1.5.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.4.0...@metamask/remote-feature-flag-controller@1.5.0
[1.4.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.3.0...@metamask/remote-feature-flag-controller@1.4.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.2.0...@metamask/remote-feature-flag-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.1.0...@metamask/remote-feature-flag-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.0.0...@metamask/remote-feature-flag-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/remote-feature-flag-controller@1.0.0
