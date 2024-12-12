# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0]

### Added

- Added support for threshold-based feature flag scoping ([#5051](https://github.com/MetaMask/core/pull/5051))
  - Enables percentage-based feature flag distribution across user base
  - Uses deterministic random group assignment based on metaMetricsId

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.2.0...HEAD
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.1.0...@metamask/remote-feature-flag-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.0.0...@metamask/remote-feature-flag-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/remote-feature-flag-controller@1.0.0
