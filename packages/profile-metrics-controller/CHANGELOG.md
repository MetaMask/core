# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^36.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/polling-controller` from `^16.0.2` to `^16.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/transaction-controller` from `^62.17.0` to `^62.19.0` ([#7996](https://github.com/MetaMask/core/pull/7996), [#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [3.0.1]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.2` to `^36.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/profile-sync-controller` from `^27.0.0` to `^27.1.0` ([#7849](https://github.com/MetaMask/core/pull/7849))
- Bump `@metamask/transaction-controller` from `^62.9.2` to `^62.17.0` ([#7737](https://github.com/MetaMask/core/pull/7737), [#7760](https://github.com/MetaMask/core/pull/7760), [#7775](https://github.com/MetaMask/core/pull/7775), [#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832), [#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872)), ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/keyring-controller` from `^25.0.0` to `^25.1.0` ([#7713](https://github.com/MetaMask/core/pull/7713))

## [3.0.0]

### Added

- `ProfileMetricsController` contructor now accepts an optional `initialDelayDuration` parameter ([#7624](https://github.com/MetaMask/core/pull/7624))
  - The parameter can be used to override the default time-based delay for the first data collection after opt-in
- Add `skipInitialDelay()` method to `ProfileMetricsController` ([#7624](https://github.com/MetaMask/core/pull/7624))
  - The method can be also called through the `ProfileMetricsController:skipInitialDelay` action via messenger

### Changed

- **BREAKING:** `ProileMetricsControllerMessenger` now requires the `TransactionController:transactionSubmitted` action to be allowed ([#7624](https://github.com/MetaMask/core/pull/7624))
- Set time-based delay for first `ProfileMetricsController` data collection after opt-in ([#7624](https://github.com/MetaMask/core/pull/7624))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.18.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/accounts-controller` from `^35.0.0` to `^35.0.2` ([#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/polling-controller` from `^16.0.0` to `^16.0.2` ([#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.0.1...HEAD
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.0.0...@metamask/profile-metrics-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@2.0.0...@metamask/profile-metrics-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.1.0...@metamask/profile-metrics-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.0.0...@metamask/profile-metrics-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-metrics-controller@1.0.0
