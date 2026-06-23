# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Replace duplicated installer utilities with `@metamask/local-node-utils` ([#9236](https://github.com/MetaMask/core/pull/9236)).

### Added

- Add the `@metamask/bitcoin-regtest-up` package ([#9212](https://github.com/MetaMask/core/pull/9212)).

### Fixed

- Parse `.yarnrc.yml` as YAML for global-cache detection, matching `@metamask/foundryup` ([#9212](https://github.com/MetaMask/core/pull/9212)).
- Tolerate a missing `package.json` so flag-only `install` and `cache clean` commands work ([#9212](https://github.com/MetaMask/core/pull/9212)).
- Merge partial `bitcoinCore` overrides from `package.json` with the pinned defaults instead of replacing them ([#9212](https://github.com/MetaMask/core/pull/9212)).
- Propagate child termination signals as a non-zero exit from the generated `bitcoind` and `bitcoin-cli` wrappers ([#9212](https://github.com/MetaMask/core/pull/9212)).

[Unreleased]: https://github.com/MetaMask/core/
