# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]
### Added
- Add way to start and stop different polling sessions for the same network client ID by providing extra scoping data ([#1776](https://github.com/MetaMask/core/pull/1776))
  - Add optional second argument to `startPollingByNetworkClientId`
  - Add optional second argument to `onPollingCompleteByNetworkClientId`
  - Add required second argument to `executePoll`

### Changed
- Add dependency on `fast-json-stable-stringify` ^2.1.0

## [0.1.0]
### Added
- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/polling-controller@0.1.0...@metamask/polling-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/polling-controller@0.1.0
