# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.0.0] - 2025-01-XX

### Added

- Initial release of @metamask/eip-7702-internal-rpc-middleware
- `wallet_upgradeAccount` JSON-RPC method for upgrading EOA accounts to smart accounts using EIP-7702
- `wallet_getAccountUpgradeStatus` JSON-RPC method for checking account upgrade status
- Hook-based architecture with `upgradeAccount` and `getAccountUpgradeStatus` hooks
- Comprehensive TypeScript type definitions
- Security restrictions limiting access to preinstalled snaps only
- Full test coverage with Jest
- Documentation and examples
