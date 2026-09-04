# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `MfaRecoveryController` with injectable `RecoveryAuthProvider` and `RecoveryEscrowProvider` interfaces, a persisted `idle` / `authorizing` / `writing` mutation state machine, and `register`, `updateRecoverySecret`, `updateIdentifiers`, `getRecoverySecret`, `resume`, and `abort` methods

### Changed

- **BREAKING:** Require `RecoveryEscrowProvider.verifyReceipt` to receive the expected escrow id so receipt verification is explicitly bound to the configured escrow target
- Expose controller state updates through the non-deprecated `MfaRecoveryController:stateChanged` messenger event
- Retry only escrows without persisted mutation receipts and validate persisted mutation state before resuming it

### Fixed

- Clear fully acknowledged pending mutations without checking unavailable acknowledged escrows
- Persist valid receipts from concurrent escrow writes before reporting an invalid receipt response
- Reject malformed persisted mutation state before authorization or escrow writes

[Unreleased]: https://github.com/MetaMask/core/
