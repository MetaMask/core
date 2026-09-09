# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- Bump `@metamask/utils` from `^11.11.0` to `^11.12.0` ([#10076](https://github.com/MetaMask/core/pull/10076))

## [1.0.1]

### Changed

- Bump `@metamask/superstruct` from `^3.1.0` to `^3.4.1` ([#9754](https://github.com/MetaMask/core/pull/9754))
- Bump `@tanstack/query-core` from `^4.43.0` to `^5.62.16` ([#9712](https://github.com/MetaMask/core/pull/9712))
- Bump `@metamask/base-data-service` from `^0.1.3` to `^1.0.0` ([#9972](https://github.com/MetaMask/core/pull/9972))

## [1.0.0]

### Added

- Initial commit ([#9466](https://github.com/MetaMask/core/pull/9466))
  - Supports `getNetworks`, `simulateTransactions`, `submitRelayTransaction`, and `getSmartTransaction`

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@1.0.1...HEAD
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@1.0.0...@metamask/sentinel-api-service@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/sentinel-api-service@1.0.0
