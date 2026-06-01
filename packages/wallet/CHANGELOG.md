# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **BREAKING:** Add `StorageService` initialization ([#8946](https://github.com/MetaMask/core/pull/8946))
  - Passing `instanceOptions.storageService.storage` is now required.
- Export `importSecretRecoveryPhrase` from the package root ([#8952](https://github.com/MetaMask/core/pull/8952))
- Wire `ApprovalController` into the default wallet initialization ([#8953](https://github.com/MetaMask/core/pull/8953))
  - Adds an `approvalController` slot to `instanceOptions` with `showApprovalRequest` (the callback that surfaces pending approval requests to the user; defaults to a no-op) and `typesExcludedFromRateLimiting` (the approval types exempt from per-origin rate limiting; defaults to the EVM signing/transaction types). Both let consumers (extension, mobile, wallet-cli) inject their platform-specific values.

## [1.0.1]

### Changed

- Bump `@metamask/keyring-controller` from `^25.5.0` to `^26.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [1.0.0]

### Added

- Initial release ([#8838](https://github.com/MetaMask/core/pull/8838))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/wallet@1.0.1...HEAD
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/wallet@1.0.0...@metamask/wallet@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/wallet@1.0.0
