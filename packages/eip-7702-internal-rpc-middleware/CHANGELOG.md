# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of @metamask/eip-7702-internal-rpc-middleware
- `wallet_upgradeAccount` JSON-RPC method for upgrading EOA accounts to smart accounts using EIP-7702
- `wallet_getAccountUpgradeStatus` JSON-RPC method for checking account upgrade status
- Hook-based architecture with `upgradeAccount` and `getAccountUpgradeStatus` hooks
- Comprehensive TypeScript type definitions
- Security restrictions limiting access to preinstalled snaps only
- Full test coverage with Jest
- Documentation and examples

### Changed

- Return the address to which an account is upgraded to in `wallet_getAccountUpgradeStatus` response
- Update package configuration and dependencies
- Fix linter issues and improve code quality

[Unreleased]: https://github.com/MetaMask/core/
