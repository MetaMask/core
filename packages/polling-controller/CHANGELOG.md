# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]
### Added
- Add `PollingControllerOnly` to extend from an empty class. This will allow classes that previously are just classes that don't extend from BaseV1 or V2 to extend from this new `PollingControllerOnly`. ([#1873](https://github.com/MetaMask/core/pull/1873))

### Changed
- **BREAKING:** `_executePoll()` is called immediately on start if no polling interval is already active for the networkClientId + options combination ([#1874](https://github.com/MetaMask/core/pull/1874))
- Bump dependency and peer dependency on `@metamask/network-controller` to ^15.1.0

## [0.2.0]
### Added
- Add way to start and stop different polling sessions for the same network client ID by providing extra scoping data ([#1776](https://github.com/MetaMask/core/pull/1776))
  - Add optional second argument to `stopPollingByPollingToken` (formerly `stopPollingByNetworkClientId`)
  - Add optional second argument to `onPollingCompleteByNetworkClientId`

### Changed
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- **BREAKING:** Polling controllers are expected to override `_executePoll` instead of `executePoll` ([#1810](https://github.com/MetaMask/core/pull/1810))
- **BREAKING:** Rename `stopPollingByNetworkClientId` to `stopPollingByPollingToken` ([#1810](https://github.com/MetaMask/core/pull/1810))
- Add dependency on `fast-json-stable-stringify` ^2.1.0

## [0.1.0]
### Added
- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@0.2.0...@metamask/polling-controller@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@0.1.0...@metamask/polling-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/polling-controller@0.1.0
