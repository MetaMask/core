# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0]
### Added
- Add JSON storage validation and limit utilities ([#14](https://github.com/MetaMask/utils/pull/14))
  - Adds a new function `validateJsonAndGetSize`.

## [2.0.0]
### Added
- Add more JSON utils ([#8](https://github.com/MetaMask/utils/pull/8))

### Changed
- **BREAKING:** Refactor and expand time utils ([#9](https://github.com/MetaMask/utils/pull/9))
  - Adds a new function, `inMilliseconds`, and moves the time constants into a TypeScript `enum`.

## [1.0.0]
### Added
- Initial release

[Unreleased]: https://github.com/MetaMask/utils/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/MetaMask/utils/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/MetaMask/utils/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/MetaMask/utils/releases/tag/v1.0.0
