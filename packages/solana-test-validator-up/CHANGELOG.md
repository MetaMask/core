# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add the `@metamask/solana-test-validator-up` package ([#9210](https://github.com/MetaMask/core/pull/9210)).

### Changed

- Replace duplicated installer utilities with `@metamask/local-node-utils` ([#9237](https://github.com/MetaMask/core/pull/9237)).

### Fixed

- Parse `.yarnrc.yml` as YAML when resolving the cache directory so
  `enableGlobalCache` matches `@metamask/foundryup` ([#9210](https://github.com/MetaMask/core/pull/9210)).
- Tolerate a missing `package.json` when reading installer options so flag-only
  `install` and `cache clean` commands work ([#9210](https://github.com/MetaMask/core/pull/9210)).
- Merge partial `release` overrides from `package.json` with the pinned defaults
  instead of replacing them ([#9210](https://github.com/MetaMask/core/pull/9210)).
- Propagate child termination signals as a non-zero exit from generated binary
  wrappers ([#9210](https://github.com/MetaMask/core/pull/9210)).

[Unreleased]: https://github.com/MetaMask/core/
