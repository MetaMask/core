# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Added

- Add `MoneyAccountApiDataService` data service ([#9402](https://github.com/MetaMask/core/pull/9402))
  - Fetch user vault positions from the Money Account API (`fetchPositions`)
  - Fetch interest earned over a time window (`fetchInterest`)
  - Fetch cursor-paginated cash-flow history (`fetchHistory`)
  - Fetch vault exchange-rate time series (`fetchRateHistory`)

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-api-data-service@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-api-data-service@0.1.0
