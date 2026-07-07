# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of the `@metamask/client-utils` package for functions and utilities shared across MetaMask clients (extension and mobile) ([#9375](https://github.com/MetaMask/core/pull/9375))
- Add transaction activity mappers and shared activity types ([#9376](https://github.com/MetaMask/core/pull/9376))
  - `mapApiTransaction` for mapping EVM API transactions to activity items
  - `mapKeyringTransaction` for mapping keyring transactions to activity items
  - `mapLocalTransaction` for mapping local transaction groups to activity items
  - Shared activity types (`ActivityItem`, `ActivityKind`, `Status`, etc.)

### Changed

- Bump `@metamask/keyring-api` from `^23.3.0` to `^23.5.0` ([#9390](https://github.com/MetaMask/core/pull/9390))

[Unreleased]: https://github.com/MetaMask/core/
