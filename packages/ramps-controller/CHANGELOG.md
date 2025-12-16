# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `dev-watch.js` and `link-ramp-controller.js` scripts to auto-build and copy `dist/` into `metamask-mobile/node_modules/@metamask/ramps-controller`
- Add `"dev": "node dev-watch.js"` script to `package.json`

### Changed

- Rename `OnRampService` to `RampsService` and `OnRampEnvironment` to `RampsEnvironment` ([#7316](https://github.com/MetaMask/core/pull/7316))
- Rename action types from `OnRampService:*` to `RampsService:*` (e.g., `OnRampService:getGeolocation` → `RampsService:getGeolocation`)
- Update imports, messenger types/namespaces, and exports in `src/index.ts`, controller/service files, and tests

### Fixed

- Fix `RampsService#getGeolocation` to read response text within the policy execution and return parsed text

## [1.0.0]

### Added

- Initial release ([#7316](https://github.com/MetaMask/core/pull/7316))
  - Add `RampsController` for managing on/off ramps state
  - Add `OnRampService` for interacting with the OnRamp API
  - Add geolocation detection via IP address lookup

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ramps-controller@1.0.0
