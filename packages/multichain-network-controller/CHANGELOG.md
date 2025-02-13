# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1]

### Added

- MVP release of `MultichainNetworkController` to handle both EVM and non-EVM network and account switching ([#5215](https://github.com/MetaMask/core/pull/5215))
- Added allowed actions - `NetworkControllerGetStateAction | NetworkControllerSetActiveNetworkAction`. The `MultichainNetworkController` acts as a proxy for the `NetworkController` and will update it based on EVM network changes.
- Added allowed events - `AccountsControllerSelectedAccountChangeEvent` to allowed events. This is used to subscribe to the `AccountsController:selectedAccountChange` event from the `AccountsController` and is responsible for updating active network based on account changes (both EVM and non-EVM).

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.0.1...HEAD
[0.0.1]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-network-controller@0.0.1
