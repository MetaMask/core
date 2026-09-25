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
- chore(deps): update dependency nock to ^13.5.6 ([#10361](https://github.com/MetaMask/core/pull/10361))
- chore(deps): update dependency rimraf to ^5.0.10 ([#10327](https://github.com/MetaMask/core/pull/10327))
- Update lint:tsc to run against all packages & remove it from CI ([#10215](https://github.com/MetaMask/core/pull/10215))
- chore: integrate `@metamask/utils` into `packages/` ([#10185](https://github.com/MetaMask/core/pull/10185))

### Changed

- Bump `@metamask/utils` from `^11.12.0` to `^12.0.0` ([#10192](https://github.com/MetaMask/core/pull/10192))
- Bump `@tanstack/query-core` from `^5.62.16` to `^5.89.0` ([#9324](https://github.com/MetaMask/core/pull/9324))

## [2.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/utils` from `^11.11.0` to `^11.12.0` ([#10076](https://github.com/MetaMask/core/pull/10076))
- Bump `@metamask/base-data-service` from `^1.0.0` to `^2.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/controller-utils` from `^12.3.0` to `^13.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/messenger` from `^2.0.0` to `^3.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))

## [1.0.1]

### Changed

- Bump `@metamask/superstruct` from `^3.1.0` to `^3.4.1` ([#9754](https://github.com/MetaMask/core/pull/9754))
- Bump `@tanstack/query-core` from `^4.43.0` to `^5.62.16` ([#9712](https://github.com/MetaMask/core/pull/9712))
- Bump `@metamask/base-data-service` from `^0.1.3` to `^1.0.0` ([#9972](https://github.com/MetaMask/core/pull/9972))

## [1.0.0]

### Added

- Initial commit ([#9466](https://github.com/MetaMask/core/pull/9466))
  - Supports `getNetworks`, `simulateTransactions`, `submitRelayTransaction`, and `getSmartTransaction`

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@1.0.1...@metamask/sentinel-api-service@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@1.0.0...@metamask/sentinel-api-service@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/sentinel-api-service@1.0.0
