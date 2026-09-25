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

### Changed

- Bump `execa` from `^5.0.0` to `^10.0.1` ([#10330](https://github.com/MetaMask/core/pull/10330), [#10332](https://github.com/MetaMask/core/pull/10332))
- Bump `yargs` from `^17.7.2` to `^17.7.3` ([#10446](https://github.com/MetaMask/core/pull/10446))

## [0.2.1]

### Changed

- Bump `@metamask/utils` from `^11.12.0` to `^12.0.0` ([#10192](https://github.com/MetaMask/core/pull/10192))

### Fixed

- Use `preserve` module kind and `bundler` resolution in type extractor ([#10240](https://github.com/MetaMask/core/pull/10240))
  - This fixes a bug where the type extractor would fail to resolve types for packages using subpath exports.

## [0.2.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Speed up documentation generation by loading source files in bulk instead of one at a time ([#9990](https://github.com/MetaMask/core/pull/9990))
- Bump `@metamask/utils` from `^11.11.0` to `^11.12.0` ([#10076](https://github.com/MetaMask/core/pull/10076))

### Fixed

- Link a capability to its source rather than to the build output compiled from it, where both are available ([#10085](https://github.com/MetaMask/core/pull/10085))

## [0.1.0]

### Added

- Initial release of the platform-api-docs package ([#8012](https://github.com/MetaMask/core/pull/8012), [#9913](https://github.com/MetaMask/core/pull/9913))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/platform-api-docs@0.2.1...HEAD
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/platform-api-docs@0.2.0...@metamask/platform-api-docs@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/platform-api-docs@0.1.0...@metamask/platform-api-docs@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/platform-api-docs@0.1.0
