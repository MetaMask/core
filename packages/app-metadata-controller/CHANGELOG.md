# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6385](https://github.com/MetaMask/core/pull/6385))
  - Previously, `AppMetadataController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6385](https://github.com/MetaMask/core/pull/6385))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [1.1.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [1.1.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6576](https://github.com/MetaMask/core/pull/6576))

### Changed

- Bump `@metamask/base-controller` from `^8.0.0` to `^8.4.1` ([#5722](https://github.com/MetaMask/core/pull/5722), [#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632), [#6807](https://github.com/MetaMask/core/pull/6807))

## [1.0.0]

### Added

- Initial release ([#5577](https://github.com/MetaMask/core/pull/5577))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@1.1.1...@metamask/app-metadata-controller@2.0.0
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@1.1.0...@metamask/app-metadata-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@1.0.0...@metamask/app-metadata-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/app-metadata-controller@1.0.0
