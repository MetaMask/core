# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added `orders: RampsOrder[]` to controller state with persistence, along with crud methods([#8045](https://github.com/MetaMask/core/pull/8045))
- Added `RampsController:orderStatusChanged` event, published when a polled order's status transitions ([#8045](https://github.com/MetaMask/core/pull/8045))

### Changed

- `getOrder()` now updates the order in `state.orders` if it already exists there ([#8045](https://github.com/MetaMask/core/pull/8045))

## [10.0.0]

### Changed

- **BREAKING:** Remove `state.quotes` and `state.widgetUrl` from RampsController state. Quote and widget URL data are now managed by consuming components ([#8013](https://github.com/MetaMask/core/pull/8013))
- **BREAKING:** Remove `fetchQuotesForSelection()` and `setSelectedQuote()`. Components call `getQuotes()` directly and manage selection locally ([#8013](https://github.com/MetaMask/core/pull/8013))
- Simplify `getWidgetUrl()` to a pure fetch-and-return API; it no longer reads or writes controller state ([#8013](https://github.com/MetaMask/core/pull/8013))
- Improve `TransakService` error handling ([#8010](https://github.com/MetaMask/core/pull/8010))
- **BREAKING:** Replace `startQuotePolling()`/`stopQuotePolling()` with `fetchQuotesForSelection()` — quotes are now fetched once per call instead of polling on a 15-second interval ([#7999](https://github.com/MetaMask/core/pull/7999))

### Removed

- Remove `stopQuotePolling()` method (no interval to stop) ([#7999](https://github.com/MetaMask/core/pull/7999))
- Remove internal polling restart logic (`#restartPollingIfActive`) from `setSelectedProvider`, `setSelectedToken`, and `setSelectedPaymentMethod` ([#7999](https://github.com/MetaMask/core/pull/7999))

### Fixed

- Fix RampsController flaky test ([#8018](https://github.com/MetaMask/core/pull/8018))

## [9.0.0]

### Added

- Add `getOrder` and `getOrderFromCallback` methods to `RampsService` and `RampsController` for V2 unified order polling, along with new `RampsOrder`, `RampsOrderFiatCurrency`, `RampsOrderCryptoCurrency`, `RampsOrderPaymentMethod`, and `RampsOrderStatus` types ([#7934](https://github.com/MetaMask/core/pull/7934))

### Changed

- **BREAKING:** Use concrete types in `RampsOrder` instead of `string | Object` unions for `provider`, `cryptoCurrency`, `fiatCurrency`, `paymentMethod`, and `network` fields ([#8000](https://github.com/MetaMask/core/pull/8000))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [8.1.0]

### Added

- Add `widgetUrl` resource state that automatically fetches and stores the buy widget URL whenever the selected quote changes ([#7920](https://github.com/MetaMask/core/pull/7920))
- Add `TransakService` for native Transak deposit flow with OTP auth, KYC, quoting, order lifecycle, and payment widget URL generation ([#7922](https://github.com/MetaMask/core/pull/7922))
- Add `nativeProviders.transak` state slice and controller convenience methods for driving the Transak native deposit flow ([#7922](https://github.com/MetaMask/core/pull/7922))

### Changed

- Refactor: Consolidate reset logic with a shared resetResource helper and fix abort handling for dependent resources ([#7818](https://github.com/MetaMask/core/pull/7818))

## [8.0.0]

### Changed

- **BREAKING:** Quote filter param renamed from `provider` to `providers` array in `getQuotes()` and `RampsService.getQuotes()` ([#7892](https://github.com/MetaMask/core/pull/7892))
- **BREAKING:** Make `getWidgetUrl()` async to fetch the actual provider widget URL from the `buyURL` endpoint ([#7881](https://github.com/MetaMask/core/pull/7881))

## [7.1.0]

### Fixed

- Fixes quote race condition bug with missing payment method ([#7863](https://github.com/MetaMask/core/pull/7863))

## [7.0.0]

### Added

- Update payment method delay type to match API response structure ([#7845](https://github.com/MetaMask/core/pull/7845))
- Add automatic quote polling with `startQuotePolling()`, `stopQuotePolling()`, and `setSelectedQuote()` methods, with auto-selection when a single quote is returned ([#7824](https://github.com/MetaMask/core/pull/7824))

### Changed

- **BREAKING:** Require provider selection for quote polling and update quotes API endpoint to `/v2/quotes` ([#7846](https://github.com/MetaMask/core/pull/7846))

## [6.0.0]

### Changed

- **BREAKING:** Restructure `RampsControllerState` to use nested `ResourceState` objects for each resource with `data`, `selected`, `isLoading`, and `error` ([#7779](https://github.com/MetaMask/core/pull/7779))

## [5.1.0]

### Added

- Add quotes functionality to RampsController ([#7747](https://github.com/MetaMask/core/pull/7747))

### Fixed

- Fix `getQuotes()` to trim `assetId` and `walletAddress` parameters before use ([#7793](https://github.com/MetaMask/core/pull/7793))

## [5.0.0]

### Added

- Add `hydrateState()` method to fetch providers and tokens for user region ([#7707](https://github.com/MetaMask/core/pull/7707))
- Add `countries` state to RampsController with 24 hour TTL caching ([#7707](https://github.com/MetaMask/core/pull/7707))
- Add `SupportedActions` type for `{ buy: boolean; sell: boolean }` support info
- Add `selectedToken` state and `setSelectedToken()` method to RampsController ([#7734](https://github.com/MetaMask/core/pull/7734))
- Add `RampsEnvironment.Local` option to RampsService for local development ([#7734](https://github.com/MetaMask/core/pull/7734))

### Changed

- Reorganize `init()` to only fetch geolocation and countries; remove token and provider fetching ([#7707](https://github.com/MetaMask/core/pull/7707))
- **BREAKING:** Change `Country.supported` and `State.supported` from `boolean` to `SupportedActions` object. The API now returns buy/sell support info in a single call.
- **BREAKING:** Remove `action` parameter from `getCountries()`. Countries are no longer fetched separately for buy/sell actions.
- **BREAKING:** Rename `preferredProvider` to `selectedProvider` and `setPreferredProvider()` to `setSelectedProvider()` in RampsController ([#7734](https://github.com/MetaMask/core/pull/7734))
- **BREAKING:** Change `getPaymentMethods(options)` to `getPaymentMethods(region, options)` with region as first parameter ([#7734](https://github.com/MetaMask/core/pull/7734))

## [4.1.0]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@10.0.0...HEAD
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@9.0.0...@metamask/ramps-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@8.1.0...@metamask/ramps-controller@9.0.0
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@8.0.0...@metamask/ramps-controller@8.1.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@7.1.0...@metamask/ramps-controller@8.0.0
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@7.0.0...@metamask/ramps-controller@7.1.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@6.0.0...@metamask/ramps-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@5.1.0...@metamask/ramps-controller@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@5.0.0...@metamask/ramps-controller@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@4.1.0...@metamask/ramps-controller@5.0.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@4.0.0...@metamask/ramps-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@3.0.0...@metamask/ramps-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.1.0...@metamask/ramps-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.0.0...@metamask/ramps-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@1.0.0...@metamask/ramps-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ramps-controller@1.0.0
