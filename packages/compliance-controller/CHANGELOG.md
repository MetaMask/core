# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/messenger` from `^1.1.0` to `^1.1.1` ([#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [2.0.0]

### Changed

- **BREAKING:** Remove proactive bulk-fetch pattern from `ComplianceController` and `ComplianceService` ([#8365](https://github.com/MetaMask/core/pull/8365))
  - `ComplianceControllerState` no longer includes `blockedWallets` or `blockedWalletsLastFetched`. Consumers storing persisted state must drop these fields on migration.
  - The `init()` and `updateBlockedWallets()` controller methods have been removed. Consumers should remove any calls to these methods.
  - The `blockedWalletsRefreshInterval` constructor option has been removed.
  - The `updateBlockedWallets()` service method and its `GET /v1/blocked-wallets` endpoint integration have been removed.
  - `ComplianceControllerInitAction`, `ComplianceControllerUpdateBlockedWalletsAction`, and `ComplianceServiceUpdateBlockedWalletsAction` types have been removed from the public API.
  - The `BlockedWalletsInfo` type has been removed from the public API.
  - `checkWalletCompliance` and `checkWalletsCompliance` now fall back to the per-address `walletComplianceStatusMap` cache when the API is unavailable, re-throwing only if no cached result exists for a requested address.
  - `selectIsWalletBlocked` now reads solely from `walletComplianceStatusMap` rather than also checking a cached full blocklist.
- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.0` ([#8364](https://github.com/MetaMask/core/pull/8364))

## [1.0.2]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [1.0.1]

### Fixed

- Fix package to include files, which were accidentally omitted in 1.0.0 ([#8016](https://github.com/MetaMask/core/pull/8016))

## [1.0.0] [DEPRECATED]

### Added

- Initial release ([#7945](https://github.com/MetaMask/core/pull/7945))
  - Add `ComplianceController` for managing OFAC compliance state for wallet addresses.
  - Add `ComplianceService` for fetching compliance data from the Compliance API.

### Changed

- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/compliance-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/compliance-controller@1.0.2...@metamask/compliance-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/compliance-controller@1.0.1...@metamask/compliance-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/compliance-controller@1.0.0...@metamask/compliance-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/compliance-controller@1.0.0
