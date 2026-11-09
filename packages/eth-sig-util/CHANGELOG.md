# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Drop CommonJS support ([#11349](https://github.com/MetaMask/core/pull/11349), [#11362](https://github.com/MetaMask/core/pull/11362))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump TypeScript target to ES2022 ([#11348](https://github.com/MetaMask/core/pull/11348))
- Bump `@metamask/utils` from `^11.0.1` to `^12.0.1` ([#11349](https://github.com/MetaMask/core/pull/11349))
- Bump `ethereum-cryptography` from `^2.1.2` to `^3.2.0` ([#11349](https://github.com/MetaMask/core/pull/11349))
- Bump `@scure/base` from `~1.1.3` to `^1.2.6` ([#11349](https://github.com/MetaMask/core/pull/11349))
- This package was migrated from `MetaMask/eth-sig-util` to the
  `MetaMask/core` monorepo ([#11327](https://github.com/MetaMask/core/pull/11327))
  - See [`MetaMask/eth-sig-util`](https://github.com/MetaMask/eth-sig-util/blob/73725fc31a51e4d5f6b72d8e5f470c0b10c9d57f/CHANGELOG.md)
    for the original changelog.

[Unreleased]: https://github.com/MetaMask/core/
