# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore(watch-only-account-service): Correct tsconfig.lint.json ([#11353](https://github.com/MetaMask/core/pull/11353))
- chore: add `allow-scripts` script to child workspaces so Yarn doesn't fail ([#11324](https://github.com/MetaMask/core/pull/11324))
- test: turn coverage off by default and add test:coverage ([#11061](https://github.com/MetaMask/core/pull/11061))
- test: switch Vitest coverage provider to `v8` ([#11261](https://github.com/MetaMask/core/pull/11261))
- ci: validate all changelogs in a single run ([#11199](https://github.com/MetaMask/core/pull/11199))

### Added

- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

## [0.1.0]

### Added

- Initial release: `WatchOnlyAccountService` with `createAccount` and `isEnabled` actions ([#10794](https://github.com/MetaMask/core/pull/10794))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/watch-only-account-service@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/watch-only-account-service@0.1.0
