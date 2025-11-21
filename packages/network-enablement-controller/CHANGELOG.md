# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release 690.0.0 ([#7215](https://github.com/MetaMask/core/pull/7215))

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209))
  - The dependencies moved are:
    - `@metamask/multichain-network-controller` (^3.0.0)
    - `@metamask/network-controller` (^26.0.0)
    - `@metamask/transaction-controller` (^62.1.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

## [4.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/network-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/multichain-network-controller` from `^2.0.0` to `^3.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

### Fixed

- include additional popular networks now enabled by default ([#7014](https://github.com/MetaMask/core/pull/7014))

## [3.1.0]

### Added

- Add Monad network into constant POPULAR_NETWORKS ([#6978](https://github.com/MetaMask/core/pull/6978))

## [3.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6540](https://github.com/MetaMask/core/pull/6540))
  - Previously, `NetworkEnablementController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6540](https://github.com/MetaMask/core/pull/6540))
- **BREAKING:** Bump `@metamask/multichain-network-controller` from `^1.0.0` to `^2.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^60.0.0` to `^61.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [2.1.2]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- Bump `@metamask/transaction-controller` from `^60.7.0` to `^60.8.0` ([#6883](https://github.com/MetaMask/core/pull/6883))

## [2.1.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [2.1.0]

### Added

- Add Tron network support ([#6734](https://github.com/MetaMask/core/pull/6734))
  - Adds Tron namespace to the enabled networks map
  - Reuses the Keyring API types instead of redeclaring them in the controller

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- Improved network addition logic — if multiple popular networks are enabled and the user is in popular networks mode, adding another popular network keeps the current selection; otherwise, it switches to the newly added network. ([#6693](https://github.com/MetaMask/core/pull/6693))

## [2.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/multichain-network-controller` from `^0.11.0` to `^1.0.0` ([#6652](https://github.com/MetaMask/core/pull/6652), [#6676](https://github.com/MetaMask/core/pull/6676))

## [1.2.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

### Fixed

- Fix `init()` method to preserve existing user network settings instead of resetting them, while syncing with NetworkController and MultichainNetworkController states ([#6658](https://github.com/MetaMask/core/pull/6658))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@3.1.0...@metamask/network-enablement-controller@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@3.0.0...@metamask/network-enablement-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@2.1.2...@metamask/network-enablement-controller@3.0.0
[2.1.2]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@2.1.1...@metamask/network-enablement-controller@2.1.2
[2.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@2.1.0...@metamask/network-enablement-controller@2.1.1
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@2.0.0...@metamask/network-enablement-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@1.2.0...@metamask/network-enablement-controller@2.0.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@1.1.0...@metamask/network-enablement-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@1.0.0...@metamask/network-enablement-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.6.0...@metamask/network-enablement-controller@1.0.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.5.0...@metamask/network-enablement-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.4.0...@metamask/network-enablement-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.3.0...@metamask/network-enablement-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.2.0...@metamask/network-enablement-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.1.1...@metamask/network-enablement-controller@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-enablement-controller@0.1.0...@metamask/network-enablement-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-enablement-controller@0.1.0
