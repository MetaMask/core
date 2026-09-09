# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/local-node-utils@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/local-node-utils@1.0.0
