# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0]

### Added

- Add eligibility state ([#7539](https://github.com/MetaMask/core/pull/7539))

- Add `createRequestSelector` utility function for creating memoized selectors for RampsController request states ([#7554](https://github.com/MetaMask/core/pull/7554))

- Add request caching infrastructure with TTL, deduplication, and abort support ([#7536](https://github.com/MetaMask/core/pull/7536))

### Changed

- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))

## [2.0.0]

### Changed

- **BREAKING:** Rename `OnRampService` to `RampsService` and `OnRampEnvironment` to `RampsEnvironment` ([#7502](https://github.com/MetaMask/core/pull/7502))
- **BREAKING:** Rename action types from `OnRampService:*` to `RampsService:*` (e.g., `OnRampService:getGeolocation` → `RampsService:getGeolocation`) ([#7502](https://github.com/MetaMask/core/pull/7502))

### Fixed

- Fix `RampsService#getGeolocation` to read response text within the policy execution and return parsed text ([#7502](https://github.com/MetaMask/core/pull/7502))

## [1.0.0]

### Added

- Initial release ([#7316](https://github.com/MetaMask/core/pull/7316))
  - Add `RampsController` for managing on/off ramps state
  - Add `OnRampService` for interacting with the OnRamp API
  - Add geolocation detection via IP address lookup

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.1.0...HEAD
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.0.0...@metamask/ramps-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@1.0.0...@metamask/ramps-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ramps-controller@1.0.0
