# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release 188.0.0 ([#4625](https://github.com/MetaMask/core/pull/4625))
- Bump `typescript` from `~5.1.6` to `~5.2.2` ([#4584](https://github.com/MetaMask/core/pull/4584))
- Bump `typescript` from `~5.0.4` to `~5.1.6` ([#4576](https://github.com/MetaMask/core/pull/4576))
- Release 179.0.0 ([#4544](https://github.com/MetaMask/core/pull/4544))
- Upgrade to TypeScript v5.0 and set `module{,Resolution}` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))
- Release/172.0.0 ([#4517](https://github.com/MetaMask/core/pull/4517))
- chore(deps): Bump `@metamask/utils` to `^9.0.0`, `@metamask/rpc-errors` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Restore ESLint warnings as errors (ignoring them for now) ([#4382](https://github.com/MetaMask/core/pull/4382))

## [3.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [2.0.2]

### Changed

- Bump `@metamask/base-controller` to `^5.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [2.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [2.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Bump `@metamask/json-rpc-engine` to `^8.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [1.0.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@2.0.2...@metamask/permission-log-controller@3.0.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@2.0.1...@metamask/permission-log-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@2.0.0...@metamask/permission-log-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@1.0.0...@metamask/permission-log-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/permission-log-controller@1.0.0
