# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0]

### Added

- Add `clearState` method, also exposed through the messenger, which clears all recorded lifecycles and address registrations, for example when the wallet is reset ([#11533](https://github.com/MetaMask/core/pull/11533))

### Changed

- Bump `@metamask/subscription-controller` from `^15.2.1` to `^15.2.2` ([#11472](https://github.com/MetaMask/core/pull/11472))
- Bump `@metamask/keyring-controller` from `^28.2.0` to `^28.2.2` ([#11474](https://github.com/MetaMask/core/pull/11474), [#11537](https://github.com/MetaMask/core/pull/11537))
- Bump `@metamask/utils` from `^12.0.1` to `^12.0.2` ([#11474](https://github.com/MetaMask/core/pull/11474))
- Bump `@metamask/money-account-controller` from `^3.0.0` to `^3.0.1` ([#11537](https://github.com/MetaMask/core/pull/11537))

## [1.0.0]

### Added

- Initial release ([#10699](https://github.com/MetaMask/core/pull/10699), [#10698](https://github.com/MetaMask/core/pull/10698), [#11369](https://github.com/MetaMask/core/pull/11369))
  - Add `MoneyAccountLifecycleController`, which tracks whether the primary Money Account is a single-factor (SFA) or multi-factor (MFA) account using CHOMP derived identities
  - Add `init`, `refresh`, `getMoneyAccountIdentity`, `upgradeMoneyAccount`, and `startMigration` methods, each also exposed through the messenger
  - `startMigration` migrates the Money Account, including a Money Account Plus subscription and its funds, to the MPC Money Account, and resumes a migration that is in flight

### Changed

- Bump `@metamask/chomp-api-service` from `^7.0.0` to `^7.1.0` ([#11437](https://github.com/MetaMask/core/pull/11437))
- Bump `@metamask/money-account-upgrade-controller` from `^6.0.1` to `^7.0.0` ([#11437](https://github.com/MetaMask/core/pull/11437))
- Bump `@metamask/subscription-controller` from `^15.2.0` to `^15.2.1` ([#11437](https://github.com/MetaMask/core/pull/11437))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-lifecycle-controller@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-lifecycle-controller@1.0.0...@metamask/money-account-lifecycle-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-lifecycle-controller@1.0.0
