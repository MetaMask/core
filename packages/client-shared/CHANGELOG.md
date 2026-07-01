# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@metamask/client-shared` ([#9323](https://github.com/MetaMask/core/pull/9323))
  - `mapApiTransaction` for mapping EVM API transactions to activity items
  - `mapKeyringTransaction` for mapping keyring transactions to activity items
  - `mapLocalTransaction` for mapping local transaction groups to activity items
  - Built-in calldata amount extraction for `musdConversion` destination amounts
  - Shared activity types (`ActivityItem`, `ActivityKind`, `Status`, etc.)

[Unreleased]: https://github.com/MetaMask/core/
