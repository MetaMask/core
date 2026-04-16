# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/accounts-controller` from `^37.1.1` to `^37.2.0` ([#8363](https://github.com/MetaMask/core/pull/8363))
- Bump `@metamask/keyring-controller` from `^25.1.1` to `^25.2.0` ([#8363](https://github.com/MetaMask/core/pull/8363))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/transaction-controller` from `^64.0.0` to `^64.3.0` ([#8432](https://github.com/MetaMask/core/pull/8432), [#8447](https://github.com/MetaMask/core/pull/8447), [#8482](https://github.com/MetaMask/core/pull/8482))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [3.1.3]

### Changed

- Bump `@metamask/transaction-controller` from `^63.3.1` to `^64.0.0` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/accounts-controller` from `^37.1.0` to `^37.1.1` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/profile-sync-controller` from `^28.0.1` to `^28.0.2` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))

## [3.1.2]

### Changed

- Bump `@metamask/accounts-controller` from `^37.0.0` to `^37.1.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/keyring-controller` from `^25.1.0` to `^25.1.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/polling-controller` from `^16.0.3` to `^16.0.4` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/profile-sync-controller` from `^28.0.0` to `^28.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/transaction-controller` from `^63.0.0` to `^63.3.1` ([#8272](https://github.com/MetaMask/core/pull/8272), [#8301](https://github.com/MetaMask/core/pull/8301), [#8313](https://github.com/MetaMask/core/pull/8313), [#8317](https://github.com/MetaMask/core/pull/8317))

## [3.1.1]

### Changed

- Bump `@metamask/transaction-controller` from `^62.22.0` to `^63.0.0` ([#8225](https://github.com/MetaMask/core/pull/8225))

## [3.1.0]

### Changed

- Reduce default initial delay duration from 10 minutes to 1 minute ([#8216](https://github.com/MetaMask/core/pull/8216))
- Bump `@metamask/transaction-controller` from `^62.21.0` to `^62.22.0` ([#8217](https://github.com/MetaMask/core/pull/8217))

## [3.0.4]

### Fixed

- Strip cookies from `ProfileMetricsService` fetch requests preventing `431 Request Header Fields Too Large` errors caused by cookies being forwarded to the authentication API ([#8209](https://github.com/MetaMask/core/pull/8209))

## [3.0.3]

### Changed

- Bump `@metamask/profile-sync-controller` from `^27.1.0` to `^28.0.0` ([#8162](https://github.com/MetaMask/core/pull/8162))

### Fixed

- Move bearer token acquisition inside the retry loop in `ProfileMetricsService.submitMetrics` so each retry attempt fetches a fresh token instead of reusing a potentially stale one ([#8144](https://github.com/MetaMask/core/pull/8144))

## [3.0.2]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^37.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996)), ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/polling-controller` from `^16.0.2` to `^16.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/transaction-controller` from `^62.17.0` to `^62.21.0` ([#7996](https://github.com/MetaMask/core/pull/7996), [#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031) [#8104](https://github.com/MetaMask/core/pull/8104)), ([#8140](https://github.com/MetaMask/core/pull/8140))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.1.3...HEAD
[3.1.3]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.1.2...@metamask/profile-metrics-controller@3.1.3
[3.1.2]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.1.1...@metamask/profile-metrics-controller@3.1.2
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.1.0...@metamask/profile-metrics-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.0.4...@metamask/profile-metrics-controller@3.1.0
[3.0.4]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.0.3...@metamask/profile-metrics-controller@3.0.4
[3.0.3]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.0.2...@metamask/profile-metrics-controller@3.0.3
[3.0.2]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.0.1...@metamask/profile-metrics-controller@3.0.2
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@3.0.0...@metamask/profile-metrics-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@2.0.0...@metamask/profile-metrics-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.1.0...@metamask/profile-metrics-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-metrics-controller@1.0.0...@metamask/profile-metrics-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-metrics-controller@1.0.0
