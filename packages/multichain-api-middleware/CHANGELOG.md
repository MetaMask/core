# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release/417.0.0 ([#5888](https://github.com/MetaMask/core/pull/5888))
- chore: update accounts/snaps deps ([#5871](https://github.com/MetaMask/core/pull/5871))

### Changed

- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))
- Bump `@metamask/network-controller` to `^23.6.0` ([#5935](https://github.com/MetaMask/core/pull/5935), [#5882](https://github.com/MetaMask/core/pull/5882))
- Bump `@metamask/chain-agnostic-permission` to `^0.7.1` ([#5982](https://github.com/MetaMask/core/pull/5982))

## [0.4.0]

### Added

- When `wallet_createSession` handler is called with `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (solana mainnet) as a requested scope, but there are not currently any accounts in the wallet supporting this scope, we now add a `promptToCreateSolanaAccount` to a metadata object on the `requestPermissions` call forwarded to the `PermissionsController`.

## [0.3.0]

### Added

- Add more chain-agnostic-permission utility functions from sip-26 usage ([#5609](https://github.com/MetaMask/core/pull/5609))

### Changed

- Bump `@metamask/chain-agnostic-permission` to `^0.7.0` ([#5715](https://github.com/MetaMask/core/pull/5715),[#5760](https://github.com/MetaMask/core/pull/5760), [#5818](https://github.com/MetaMask/core/pull/5818))
- Bump `@metamask/api-specs` to `^0.14.0` ([#5817](https://github.com/MetaMask/core/pull/5817))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))
- Bump `@metamask/network-controller` to `^23.5.0` ([#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))

## [0.2.0]

### Added

- Add `wallet_createSession` handler ([#5647](https://github.com/MetaMask/core/pull/5647))
- Add `Caip25Errors` from `@metamask/chain-agnostic-permission` package ([#5566](https://github.com/MetaMask/core/pull/5566))

### Changed

- Bump `@metamask/chain-agnostic-permission` to `^0.4.0` ([#5674](https://github.com/MetaMask/core/pull/5674))
- Bump `@metamask/network-controller` to `^23.2.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

## [0.1.1]

### Added

- Add `MultichainApiNotifications` enum to standardize notification method names ([#5491](https://github.com/MetaMask/core/pull/5491))

### Changed

- Bump `@metamask/network-controller` to `^23.1.0` ([#5507](https://github.com/MetaMask/core/pull/5507), [#5518](https://github.com/MetaMask/core/pull/5518))
- Bump `@metamask/chain-agnostic-permission` to `^0.2.0` ([#5518](https://github.com/MetaMask/core/pull/5518))

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.3.0...@metamask/multichain-api-middleware@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.2.0...@metamask/multichain-api-middleware@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.1.1...@metamask/multichain-api-middleware@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.1.0...@metamask/multichain-api-middleware@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-api-middleware@0.1.0
