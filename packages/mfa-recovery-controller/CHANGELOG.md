# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `MfaRecoveryController` with injectable `RecoveryAuthProvider` and `RecoveryEscrowProvider` interfaces, a persisted `idle` / `authorizing` / `writing` mutation state machine, and `register`, `updateRecoverySecret`, `updateIdentifiers`, `getRecoverySecret`, `resume`, and `abort` methods

### Changed

- **BREAKING:** Return `{ recoverySecret, epoch }` from `getRecoverySecret` so clients can pass the selected version into later mutations
- **BREAKING:** Require `RecoveryEscrowProvider.verifyReceipt` to receive the expected escrow id so receipt verification is explicitly bound to the configured escrow target
- **BREAKING:** Bind mutation version allocation to payload `epoch` on `register`, `updateRecoverySecret`, and `updateIdentifiers`, and remove unauthenticated `RecoveryEscrowProvider.getRecoveryMetadata` lookups
- Expose controller state updates through the non-deprecated `MfaRecoveryController:stateChanged` messenger event
- Retry only escrows without persisted mutation receipts and validate persisted mutation state before resuming it

### Fixed

- Clear fully acknowledged pending mutations without checking unavailable acknowledged escrows
- Persist valid receipts from concurrent escrow writes before reporting an invalid receipt response
- Persist `writing` mutation state before the first escrow write so ambiguous
  failures remain resumable while identifier-auth failures remain abortable

[Unreleased]: https://github.com/MetaMask/core/
