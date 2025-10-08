# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release/597.0.0 ([#6771](https://github.com/MetaMask/core/pull/6771))
- Release/586.0.0 ([#6733](https://github.com/MetaMask/core/pull/6733))

### Added

- Log `not_shown` if result is not available ([#6667](https://github.com/MetaMask/core/pull/6667))

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- **Breaking:** Change `checkCoverage` API to accept `coverageId` and skip `/init` if `coverageId` is provided ([#6792](https://github.com/MetaMask/core/pull/6792))

## [0.2.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6504](https://github.com/MetaMask/core/pull/6504))
- Add signature coverage checking ([#6501](https://github.com/MetaMask/core/pull/6501))
- Add transaction and signature logging ([#6633](https://github.com/MetaMask/core/pull/6633))

### Changed

- Bump `@metamask/signature-controller` from `^33.0.0` to `^34.0.0` ([#6702](https://github.com/MetaMask/core/pull/6702))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.4.0` ([#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

## [0.1.2]

### Fixed

- Fixed backend URL paths ([#6433](https://github.com/MetaMask/core/pull/6433))

## [0.1.1]

### Fixed

- Added missing exports and improved documentation ([#6412](https://github.com/MetaMask/core/pull/6412))

## [0.1.0]

### Added

- Initial release of the shield-controller package ([#6137](https://github.com/MetaMask/core/pull/6137)

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.2...@metamask/shield-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.1...@metamask/shield-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.0...@metamask/shield-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/shield-controller@0.1.0
