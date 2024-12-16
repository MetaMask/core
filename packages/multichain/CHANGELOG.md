# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- feat: Add `caip25CaveatBuilder` to `@metamask/multichain` ([#5064](https://github.com/MetaMask/core/pull/5064))

## [1.1.2]

### Changed

- Bump `@metamask/eth-json-rpc-filters` from `^7.0.0` to `^9.0.0` ([#5040](https://github.com/MetaMask/core/pull/5040))

## [1.1.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@metamask/api-specs`
  - `lodash`

## [1.1.0]

### Changed

- Revoke the CAIP-25 endowment if the only eip155 account or scope is removed ([#4978](https://github.com/MetaMask/core/pull/4978))

## [1.0.0]

### Added

- Initial release ([#4962](https://github.com/MetaMask/core/pull/4962))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.1.2...HEAD
[1.1.2]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.1.1...@metamask/multichain@1.1.2
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.1.0...@metamask/multichain@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.0.0...@metamask/multichain@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain@1.0.0
