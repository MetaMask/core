# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Send the CHOMP authentication timestamp as a number instead of a string in the associate-address step. ([#8610](https://github.com/MetaMask/core/pull/8610))

## [1.1.0]

### Added

- Add EIP-7702 authorization step to the upgrade sequence. ([#8565](https://github.com/MetaMask/core/pull/8565))

## [1.0.0]

### Added

- Add `MoneyAccountUpgradeController` with `upgradeAccount` method ([#8426](https://github.com/MetaMask/core/pull/8426))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.0.0...@metamask/money-account-upgrade-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-upgrade-controller@1.0.0
