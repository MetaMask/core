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

## [2.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.

## [1.0.0]

### Added

- Initial release ([#9314](https://github.com/MetaMask/core/pull/9314))
  - Cache directory resolution from Yarn config
  - Artifact config helpers, checksum verification, and downloads
  - Archive extraction, executable wrappers, and filesystem helpers

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/local-node-utils@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/local-node-utils@1.0.0...@metamask/local-node-utils@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/local-node-utils@1.0.0
