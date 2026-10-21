# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `MfaRecoveryController`, which manages MFA recovery flows and persists in-flight operations in its state ([#10022](https://github.com/MetaMask/core/pull/10022))
  - Exports `MfaRecoveryController`, `getDefaultMfaRecoveryControllerState`, and the controller's action, event, messenger, state, and options types.
  - Exports `CubistEscrowProvider` and `CubistEscrowProviderOptions` for storing recovery secrets with CubeSigner.
  - Exports `MfaRecoveryError`, `IncompleteMutationError`, and `MutationRejectedError`.
  - Exports `MIN_IDENTIFIERS`, `IDENTIFIER_AUTH_MODES`, and `getIdentifierAuthMode` for identifier authentication.
  - Exports types for the recovery providers (`RecoveryAuthProvider`, `RecoveryIdentifierAuthProvider`, `RecoveryEscrowProvider`) and the pending operation encryptor (`PendingOperationEncryptor`), along with the related identifier, mutation, and recovery phase types.

[Unreleased]: https://github.com/MetaMask/core/
