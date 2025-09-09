# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of the rewards controller. ([#6493](https://github.com/MetaMask/core/pull/6493))
  - Automatically authenticates a user through a silent signature from KeyringController
  - Skips auth for Solana and hardware wallets for now
  - Skips auth for 10 minutes of grace period
    [Unreleased]: https://github.com/MetaMask/core/
