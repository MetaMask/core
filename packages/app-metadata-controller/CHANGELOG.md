# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6576](https://github.com/MetaMask/core/pull/6576))

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6385](https://github.com/MetaMask/core/pull/6385))
  - Previously, `AppMetadataController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.4.0` ([#5722](https://github.com/MetaMask/core/pull/5722), [#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632))

## [1.0.0]

### Added

- Initial release ([#5577](https://github.com/MetaMask/core/pull/5577))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/app-metadata-controller@1.0.0
