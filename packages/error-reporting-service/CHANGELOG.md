# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.1]

### Changed

- Add deprecation notice ([#7427](https://github.com/MetaMask/core/pull/7427))
  - This package is deprecated, and can be replaced with the
    `Messenger.captureException` method from `@metamask/messenger`.

## [3.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6462](https://github.com/MetaMask/core/pull/6462))
  - Previously, `ErrorReportingService` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6462](https://github.com/MetaMask/core/pull/6462))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [2.2.2]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [2.2.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [2.2.0]

### Added

- Add `name` and `state` properties to support modular initialization ([#6781](https://github.com/MetaMask/core/pull/6781))

## [2.1.0]

### Changed

- Bump `@metamask/base-controller` from `^8.0.1` to `^8.4.0` ([#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632))

## [2.0.0]

### Changed

- **BREAKING:** Adjust function signature of `captureException` option so it expects an `Error` instead of `unknown` ([#5968](https://github.com/MetaMask/core/pull/5968))
  - This matches the patched version of `captureException` from `@sentry/react-native` that mobile uses
  - It also matches the type of the `captureException` method and action that the service exports

## [1.0.0]

### Added

- Initial release ([#5882](https://github.com/MetaMask/core/pull/5882))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@3.0.1...HEAD
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@3.0.0...@metamask/error-reporting-service@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@2.2.2...@metamask/error-reporting-service@3.0.0
[2.2.2]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@2.2.1...@metamask/error-reporting-service@2.2.2
[2.2.1]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@2.2.0...@metamask/error-reporting-service@2.2.1
[2.2.0]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@2.1.0...@metamask/error-reporting-service@2.2.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@2.0.0...@metamask/error-reporting-service@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/error-reporting-service@1.0.0...@metamask/error-reporting-service@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/error-reporting-service@1.0.0
