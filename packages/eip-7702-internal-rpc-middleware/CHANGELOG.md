# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- gpg: Signature made Tue Mar 31 02:24:17 2026 CDT
- gpg: Signature made Mon Feb 23 14:58:09 2026 CST
- gpg: Signature made Thu Feb 19 12:50:28 2026 CST
- gpg: Signature made Wed Feb 11 07:30:36 2026 CST
- gpg: Signature made Tue Feb 10 19:37:44 2026 CST
- gpg: Signature made Fri Jan 30 09:44:43 2026 CST
- gpg: Signature made Thu Jan 8 03:09:57 2026 CST
- gpg: Signature made Fri Dec 19 15:45:15 2025 CST
- gpg: Signature made Wed Dec 17 16:42:20 2025 CST
- gpg: Signature made Mon Dec 15 04:35:54 2025 CST
- gpg: Signature made Wed Dec 3 14:45:02 2025 CST
- gpg: Signature made Wed Dec 3 08:46:52 2025 CST
- gpg: Signature made Thu Nov 20 05:28:21 2025 CST
- gpg: Signature made Thu Nov 20 03:33:06 2025 CST
- gpg: Signature made Thu Nov 20 03:04:39 2025 CST
- gpg: Signature made Fri Nov 7 07:50:00 2025 CST
- gpg: Signature made Mon Nov 3 08:16:58 2025 CST
- gpg: Signature made Thu Oct 30 04:11:45 2025 CDT

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.20.0` ([#7202](https://github.com/MetaMask/core/pull/7202), [#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7995](https://github.com/MetaMask/core/pull/7995), [#8344](https://github.com/MetaMask/core/pull/8344))

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
