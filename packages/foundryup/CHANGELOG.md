# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Uncategorized

- chore: bump TypeScript from 5 to 7, and add TypeScript 6 side by side ([#9518](https://github.com/MetaMask/core/pull/9518))
- Preserve api-docs/ (not docs/) for Typedoc-generated directories ([#10114](https://github.com/MetaMask/core/pull/10114))
- chore: Enable lint:tsc for 11 additional clean packages ([#9664](https://github.com/MetaMask/core/pull/9664))
- ci: diff root `package.json` and `yarn.lock` to find affected workspaces in incremental CI ([#9643](https://github.com/MetaMask/core/pull/9643))
- refactor: add `.js` import extensions to Mobile and Extension Platform packages ([#9628](https://github.com/MetaMask/core/pull/9628))
- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))
- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))
- chore: MIT license text update ([#9472](https://github.com/MetaMask/core/pull/9472))
- chore: Format changelogs with Oxfmt ([#8442](https://github.com/MetaMask/core/pull/8442))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- chore: Re-enable `@typescript-eslint/no-unnecessary-type-assertions` ([#7296](https://github.com/MetaMask/core/pull/7296))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/foundryup@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/foundryup@1.0.1...@metamask/foundryup@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/foundryup@1.0.0...@metamask/foundryup@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/foundryup@1.0.0
