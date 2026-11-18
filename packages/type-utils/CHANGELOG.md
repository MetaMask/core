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
- Add `Json`, `Mutable`, `NonEmptyArray`, `PartialOrAbsent`, and `RuntimeObject` types, moved from `@metamask/utils` ([#10908](https://github.com/MetaMask/core/pull/10908))
- Add `getKnownPropertyNames`, `hasProperty`, `isNullOrUndefined`, `isObject`, and `isPlainObject` functions, moved from `@metamask/utils` ([#10908](https://github.com/MetaMask/core/pull/10908))
- Add `AssertionErrorConstructor` type, moved from `@metamask/utils` ([#10983](https://github.com/MetaMask/core/pull/10983))
- Add `AssertionError`, `assert`, `assertExhaustive`, and `getAssertionError` functions, moved from `@metamask/utils` ([#10983](https://github.com/MetaMask/core/pull/10983))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/type-utils@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/type-utils@0.1.0
