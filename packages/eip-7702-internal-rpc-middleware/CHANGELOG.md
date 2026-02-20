# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.19.0` ([#7202](https://github.com/MetaMask/core/pull/7202), [#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7995](https://github.com/MetaMask/core/pull/7995))

## [0.1.0]

### Added

- Initial release of `@metamask/eip-7702-internal-rpc-middleware` ([#6911](https://github.com/MetaMask/core/pull/6911))
- `wallet_upgradeAccount` JSON-RPC method for upgrading EOA accounts to smart accounts using EIP-7702 ([#6789](https://github.com/MetaMask/core/pull/6789))
- `wallet_getAccountUpgradeStatus` JSON-RPC method for checking account upgrade status ([#6789](https://github.com/MetaMask/core/pull/6789))
- Hook-based architecture with `upgradeAccount` and `getAccountUpgradeStatus` hooks ([#6789](https://github.com/MetaMask/core/pull/6789))
- Comprehensive TypeScript type definitions ([#6789](https://github.com/MetaMask/core/pull/6789))
- Documentation and examples ([#6789](https://github.com/MetaMask/core/pull/6789))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eip-7702-internal-rpc-middleware@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eip-7702-internal-rpc-middleware@0.1.0
