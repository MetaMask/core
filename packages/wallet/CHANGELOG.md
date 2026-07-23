# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [8.0.0]

### Added

- **BREAKING:** Wire `ClaimsService` and `ClaimsController` into the default wallet initialization ([#9588](https://github.com/MetaMask/core/pull/9588))
  - Passing `instanceOptions.claimsService.env` is now required.
  - Passing `instanceOptions.claimsService.fetchFunction` is now required.
  - `ClaimsService` delegates `AuthenticationController:getBearerToken`; hosts must register `AuthenticationController` on the supplied root messenger before authenticated Claims API calls succeed.
  - Re-exports `Env` from `@metamask/claims-controller` as `ClaimsEnv` for `instanceOptions.claimsService.env`.
- **BREAKING:** Wire `GasFeeController` into the default wallet initialization ([#9527](https://github.com/MetaMask/core/pull/9527))
  - Adds a required `instanceOptions.gasFeeController` option whose `clientId` (sent as `X-Client-Id` to the gas API) is required, so every client identifies itself; all other fields are optional and fall back to platform-agnostic defaults.
- **BREAKING** Wire `SeedlessOnboardingController` and `PasskeyController` into the default wallet initialization ([#9533](https://github.com/MetaMask/core/pull/9533))

### Changed

- Bump `@metamask/transaction-controller` from `^69.0.0` to `^69.2.1` ([#9568](https://github.com/MetaMask/core/pull/9568), [#9589](https://github.com/MetaMask/core/pull/9589), [#9593](https://github.com/MetaMask/core/pull/9593))
- Bump `@metamask/seedless-onboarding-controller` from `^10.0.3` to `^10.1.0` ([#9600](https://github.com/MetaMask/core/pull/9600))

## [7.0.1]

### Changed

- Bump `@metamask/transaction-controller` from `^68.2.2` to `^69.0.0` ([#9421](https://github.com/MetaMask/core/pull/9421), [#9456](https://github.com/MetaMask/core/pull/9456), [#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/connectivity-controller` from `^0.2.0` to `^0.3.0` ([#9435](https://github.com/MetaMask/core/pull/9435))
- Bump `@metamask/accounts-controller` from `^39.0.4` to `^39.0.5` ([#9470](https://github.com/MetaMask/core/pull/9470))

## [7.0.0]

### Added

- **BREAKING:** Wire `TransactionController` into the default wallet initialization ([#8975](https://github.com/MetaMask/core/pull/8975))

### Changed

- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [6.0.0]

### Added

- **BREAKING:** Wire `AddressBookController` into the default wallet initialization ([#9291](https://github.com/MetaMask/core/pull/9291))

### Changed

- Bump `@metamask/accounts-controller` from `^39.0.3` to `^39.0.4` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/network-controller` from `^33.0.0` to `^34.0.0` ([#9349](https://github.com/MetaMask/core/pull/9349))

## [5.0.0]

### Added

- **BREAKING:** Add `NetworkController` initialization ([#9001](https://github.com/MetaMask/core/pull/9001))
  - Passing `instanceOptions.networkController.infuraProjectId` is now required.
- Add the `Wallet.init` function which calls `init` on required instances ([#9001](https://github.com/MetaMask/core/pull/9001))

### Changed

- Bump `@metamask/accounts-controller` from `^39.0.2` to `^39.0.3` ([#9231](https://github.com/MetaMask/core/pull/9231))

## [4.0.0]

### Added

- **BREAKING:** Add `AccountsController` and `ConnectivityController` as default initialized controllers ([#8924](https://github.com/MetaMask/core/pull/8924))
  - Passing `instanceOptions.connectivityController.connectivityAdapter` is now required.
  - Export `AlwaysOnlineAdapter` from the package root for environments without a platform-specific network API (e.g. Node/tests).
- **BREAKING:** Wire `RemoteFeatureFlagController` into the default wallet initialization ([#8969](https://github.com/MetaMask/core/pull/8969))
  - The default `Wallet` now constructs a `RemoteFeatureFlagController` and registers its `RemoteFeatureFlagController:*` messenger actions. Consumers that pass their own `messenger` and already wire a `RemoteFeatureFlagController` must remove their own before upgrading, or the duplicate registration will collide.
  - Adds a required `remoteFeatureFlagController` slot to `instanceOptions`. `clientConfigApiService` is required (each client injects a `ClientConfigApiService` configured for its own client type, distribution, and environment); `getMetaMetricsId`, `clientVersion`, `prevClientVersion`, `fetchInterval`, and `disabled` are optional. `prevClientVersion` lets consumers trigger feature-flag cache invalidation when the client version changes between sessions.

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/controller-utils` from `^12.1.1` to `^12.3.0` ([#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/keyring-controller` from `^27.0.0` to `^27.1.0` ([#9129](https://github.com/MetaMask/core/pull/9129))
- Bump `@metamask/accounts-controller` from `^39.0.1` to `^39.0.2` ([#9218](https://github.com/MetaMask/core/pull/9218))

## [3.0.0]

### Added

- **BREAKING:** Wire `ApprovalController` into the default wallet initialization ([#8953](https://github.com/MetaMask/core/pull/8953))
  - The default `Wallet` now constructs an `ApprovalController` and registers its `ApprovalController:*` messenger actions. Consumers that pass their own `messenger` and already wire an `ApprovalController` must remove their own before upgrading, or the duplicate registration will collide.
  - Adds an `approvalController` slot to `instanceOptions` with `showApprovalRequest` (the callback that surfaces pending approval requests to the user; defaults to a no-op) and `typesExcludedFromRateLimiting` (the approval types exempt from per-origin rate limiting; defaults to a baseline of EVM approval types). Both let consumers (extension, mobile, wallet-cli) inject their platform-specific values.

### Changed

- Bump `@metamask/approval-controller` from `^9.0.1` to `^9.0.2` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.1.1` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/keyring-controller` from `^26.0.0` to `^27.0.0` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/storage-service` from `^1.0.1` to `^1.0.2` ([#9058](https://github.com/MetaMask/core/pull/9058))

## [2.0.0]

### Added

- Add `keyringV2Builders` to the `keyringController` instance options, forwarded to the `KeyringController` constructor ([#8956](https://github.com/MetaMask/core/pull/8956))
- **BREAKING:** Add `StorageService` initialization ([#8946](https://github.com/MetaMask/core/pull/8946))
  - Passing `instanceOptions.storageService.storage` is now required.
- Export `importSecretRecoveryPhrase` from the package root ([#8952](https://github.com/MetaMask/core/pull/8952))

## [1.0.1]

### Changed

- Bump `@metamask/keyring-controller` from `^25.5.0` to `^26.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [1.0.0]

### Added

- Initial release ([#8838](https://github.com/MetaMask/core/pull/8838))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/wallet@8.0.0...HEAD
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/wallet@7.0.1...@metamask/wallet@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/wallet@7.0.0...@metamask/wallet@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/wallet@6.0.0...@metamask/wallet@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/wallet@5.0.0...@metamask/wallet@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/wallet@4.0.0...@metamask/wallet@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/wallet@3.0.0...@metamask/wallet@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/wallet@2.0.0...@metamask/wallet@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/wallet@1.0.1...@metamask/wallet@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/wallet@1.0.0...@metamask/wallet@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/wallet@1.0.0
