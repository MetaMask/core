# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- Initial release ([#10699](https://github.com/MetaMask/core/pull/10699), [#10698](https://github.com/MetaMask/core/pull/10698), [#11369](https://github.com/MetaMask/core/pull/11369))
  - Add `MoneyAccountLifecycleController`, which tracks whether the primary Money Account is a single-factor (SFA) or multi-factor (MFA) account using CHOMP derived identities
  - Add `init`, `refresh`, `getMoneyAccountIdentity`, `upgradeMoneyAccount`, and `startMigration` methods, each also exposed through the messenger
  - `startMigration` migrates the Money Account, including a Money Account Plus subscription and its funds, to the MPC Money Account, and resumes a migration that is in flight

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-lifecycle-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-lifecycle-controller@1.0.0
