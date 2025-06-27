# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Changed

- **BREAKING:** Adjust function signature of `captureException` option so it expects an `Error` instead of `unknown` ([#5968](https://github.com/MetaMask/core/pull/5968))
  - This matches the patched version of `captureException` from `@sentry/react-native` that mobile uses
  - It also matches the type of the `captureException` method and action that the service exports

## [1.0.0]

### Added

- Initial release ([#5882](https://github.com/MetaMask/core/pull/5882))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@1.0.0...@metamask/error-reporting-service@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/error-reporting-service@1.0.0
