# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Use `InternalProvider` instead of `SafeEventEmitterProvider` ([#6796](https://github.com/MetaMask/core/pull/6796))
  - The block tracker expects a provider with an `InternalProvider` instead of a `SafeEventEmitterProvider`.

## [14.0.0]

### Changed

- **BREAKING:** Update minimum Node.js version from `^18.16.0` to `^18.18.0` ([#6865](https://github.com/MetaMask/core/pull/6865))
- This package was migrated from `MetaMask/eth-block-tracker` to the
  `MetaMask/core` monorepo ([#6865](https://github.com/MetaMask/core/pull/6865))
  - See [`MetaMask/eth-block-tracker`](https://github.com/MetaMask/eth-block-tracker/blob/main/CHANGELOG.md)
    for the original changelog.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-block-tracker@14.0.0...HEAD
[14.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eth-block-tracker@14.0.0
