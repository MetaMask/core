# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore(deps): update dependency typedoc-plugin-missing-exports to ^2.3.0 ([#10710](https://github.com/MetaMask/core/pull/10710))

## [2.1.0]

### Added

- Add `getNetwork` method and `SentinelApiService:getNetwork` action to retrieve the configuration of a single network from the `/network` endpoint ([#10676](https://github.com/MetaMask/core/pull/10676))
  - Responses are cached for 5 minutes per chain.
  - Throws `SentinelChainNotSupportedError` if the chain is not in the supported-network registry.
  - Add `cubistSigners` and `simulationIncludeFees` properties to the `SentinelNetwork` type.

### Changed

- Bump `@metamask/utils` from `^11.12.0` to `^12.0.0` ([#10192](https://github.com/MetaMask/core/pull/10192))
- Bump `@tanstack/query-core` from `^5.62.16` to `^5.103.2` ([#9324](https://github.com/MetaMask/core/pull/9324), [#10511](https://github.com/MetaMask/core/pull/10511))
- Bump `@metamask/base-data-service` from `^2.0.0` to `^2.1.0` ([#10502](https://github.com/MetaMask/core/pull/10502))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@2.1.0...HEAD
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@2.0.0...@metamask/sentinel-api-service@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@1.0.1...@metamask/sentinel-api-service@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/sentinel-api-service@1.0.0...@metamask/sentinel-api-service@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/sentinel-api-service@1.0.0
