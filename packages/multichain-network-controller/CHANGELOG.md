# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New method `getNetworksWithTransactionActivityByAccounts` to fetch active networks for multiple accounts in a single request ([#5551](https://github.com/MetaMask/core/pull/5551))
- New `MultichainNetworkService` for handling network activity fetching ([#5551](https://github.com/MetaMask/core/pull/5551))
- New types for network activity state and responses ([#5551](https://github.com/MetaMask/core/pull/5551))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.3.0...@metamask/multichain-network-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.2.0...@metamask/multichain-network-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.2...@metamask/multichain-network-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.1...@metamask/multichain-network-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.0...@metamask/multichain-network-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-network-controller@0.1.0
