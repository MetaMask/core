# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- fix(deps): update dependency deepmerge to ^4.3.1 ([#10437](https://github.com/MetaMask/core/pull/10437))
- chore(deps): update dependency tsx to ^4.23.15 ([#10434](https://github.com/MetaMask/core/pull/10434))
- chore(deps): update dependency tsx to ^4.23.13 ([#10369](https://github.com/MetaMask/core/pull/10369))
- chore(deps): update dependency rimraf to v6 ([#10379](https://github.com/MetaMask/core/pull/10379))
- chore(deps): update dependency @metamask/auto-changelog to ^6.2.1 ([#10364](https://github.com/MetaMask/core/pull/10364))
- chore(deps): update dependency ts-jest to ^29.4.12 ([#10328](https://github.com/MetaMask/core/pull/10328))
- chore(deps): update dependency rimraf to ^5.0.10 ([#10327](https://github.com/MetaMask/core/pull/10327))
- Update lint:tsc to run against all packages & remove it from CI ([#10215](https://github.com/MetaMask/core/pull/10215))
- chore: integrate `@metamask/utils` into `packages/` ([#10185](https://github.com/MetaMask/core/pull/10185))

### Changed

- Bump `@metamask/utils` from `^11.12.0` to `^12.0.0` ([#10192](https://github.com/MetaMask/core/pull/10192))
- Bump `@metamask/keyring-controller` from `^28.0.0` to `^28.1.0` ([#10418](https://github.com/MetaMask/core/pull/10418))
- Bump `@metamask/network-enablement-controller` from `^7.0.0` to `^7.0.1` ([#10423](https://github.com/MetaMask/core/pull/10423))

## [1.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/utils` from `^11.11.0` to `^11.12.0` ([#10076](https://github.com/MetaMask/core/pull/10076))
- Bump `@metamask/base-controller` from `^9.1.0` to `^10.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/client-controller` from `^1.0.1` to `^2.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/connectivity-controller` from `^0.3.0` to `^1.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/keyring-controller` from `^27.1.1` to `^28.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/messenger` from `^2.0.0` to `^3.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/network-controller` from `^36.0.0` to `^37.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/network-enablement-controller` from `^6.0.5` to `^7.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.2.1...@metamask/network-connection-banner-controller@1.0.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.2.0...@metamask/network-connection-banner-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.2...@metamask/network-connection-banner-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.1...@metamask/network-connection-banner-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/network-connection-banner-controller@0.1.0...@metamask/network-connection-banner-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/network-connection-banner-controller@0.1.0
