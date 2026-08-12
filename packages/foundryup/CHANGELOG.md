# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Retry transient Foundry archive download failures with exponential backoff and equal jitter, preventing short-lived network, rate-limit, and server errors from immediately aborting installation ([#9854](https://github.com/MetaMask/core/pull/9854))
  - Configure the retry policy with the `--max-attempts`, `--initial-retry-delay-ms`, and `--max-retry-delay-ms` CLI options or their equivalent `FOUNDRYUP_*` environment variables

## [1.0.1]

### Fixed

- fix: make anvil symlink relative ([#6202](https://github.com/MetaMask/core/pull/6202))

## [1.0.0]

### Added

- Initial release of the foundryup package ([#5810](https://github.com/MetaMask/core/pull/5810), [#5909](https://github.com/MetaMask/core/pull/5909))
  - `foundryup` is a cross-platform tool that installs and manages Foundry binaries with MetaMask-specific defaults for use in development and end-to-end testing workflows. Features included:
    - CLI tool for managing Foundry binaries in MetaMask's development environment
    - Support for downloading and installing `forge`, `anvil`, `cast`, and `chisel` binaries
    - Cross-platform support for Linux, macOS, and Windows with both amd64 and arm64 architectures
    - Binary integrity verification using SHA-256 checksums
    - Intelligent binary installation with automatic symlink creation (falls back to copy if symlink fails)
    - Configurable binary caching with local storage support
    - Cache management commands for cleaning downloaded binaries
    - Automatic version detection and management of Foundry releases

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/foundryup@1.0.1...HEAD
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/foundryup@1.0.0...@metamask/foundryup@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/foundryup@1.0.0
