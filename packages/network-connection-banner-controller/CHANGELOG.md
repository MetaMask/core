# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- refactor: add `.js` import extensions to Core Platform packages ([#9571](https://github.com/MetaMask/core/pull/9571))
- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))
- chore: MIT license text update ([#9472](https://github.com/MetaMask/core/pull/9472))

### Changed

- Bump `@metamask/network-enablement-controller` from `^5.4.1` to `^5.6.0` ([#9470](https://github.com/MetaMask/core/pull/9470), [#9520](https://github.com/MetaMask/core/pull/9520))

## [0.1.0]

### Added

- Add `NetworkConnectionBannerController`, which evaluates enabled network RPC
  health after initialization and manages degraded and unavailable banner state,
  dismissal, and switching custom RPC endpoints to an available Infura endpoint
  ([#9041](https://github.com/MetaMask/core/pull/9041))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-connection-banner-controller@0.1.0
