# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Fix the ChompApiService:createUpgrade call in the EIP-7702 auth step, pasing correct arguments ([#8657](https://github.com/MetaMask/core/pull/8657))

## [1.3.0]

### Changed

- Bump `@metamask/chomp-api-service` from `^2.0.0` to `^3.0.0` ([#8651](https://github.com/MetaMask/core/pull/8651))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/keyring-controller` from `^25.2.0` to `^25.3.0` ([#8634](https://github.com/MetaMask/core/pull/8634))
- Bump `@metamask/network-controller` from `^30.0.1` to `^30.1.0` ([#8636](https://github.com/MetaMask/core/pull/8636))

### Fixed

- Fix the associate-address step to detect the already-associated case via `status: 'active'`. ([#8635](https://github.com/MetaMask/core/pull/8635))

## [1.2.0]

### Changed

- Bump `@metamask/chomp-api-service` from `^1.0.0` to `^2.0.0` ([#8618](https://github.com/MetaMask/core/pull/8618))

### Fixed

- Send the CHOMP authentication timestamp as a number instead of a string in the associate-address step. ([#8610](https://github.com/MetaMask/core/pull/8610))

## [1.1.0]

### Added

- Add EIP-7702 authorization step to the upgrade sequence. ([#8565](https://github.com/MetaMask/core/pull/8565))

## [1.0.0]

### Added

- Add `MoneyAccountUpgradeController` with `upgradeAccount` method ([#8426](https://github.com/MetaMask/core/pull/8426))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.3.0...HEAD
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.2.0...@metamask/money-account-upgrade-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.1.0...@metamask/money-account-upgrade-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.0.0...@metamask/money-account-upgrade-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-upgrade-controller@1.0.0
