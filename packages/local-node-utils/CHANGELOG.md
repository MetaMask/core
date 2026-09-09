# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: bump TypeScript from 5 to 7, and add TypeScript 6 side by side ([#9518](https://github.com/MetaMask/core/pull/9518))
- Preserve api-docs/ (not docs/) for Typedoc-generated directories ([#10114](https://github.com/MetaMask/core/pull/10114))
- chore: Enable lint:tsc for 11 additional clean packages ([#9664](https://github.com/MetaMask/core/pull/9664))
- refactor: add `.js` import extensions to Networks packages ([#9649](https://github.com/MetaMask/core/pull/9649))
- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))
- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))

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
