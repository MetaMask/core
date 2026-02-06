# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
