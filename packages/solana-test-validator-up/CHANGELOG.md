# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore(deps): update dependency tsx to ^4.23.15 ([#10434](https://github.com/MetaMask/core/pull/10434))
- chore(deps): update dependency tsx to ^4.23.13 ([#10369](https://github.com/MetaMask/core/pull/10369))
- chore(deps): update dependency rimraf to v6 ([#10379](https://github.com/MetaMask/core/pull/10379))
- chore(deps): update dependency @metamask/auto-changelog to ^6.2.1 ([#10364](https://github.com/MetaMask/core/pull/10364))
- chore(deps): update dependency ts-jest to ^29.4.12 ([#10328](https://github.com/MetaMask/core/pull/10328))
- chore(deps): update dependency rimraf to ^5.0.10 ([#10327](https://github.com/MetaMask/core/pull/10327))
- Update lint:tsc to run against all packages & remove it from CI ([#10215](https://github.com/MetaMask/core/pull/10215))

## [2.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/local-node-utils` from `^1.0.0` to `^2.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))

## [1.0.0]

### Added

- Initial release ([#9314](https://github.com/MetaMask/core/pull/9314))
  - Installs a pinned Solana/Agave runtime for local development and CI
  - Exposes `solana-test-validator-up`, `solana-test-validator`, and `solana` binaries via `node_modules/.bin`
  - Uses `@metamask/local-node-utils` for cache resolution, downloads, and executable wrappers

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/solana-test-validator-up@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/solana-test-validator-up@1.0.0...@metamask/solana-test-validator-up@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/solana-test-validator-up@1.0.0
