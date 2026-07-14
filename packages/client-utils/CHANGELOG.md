# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0]

### Added

- Map `assetActivation` and `assetDeactivation` activity types in transaction activity mappers ([#9440](https://github.com/MetaMask/core/pull/9440))

### Changed

- Bump `@metamask/transaction-controller` from `^68.3.0` to `^69.0.0` ([#9456](https://github.com/MetaMask/core/pull/9456), [#9470](https://github.com/MetaMask/core/pull/9470))

## [1.0.0]

### Added

- Add `createFormatters` factory for shared display formatters ([#XXXX](https://github.com/MetaMask/core/pull/XXXX))
  - `formatNumber` — generic number with optional `Intl.NumberFormat` overrides
  - `formatCurrency` — currency string (ISO 4217 code)
  - `formatCurrencyCompact` — compact currency (e.g. `$1.2K`, `$3.4M`)
  - `formatCurrencyWithMinThreshold` — currency with `<$0.01` floor
  - `formatCurrencyTokenPrice` — token price with tiered precision
  - `formatToken` — number with token symbol
  - `formatTokenQuantity` — token quantity with tiered precision
  - `formatTokenAmount` — token quantity without trailing zeros
  - `formatPercentWithMinThreshold` — percent with 0.01% floor
  - `formatCompact` — compact non-currency number
  - `formatDateTime` — localized date+time string
- Initial release of the `@metamask/client-utils` package for functions and utilities shared across MetaMask clients (extension and mobile) ([#9375](https://github.com/MetaMask/core/pull/9375))
- Add transaction activity mappers and shared activity types ([#9376](https://github.com/MetaMask/core/pull/9376))
  - `mapApiTransaction` for mapping EVM API transactions to activity items
  - `mapKeyringTransaction` for mapping keyring transactions to activity items
  - `mapLocalTransaction` for mapping local transaction groups to activity items
  - Shared activity types (`ActivityItem`, `ActivityKind`, `Status`, etc.)

### Changed

- Bump `@metamask/transaction-controller` from `^68.2.2` to `^68.3.0` ([#9421](https://github.com/MetaMask/core/pull/9421))
- Bump `@metamask/keyring-api` from `^23.3.0` to `^23.5.0` ([#9390](https://github.com/MetaMask/core/pull/9390))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.0.0...@metamask/client-utils@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/client-utils@1.0.0
