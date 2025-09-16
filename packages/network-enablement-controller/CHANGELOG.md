# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

## [1.1.0]

### Added

- Add `enableNetworkInNamespace()` method to enable a network within a specific namespace while disabling all other networks in that same namespace, providing namespace-specific exclusive behavior ([#6602](https://github.com/MetaMask/core/pull/6602))

## [1.0.0]

### Changed

- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- **BREAKING:** `enableNetwork()` and `enableAllPopularNetworks()` now disable networks across all namespaces instead of only within the same namespace, implementing truly exclusive network selection across all blockchain types ([#6591](https://github.com/MetaMask/core/pull/6591))

## [0.6.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6472](https://github.com/MetaMask/core/pull/6472))

## [0.5.0]

### Added

- Add Solana and Bitcoin testnet support with the default values disabled ([#6532](https://github.com/MetaMask/core/pull/6532))
- Add Bitcoin network support with automatic enablement when configured in MultichainNetworkController ([#6455](https://github.com/MetaMask/core/pull/6455))
- Add `BtcScope` enum for Bitcoin mainnet and testnet caip chain IDs ([#6455](https://github.com/MetaMask/core/pull/6455))
- Add Bitcoin network enablement logic to `init()` and `enableAllPopularNetworks()` methods ([#6455](https://github.com/MetaMask/core/pull/6455))

### Changed

- Add Bitcoin testnet and signet networks with default disabled state, with only mainnet enabled by default ([#6474](https://github.com/MetaMask/core/pull/6474))
- **BREAKING:** Allow disabling the last remaining network in a namespace to align with BIP-44, where account groups shouldn't be forced to always keep at least one active network ([#6499](https://github.com/MetaMask/core/pull/6499))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@1.0.0...@metamask/network-enablement-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.6.0...@metamask/network-enablement-controller@1.0.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.5.0...@metamask/network-enablement-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.4.0...@metamask/network-enablement-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.3.0...@metamask/network-enablement-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.2.0...@metamask/network-enablement-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.1.1...@metamask/network-enablement-controller@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.1.0...@metamask/network-enablement-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-enablement-controller@0.1.0
