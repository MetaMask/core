# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: add `allow-scripts` script to child workspaces so Yarn doesn't fail ([#11324](https://github.com/MetaMask/core/pull/11324))
- test: turn coverage off by default and add test:coverage ([#11061](https://github.com/MetaMask/core/pull/11061))
- test: switch Vitest coverage provider to `v8` ([#11261](https://github.com/MetaMask/core/pull/11261))
- ci: validate all changelogs in a single run ([#11199](https://github.com/MetaMask/core/pull/11199))

## [0.1.0]

### Added

- Initial release ([#11107](https://github.com/MetaMask/core/pull/11107))
- Add `ensureError`, `getErrorMessage`, `isErrorWithCode`, `isErrorWithMessage`, `isErrorWithStack`, and `wrapError` functions, moved from `@metamask/utils` ([#10917](https://github.com/MetaMask/core/pull/10917))

### Changed

- Bump `@metamask/type-utils` from `^0.0.0` to `^0.1.0` ([#11107](https://github.com/MetaMask/core/pull/11107))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/error-utils@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/error-utils@0.1.0
