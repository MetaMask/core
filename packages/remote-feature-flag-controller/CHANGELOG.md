# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- Initial release of the RemoteFeatureFlagController. ([#4931](https://github.com/MetaMask/core/pull/4931))
  - This controller manages the retrieval and caching of remote feature flags. It fetches feature flags from a remote API, caches them, and provides methods to access and manage these flags. The controller ensures that feature flags are refreshed based on a specified interval and handles cases where the controller is disabled or the network is unavailable.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/remote-feature-flag-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/remote-feature-flag-controller@1.0.0
