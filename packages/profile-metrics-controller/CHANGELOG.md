# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** `ProfileMetricsController` now requires the `AccountsController:getState` action to be allowed ([#7471](https://github.com/MetaMask/core/pull/7471))
  - The controller messenger does not require `AccountsController:listAccounts` action anymore.

### Fixed

- Collect EVM and non-EVM accounts during initial sync ([#7471](https://github.com/MetaMask/core/pull/7471))

## [1.1.0]

### Changed

- Polling only starts on `KeyringController:unlock` if the user has opted in ([#7450](https://github.com/MetaMask/core/pull/7196))

## [1.0.0]

### Added

- Initial release ([#7194](https://github.com/MetaMask/core/pull/7194), [#7196](https://github.com/MetaMask/core/pull/7196), [#7263](https://github.com/MetaMask/core/pull/7263))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.0.0...@metamask/profile-metrics-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-metrics-controller@1.0.0
