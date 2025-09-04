# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/base-controller` from `^8.2.0` to `^8.3.0` ([#6465](https://github.com/MetaMask/core/pull/6465))

## [0.4.0]

### Added

- Add `enableAllPopularNetworks()` method to enable all popular networks and Solana mainnet simultaneously ([#6367](https://github.com/MetaMask/core/pull/6367))

### Changed

- **BREAKING:** `enableNetwork()` now implements exclusive behavior - disables all other networks in the same namespace before enabling the target network ([#6367](https://github.com/MetaMask/core/pull/6367))
- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

## [0.3.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` from `^59.0.0` to `^60.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))

## [0.2.0]

### Added

- Add `init()` method to safely initialize network enablement state from controller configurations ([#6329](https://github.com/MetaMask/core/pull/6329))

### Changed

- Change transaction listener from `TransactionController:transactionConfirmed` to `TransactionController:transactionSubmitted` for earlier network enablement ([#6329](https://github.com/MetaMask/core/pull/6329))
- Update transaction event handler to properly access chainId from nested transactionMeta structure ([#6329](https://github.com/MetaMask/core/pull/6329))
- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))

## [0.1.1]

### Added

- add `isNetworkEnabled` method to check if network is enabled ([#6287](https://github.com/MetaMask/core/pull/6287))
- add `Palm network` and `HypeEVM` network to list of popular network ([#6287](https://github.com/MetaMask/core/pull/6287))

### Changed

- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))

## [0.1.0]

### Added

- Initial release ([#6028](https://github.com/MetaMask/core/pull/6028))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.3.0...@metamask/network-enablement-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.2.0...@metamask/network-enablement-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.1.1...@metamask/network-enablement-controller@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.1.0...@metamask/network-enablement-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-enablement-controller@0.1.0
