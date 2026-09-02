# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- Bump `@metamask/utils` from `^11.11.0` to `^11.12.0` ([#10076](https://github.com/MetaMask/core/pull/10076))

## [0.4.1]

### Changed

- Bump `@metamask/superstruct` from `^3.1.0` to `^3.4.1` ([#9754](https://github.com/MetaMask/core/pull/9754))
- Bump `@tanstack/query-core` from `^4.43.0` to `^5.62.16` ([#9712](https://github.com/MetaMask/core/pull/9712))
- Bump `@metamask/base-data-service` from `^0.1.3` to `^1.0.0` ([#9972](https://github.com/MetaMask/core/pull/9972))

## [0.4.0]

### Changed

- Add best-effort profile JWT authentication to Money Account API requests, falling back to unauthenticated requests when a token is unavailable ([#9661](https://github.com/MetaMask/core/pull/9661))

## [0.3.0]

### Added

- Add optional `trace` callback to `MoneyAccountApiDataService` constructor for network request tracing ([#9451](https://github.com/MetaMask/core/pull/9451))
  - All HTTP calls (`fetchPositions`, `fetchInterest`, `fetchHistory`, `fetchRateHistory`) emit best-effort backdated traces with `startTime`, `success`, and `errorName` attributes
  - Tracing is isolated from fetch/retry logic; trace failures do not impact queries

## [0.2.0]

### Added

- Add optional nullable `balance` field to the positions response (`musd_balance`, `vmusd_value_in_musd`, `total_balance`), matching the Money Account API contract. Export `PositionBalance` type. ([#9554](https://github.com/MetaMask/core/pull/9554))

## [0.1.0]

### Added

- Add `MoneyAccountApiDataService` data service ([#9402](https://github.com/MetaMask/core/pull/9402))
  - Fetch user vault positions from the Money Account API (`fetchPositions`)
  - Fetch interest earned over a time window (`fetchInterest`)
  - Fetch cursor-paginated cash-flow history (`fetchHistory`)
  - Fetch vault exchange-rate time series (`fetchRateHistory`)

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-api-data-service@0.4.1...HEAD
[0.4.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-api-data-service@0.4.0...@metamask/money-account-api-data-service@0.4.1
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-api-data-service@0.3.0...@metamask/money-account-api-data-service@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-api-data-service@0.2.0...@metamask/money-account-api-data-service@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-api-data-service@0.1.0...@metamask/money-account-api-data-service@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-api-data-service@0.1.0
