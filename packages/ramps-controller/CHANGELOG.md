# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add sync trigger methods to RampsController ([#7662](https://github.com/MetaMask/core/pull/7662))

- Export `RampAction` type for `'buy' | 'sell'` ramp actions ([#7663](https://github.com/MetaMask/core/pull/7663))
- Add payment methods support with `getPaymentMethods()` method, `paymentMethods` and `selectedPaymentMethod` state ([#7665](https://github.com/MetaMask/core/pull/7665))

### Changed

- Evict expired cache entries based on TTL in addition to size-based eviction ([#7674](https://github.com/MetaMask/core/pull/7674))

- Update `getTokens()` to use v2 API endpoint and support optional provider parameter ([#7664](https://github.com/MetaMask/core/pull/7664))

## [4.0.0]

### Added

- Add `preferredProvider` state and `setPreferredProvider()` method to RampsController ([#7617](https://github.com/MetaMask/core/pull/7617))

- Export `UserRegion` type ([#7646](https://github.com/MetaMask/core/pull/7646))

- Add `defaultAmount` and `quickAmounts` fields to the `Country` type ([#7645](https://github.com/MetaMask/core/pull/7645))

- Add `providers` state and `getProviders()` method to RampsController. Providers are automatically fetched on init and when the region changes ([#7652](https://github.com/MetaMask/core/pull/7652))

### Changed

- **BREAKING:** Change `userRegion` from `string | null` to `UserRegion | null`. Access region code via `userRegion.regionCode`. ([#7646](https://github.com/MetaMask/core/pull/7646))

- Update `getCountries()` endpoint to use v2 API (`v2/regions/countries`) ([#7645](https://github.com/MetaMask/core/pull/7645))

- Add `getApiPath()` helper function for versioned API paths with v2 default ([#7645](https://github.com/MetaMask/core/pull/7645))

### Removed

- **BREAKING:** Remove eligibility concept from RampsController. The `eligibility` state, `updateEligibility()` method, and `getEligibility()` service method have been removed. The `Eligibility` type and `RampsServiceGetEligibilityAction` are no longer exported. ([#7651](https://github.com/MetaMask/core/pull/7645))

## [3.0.0]

### Added

- Add `getTokens()` method to RampsController for fetching available tokens by region and action ([#7607](https://github.com/MetaMask/core/pull/7607))

### Changed

- **BREAKING:** Rename `geolocation` to `userRegion` and `updateGeolocation()` to `updateUserRegion()` in RampsController ([#7563](https://github.com/MetaMask/core/pull/7563))

- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.18.0` ([#7583](https://github.com/MetaMask/core/pull/7583))

## [2.1.0]

### Added

- Add eligibility state ([#7539](https://github.com/MetaMask/core/pull/7539))

- Add `createRequestSelector` utility function for creating memoized selectors for RampsController request states ([#7554](https://github.com/MetaMask/core/pull/7554))

- Add request caching infrastructure with TTL, deduplication, and abort support ([#7536](https://github.com/MetaMask/core/pull/7536))

- Add `init()` and `setUserRegion()` methods to RampsController ([#7563](https://github.com/MetaMask/core/pull/7563))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@3.0.0...@metamask/ramps-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.1.0...@metamask/ramps-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.0.0...@metamask/ramps-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@1.0.0...@metamask/ramps-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ramps-controller@1.0.0
