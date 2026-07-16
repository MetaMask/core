# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Bump minimum Node.js version to 22 ([#9168](https://github.com/MetaMask/core/pull/9168))
- Bump `@metamask/utils` from `^11.11.0` to `^11.12.0` ([#10076](https://github.com/MetaMask/core/pull/10076))

## [0.2.1]

### Changed

- Bump `@metamask/network-enablement-controller` from `^6.0.3` to `^6.0.5` ([#9923](https://github.com/MetaMask/core/pull/9923), [#9969](https://github.com/MetaMask/core/pull/9969))
- Bump `@metamask/network-controller` from `^35.0.1` to `^36.0.0` ([#9969](https://github.com/MetaMask/core/pull/9969))

## [0.2.0]

### Changed

- **BREAKING:** `NetworkConnectionBannerControllerMessenger` now requires `ClientController:stateChange` to be delegated instead of `ClientController:stateChanged` ([#9893](https://github.com/MetaMask/core/pull/9893))
- Bump `@metamask/network-controller` from `^35.0.0` to `^35.0.1` ([#9758](https://github.com/MetaMask/core/pull/9758))
- Bump `@metamask/network-enablement-controller` from `^6.0.1` to `^6.0.3` ([#9740](https://github.com/MetaMask/core/pull/9740), [#9791](https://github.com/MetaMask/core/pull/9791))
- Bump `@metamask/keyring-controller` from `^27.1.0` to `^27.1.1` ([#9791](https://github.com/MetaMask/core/pull/9791))

## [0.1.2]

### Changed

- Bump `@metamask/network-controller` from `^34.0.0` to `^35.0.0` ([#9735](https://github.com/MetaMask/core/pull/9735))
- Bump `@metamask/network-enablement-controller` from `^6.0.0` to `^6.0.1` ([#9735](https://github.com/MetaMask/core/pull/9735))

## [0.1.1]

### Changed

- Bump `@metamask/network-enablement-controller` from `^5.4.1` to `^6.0.0` ([#9470](https://github.com/MetaMask/core/pull/9470), [#9520](https://github.com/MetaMask/core/pull/9520), [#9706](https://github.com/MetaMask/core/pull/9706))

## [0.1.0]

### Added

- Add `NetworkConnectionBannerController`, which evaluates enabled network RPC
  health after initialization and manages degraded and unavailable banner state,
  dismissal, and switching custom RPC endpoints to an available Infura endpoint
  ([#9041](https://github.com/MetaMask/core/pull/9041))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.2.1...HEAD
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.2.0...@metamask/network-connection-banner-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.2...@metamask/network-connection-banner-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.1...@metamask/network-connection-banner-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.0...@metamask/network-connection-banner-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-connection-banner-controller@0.1.0
