# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1]

### Fixed

- Add `MultichainNetworkController:stateChange` to list of subscribable `MultichainNetworkController` messenger events ([#5331](https://github.com/MetaMask/core.git/pull/5331))

## [0.1.0]

### Added

- Initial release ([#5215](https://github.com/MetaMask/core/pull/5215))
  - Handle both EVM and non-EVM network and account switching for the associated network.
  - Act as a proxy for the `NetworkController` (for EVM network changes).

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.1...HEAD
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.0...@metamask/multichain-network-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-network-controller@0.1.0
