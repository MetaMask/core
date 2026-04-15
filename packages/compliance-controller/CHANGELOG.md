# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- Release/900.0.0 ([#8370](https://github.com/MetaMask/core/pull/8370))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))
- chore: simplify auto-generated file header comment ([#8279](https://github.com/MetaMask/core/pull/8279))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- Release/829.0.0 ([#8017](https://github.com/MetaMask/core/pull/8017))
- Release/827.0.0 ([#8004](https://github.com/MetaMask/core/pull/8004))
- chore: Update `generate-method-action-types` script to be used in a single package ([#7983](https://github.com/MetaMask/core/pull/7983))

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
