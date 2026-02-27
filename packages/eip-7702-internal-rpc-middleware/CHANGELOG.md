# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- chore(lint): Fix suppressed ESLint errors in `eip-7702-internal-rpc-middleware` package ([#7476](https://github.com/MetaMask/core/pull/7476))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- chore: Re-enable `@typescript-eslint/no-unnecessary-type-assertions` ([#7296](https://github.com/MetaMask/core/pull/7296))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- Release/650.0.0 ([#7003](https://github.com/MetaMask/core/pull/7003))

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
