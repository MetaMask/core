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
- Speed up documentation generation by loading source files in bulk instead of one at a time ([#9990](https://github.com/MetaMask/core/pull/9990))
- Bump `@metamask/utils` from `^11.11.0` to `^11.12.0` ([#10076](https://github.com/MetaMask/core/pull/10076))

## [0.1.0]

### Added

- Initial release of the platform-api-docs package ([#8012](https://github.com/MetaMask/core/pull/8012), [#9913](https://github.com/MetaMask/core/pull/9913))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/platform-api-docs@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/platform-api-docs@0.1.0
