# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6461](https://github.com/MetaMask/core/pull/6461))
  - Previously, `GatorPermissionsController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [0.2.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [0.2.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6552](https://github.com/MetaMask/core/pull/6552))
- Add method to decode permission from `signTypedData` ([#6556](https://github.com/MetaMask/core/pull/6556))

### Changed

- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))
- Function `decodePermissionFromPermissionContextForOrigin` is now synchronous ([#6656](https://github.com/MetaMask/core/pull/6656))

### Fixed

- Fix incorrect default Gator Permissions SnapId ([#6546](https://github.com/MetaMask/core/pull/6546))

## [0.1.0]

### Added

- Initial release ([#6033](https://github.com/MetaMask/core/pull/6033))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.2...HEAD
[0.2.2]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.1...@metamask/gator-permissions-controller@0.2.2
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.0...@metamask/gator-permissions-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.1.0...@metamask/gator-permissions-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/gator-permissions-controller@0.1.0
