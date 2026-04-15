# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- Release 840.0.0 ([#8078](https://github.com/MetaMask/core/pull/8078))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- Release 795.0.0 ([#7856](https://github.com/MetaMask/core/pull/7856))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- Release/752.0.0 ([#7642](https://github.com/MetaMask/core/pull/7642))
- chore(lint): Fix suppressed ESLint errors in `eth-block-tracker` package ([#7458](https://github.com/MetaMask/core/pull/7458))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- chore: Disable ESLint cache by default ([#7082](https://github.com/MetaMask/core/pull/7082))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- Release 625.0.0 ([#6883](https://github.com/MetaMask/core/pull/6883))
- chore: Fix invalid PR number in `eth-block-tracker` changelog ([#6881](https://github.com/MetaMask/core/pull/6881))

### Changed

- Bump `@metamask/eth-json-rpc-provider` from `^6.0.0` to `^6.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [15.0.1]

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))

## [15.0.0]

### Added

- Add `Context` generic parameter to `PollingBlockTracker` ([#7061](https://github.com/MetaMask/core/pull/7061))
  - This enables passing providers with different context types to the block tracker.

### Changed

- Bump `@metamask/eth-json-rpc-provider` from `^5.0.1` to `^6.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Use `InternalProvider` instead of `SafeEventEmitterProvider` ([#6796](https://github.com/MetaMask/core/pull/6796))
  - The block tracker expects a provider with an `InternalProvider` instead of a `SafeEventEmitterProvider`.
- **BREAKING:** Migrate to `JsonRpcEngineV2` ([#7001](https://github.com/MetaMask/core/pull/7001))

## [14.0.0]

### Changed

- **BREAKING:** Update minimum Node.js version from `^18.16.0` to `^18.18.0` ([#6865](https://github.com/MetaMask/core/pull/6865))
- This package was migrated from `MetaMask/eth-block-tracker` to the
  `MetaMask/core` monorepo ([#6865](https://github.com/MetaMask/core/pull/6865))
  - See [`MetaMask/eth-block-tracker`](https://github.com/MetaMask/eth-block-tracker/blob/main/CHANGELOG.md)
    for the original changelog.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-block-tracker@15.0.1...HEAD
[15.0.1]: https://github.com/MetaMask/core/compare/@metamask/eth-block-tracker@15.0.0...@metamask/eth-block-tracker@15.0.1
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-block-tracker@14.0.0...@metamask/eth-block-tracker@15.0.0
[14.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eth-block-tracker@14.0.0
