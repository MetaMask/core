# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- refactor: add `.js` import extensions to Mobile Platform packages ([#9618](https://github.com/MetaMask/core/pull/9618))
- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))
- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))
- chore: MIT license text update ([#9472](https://github.com/MetaMask/core/pull/9472))
- chore: Format changelogs with Oxfmt ([#8442](https://github.com/MetaMask/core/pull/8442))
- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))

### Changed

- Bump `@metamask/messenger` from `^1.0.0` to `^2.0.0` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632), [#9392](https://github.com/MetaMask/core/pull/9392))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [2.0.1]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@2.0.1...HEAD
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@2.0.0...@metamask/app-metadata-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@1.1.1...@metamask/app-metadata-controller@2.0.0
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@1.1.0...@metamask/app-metadata-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/app-metadata-controller@1.0.0...@metamask/app-metadata-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/app-metadata-controller@1.0.0
