# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Fix dependency-related constraints ([#5464](https://github.com/MetaMask/core.git/pull/5464))

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

- Add `MultichainNetworkController:stateChange` to list of subscribable `MultichainNetworkController` messenger events ([#5331](https://github.com/MetaMask/core.git/pull/5331))

## [0.1.0]

### Added

- Initial release ([#5215](https://github.com/MetaMask/core/pull/5215))
  - Handle both EVM and non-EVM network and account switching for the associated network.
  - Act as a proxy for the `NetworkController` (for EVM network changes).

[Unreleased]: https://github.com/MetaMask/core.git/compare/@metamask/multichain-network-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core.git/compare/@metamask/multichain-network-controller@0.1.2...@metamask/multichain-network-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core.git/compare/@metamask/multichain-network-controller@0.1.1...@metamask/multichain-network-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core.git/compare/@metamask/multichain-network-controller@0.1.0...@metamask/multichain-network-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core.git/releases/tag/@metamask/multichain-network-controller@0.1.0
