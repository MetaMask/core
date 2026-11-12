# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `MfaRecoveryController`, which manages MFA recovery flows and persists in-flight operations in its state ([#10022](https://github.com/MetaMask/core/pull/10022))
  - Requires recent, request-bound AAL2 approvals for writes and reads.
  - Sends the approval's identifiers to escrows as `approvedIdentifiers` with `register` and `updateIdentifiers` mutations, and rejects payload identifiers that are not exactly among them before writing ([#10883](https://github.com/MetaMask/core/pull/10883))
  - Adds `getIdentifiers`, which returns the enrolled identifiers and their escrow version as `epoch` along with Auth's identifiers, for building `updateIdentifiers` calls ([#11149](https://github.com/MetaMask/core/pull/11149))
  - Passes the operation's AuthController token to `RecoveryEscrowProvider.generateChallenge`, and requires `RecoveryEscrowProvider.getIdentifiers` ([#11149](https://github.com/MetaMask/core/pull/11149))
  - Proves each SIWE identifier an escrow has not enrolled through `identifierAuthProvider`, including at `register`, instead of requiring it in `approvedIdentifiers`, and passes `RecoveryEscrowProvider.applyMutation` a list of identifier authorizations sharing one challenge ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Rejects SIWE identifiers with malformed verifier fields, an invalid address or domain, or a `namespace` that is not their verifier's `domain:chainId` with `invalid_identifier` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Rejects duplicate identifiers with `duplicate_identifier` and more than 16 identifiers with `too_many_identifiers` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Clears a `writing` mutation in `abort()` and `resume()` once its approval has expired and no escrow applied it; `resume()` then throws `MutationRejectedError` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Requires a `lockProvider` and adds `acquireLock`, `renewLock` and `releaseLock`; the lease is acquired or renewed before every approval, and its ID is persisted in `lockId` ([#10910](https://github.com/MetaMask/core/pull/10910))
  - Exports `RecoveryRegistrationLockProvider`, `RecoveryRegistrationLockProviderOptions`, `RecoveryRegistrationLockProviderMessenger` and `RecoveryLockProvider` for holding the lease in the recovery registration service ([#10910](https://github.com/MetaMask/core/pull/10910))
  - Requires every escrow for `getIdentifiers`, as for mutations ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Rejects new mutations and `getIdentifiers` with `replica_lagging` when escrows are at different versions, and adds an optional `identifier` to `resume`; with no pending mutation, `resume(identifier)` copies the highest escrow record to escrows one version behind it ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Requires `RecoveryEscrowProvider.getMutationReceipt`, implemented by `CubistEscrowProvider`, and uses it to check escrows that moved off a mutation's `expectedVersion` before writing the rest ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Rejects updates whose `identifier` is not enrolled on every target escrow with `identifier_not_enrolled`, before requesting approval and again before each write ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Authorizes a pending update with the `identifier` passed to `resume`, instead of the saved one, and saves it for later resumes ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Clears a pending mutation with `mutation_superseded`, without sending it, when an escrow that moved off `expectedVersion` has no receipt for it ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Waits until a `writing` mutation's approval expired more than 5 minutes ago, allowing for device clock skew, before `abort()` or `resume()` clears it ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Compares only the secret, not `lastMutationId`, when checking replicas at the highest version on reads ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Requires `RecoveryEscrowProvider.getIdentifiers` to report a missing record as `{ identifiers: [], version: 0 }`, so `getIdentifiers` returns `epoch: 0` before registration ([#11200](https://github.com/MetaMask/core/pull/11200))
  - Exports `MfaRecoveryController`, `getDefaultMfaRecoveryControllerState`, and the controller's action, event, messenger, state, and options types.
  - Exports `AuthApiRecoveryAuthProvider`, `AuthApiRecoveryAuthProviderOptions` and `AuthApiRecoveryAuthProviderMessenger` for requesting approvals through `AuthenticationController:requestMfaApproval`, using the profile id from `AuthenticationController:refreshCanonicalProfileId` ([#10883](https://github.com/MetaMask/core/pull/10883))
  - Exports `CubistEscrowProvider` and `CubistEscrowProviderOptions` for storing recovery secrets with CubeSigner.
  - Exports `MfaRecoveryError`, `IncompleteMutationError`, and `MutationRejectedError`.
  - Exports `MIN_IDENTIFIERS`, `IDENTIFIER_AUTH_MODES`, and `getIdentifierAuthMode` for identifier authentication.
  - Exports types for the recovery providers (`RecoveryAuthProvider`, `RecoveryIdentifierAuthProvider`, `RecoveryEscrowProvider`) and the pending operation encryptor (`PendingOperationEncryptor`), along with the related identifier, mutation, and recovery phase types, including `GetIdentifiersResponse` and `RecoveryIdentifiers` ([#11149](https://github.com/MetaMask/core/pull/11149))
- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Changed

- Bump `@metamask/utils` from `^12.0.0` to `^12.0.1` ([#11107](https://github.com/MetaMask/core/pull/11107))
- Bump `@metamask/profile-sync-controller` from `^36.0.0` to `^36.1.1` ([#11396](https://github.com/MetaMask/core/pull/11396), [#11419](https://github.com/MetaMask/core/pull/11419))

[Unreleased]: https://github.com/MetaMask/core/
