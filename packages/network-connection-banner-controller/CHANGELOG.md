# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/network-enablement-controller` from `^5.4.1` to `^5.5.0` ([#9470](https://github.com/MetaMask/core/pull/9470))

## [0.1.0]

### Added

- Add `NetworkConnectionBannerController`, which evaluates enabled network RPC
  health after initialization and manages degraded and unavailable banner state,
  dismissal, and switching custom RPC endpoints to an available Infura endpoint
  ([#9041](https://github.com/MetaMask/core/pull/9041))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-connection-banner-controller@0.1.0
