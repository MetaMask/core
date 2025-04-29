# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))

### Changed

- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.6.0...HEAD
[1.6.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.5.0...@metamask/remote-feature-flag-controller@1.6.0
[1.5.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.4.0...@metamask/remote-feature-flag-controller@1.5.0
[1.4.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.3.0...@metamask/remote-feature-flag-controller@1.4.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.2.0...@metamask/remote-feature-flag-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.1.0...@metamask/remote-feature-flag-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.0.0...@metamask/remote-feature-flag-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/remote-feature-flag-controller@1.0.0
