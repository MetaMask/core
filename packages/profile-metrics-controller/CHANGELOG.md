# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ProfileMetricsController` contructor now accepts an optional `initialDelayDuration` parameter ([#7624](https://github.com/MetaMask/core/pull/7624))
  - The parameter can be used to override the default time-based delay for the first data collection after opt-in

### Changed

- **BREAKING:** `ProileMetricsControllerMessenger` now requires the `TransactionController:transactionSubmitted` action to be allowed ([#7624](https://github.com/MetaMask/core/pull/7624))
- Set time-based delay for first `ProfileMetricsController` data collection after opt-in ([#7624](https://github.com/MetaMask/core/pull/7624))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.18.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/accounts-controller` from `^35.0.0` to `^35.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/polling-controller` from `^16.0.0` to `^16.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))

## [2.0.0]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.1.0...@metamask/profile-metrics-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.0.0...@metamask/profile-metrics-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-metrics-controller@1.0.0
