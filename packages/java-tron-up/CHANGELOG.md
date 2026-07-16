# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Bump minimum Node.js version to 22 ([#9168](https://github.com/MetaMask/core/pull/9168))

## [1.0.0]

### Added

- Initial release ([#9314](https://github.com/MetaMask/core/pull/9314))
  - Installs a pinned java-tron runtime for local development and CI
  - Exposes `java-tron-up` and `java-tron` binaries via `node_modules/.bin`
  - Uses `@metamask/local-node-utils` for cache resolution, downloads, and executable wrappers

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/java-tron-up@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/java-tron-up@1.0.0
