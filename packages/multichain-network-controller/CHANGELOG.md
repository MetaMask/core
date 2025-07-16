# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

### Fixed

- Use `scopes` instead of `address` to retrieve the network of an account. ([#6072](https://github.com/MetaMask/core/pull/6072))

## [0.9.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))

## [0.8.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- Bump `@metamask/keyring-api` dependency from `^17.4.0` to `^18.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/keyring-internal-api` dependency from `^6.0.1` to `^6.2.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

## [0.7.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [0.6.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))

## [0.5.1]

### Changed

- Updated to restrict `getNetworksWithTransactionActivityByAccounts` to EVM networks only while non-EVM network endpoint support is being completed. Full multi-chain support will be restored in the coming weeks ([#5677](https://github.com/MetaMask/core/pull/5677))
- Updated network activity API requests to have batching support to handle URL length limitations, allowing the controller to fetch network activity for any number of accounts ([#5752](https://github.com/MetaMask/core/pull/5752))

## [0.5.0]

### Added

- Add method `getNetworksWithTransactionActivityByAccounts` to fetch active networks for multiple accounts in a single request ([#5551](https://github.com/MetaMask/core/pull/5551))
- Add `MultichainNetworkService` for handling network activity fetching ([#5551](https://github.com/MetaMask/core/pull/5551))
- Add types for network activity state and responses ([#5551](https://github.com/MetaMask/core/pull/5551))

### Changed

- Updated state management for network activity ([#5551](https://github.com/MetaMask/core/pull/5551))

## [0.4.0]

### Added

- Add Testnet asset IDs as constants ([#5589](https://github.com/MetaMask/core/pull/5589))
- Add Network specific decimal values and ticker as constants ([#5589](https://github.com/MetaMask/core/pull/5589))
- Add new method `removeNetwork` that acts as a proxy to remove an EVM network from the `@metamask/network-controller` ([#5516](https://github.com/MetaMask/core/pull/5516))

### Changed

- The `AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS` now includes non-EVM testnets ([#5589](https://github.com/MetaMask/core/pull/5589))
- Bump `@metamask/keyring-api"` from `^17.2.0` to `^17.4.0` ([#5565](https://github.com/MetaMask/core/pull/5565))

### Fixed

- Fix the condition to update the active network based on the `AccountsController:selectedAccountChange` event ([#5642](https://github.com/MetaMask/core/pull/5642))

## [0.3.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [0.2.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [0.1.2]

### Changed

- Bump `@metamask/keyring-api"` from `^17.0.0` to `^17.2.0` ([#5366](https://github.com/MetaMask/core/pull/5366))
- Bump `@metamask/utils` from `^11.1.0` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

## [0.1.1]

### Fixed

- Add `MultichainNetworkController:stateChange` to list of subscribable `MultichainNetworkController` messenger events ([#5331](https://github.com/MetaMask/core/pull/5331))

## [0.1.0]

### Added

- Initial release ([#5215](https://github.com/MetaMask/core/pull/5215))
  - Handle both EVM and non-EVM network and account switching for the associated network.
  - Act as a proxy for the `NetworkController` (for EVM network changes).

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.10.0...HEAD
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.9.0...@metamask/multichain-network-controller@0.10.0
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.8.0...@metamask/multichain-network-controller@0.9.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.7.0...@metamask/multichain-network-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.6.0...@metamask/multichain-network-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.5.1...@metamask/multichain-network-controller@0.6.0
[0.5.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.5.0...@metamask/multichain-network-controller@0.5.1
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.4.0...@metamask/multichain-network-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.3.0...@metamask/multichain-network-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.2.0...@metamask/multichain-network-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.2...@metamask/multichain-network-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.1...@metamask/multichain-network-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.0...@metamask/multichain-network-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-network-controller@0.1.0
