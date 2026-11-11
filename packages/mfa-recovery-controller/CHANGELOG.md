# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `MfaRecoveryController`, which manages MFA recovery flows and persists in-flight operations in its state ([#10022](https://github.com/MetaMask/core/pull/10022))
  - Requires recent, request-bound AAL2 approvals for writes and reads. Approvals are requested through `AuthenticationController:requestMfaApproval`, and the canonical profile id is resolved through `AuthenticationController:refreshCanonicalProfileId`, both on the controller's messenger. Pending state is encrypted with a key returned by the required `getPendingOperationKey` constructor option, which the host keeps in its own secret storage; the controller never creates or persists the key, and rejects with `missing_encryption_key` when the callback returns none. The key is imported with the injected `encryptor`, which should be the same instance passed to `KeyringController`.
  - Sends the approval's identifiers to escrows as `approvedIdentifiers` with `register` and `updateIdentifiers` mutations, and rejects payload identifiers that are not exactly among them before writing ([#10883](https://github.com/MetaMask/core/pull/10883))
  - Adds `getIdentifiers`, which returns the enrolled identifiers at the highest escrow version as `epoch` along with Auth's identifiers, for building `updateIdentifiers` calls ([#11149](https://github.com/MetaMask/core/pull/11149))
  - Passes the operation's AuthController token to `RecoveryEscrowProvider.generateChallenge`, and requires `RecoveryEscrowProvider.getIdentifiers` ([#11149](https://github.com/MetaMask/core/pull/11149))
  - Proves each SIWE identifier an escrow has not enrolled through `identifierAuthProvider`, including at `register`, instead of requiring it in `approvedIdentifiers`, and passes `RecoveryEscrowProvider.applyMutation` a list of identifier authorizations sharing one challenge ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Rejects SIWE identifiers with malformed verifier fields, an invalid address or domain, or a `namespace` that is not their verifier's `domain:chainId` with `invalid_identifier` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Rejects duplicate identifiers with `duplicate_identifier` and more than 16 identifiers with `too_many_identifiers` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Clears a `writing` mutation in `abort()` and `resume()` once its approval has expired and no escrow applied it; `resume()` then throws `MutationRejectedError` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Exports `MfaRecoveryController`, `getDefaultMfaRecoveryControllerState`, and the controller's action, event, messenger, state, and options types.
  - Exports `CubistEscrowProvider` and `CubistEscrowProviderOptions` for storing recovery secrets with CubeSigner. `CubistEscrowProviderOptions` takes a `getClient` callback instead of a CubeSigner client so callers can create and refresh the session lazily. `isAvailable` rethrows `getClient` errors and expired sessions, and commands reject with an `MfaRecoveryError` with code `session_expired` when the CubeSigner session has expired or cannot be refreshed ([#11280](https://github.com/MetaMask/core/pull/11280))
  - Exports `MfaRecoveryError`, `IncompleteMutationError`, and `MutationRejectedError`.
  - Exports `MIN_IDENTIFIERS`, `IDENTIFIER_AUTH_MODES`, and `getIdentifierAuthMode` for identifier authentication.
  - Exports types for the recovery providers (`RecoveryIdentifierAuthProvider`, `RecoveryEscrowProvider`) and `PendingOperationEncryptor`, the subset of KeyringController's `Encryptor` used for pending state, along with the related identifier, mutation, and recovery phase types, including `GetIdentifiersResponse` and `RecoveryIdentifiers` ([#11149](https://github.com/MetaMask/core/pull/11149))
- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Changed

- Bump `@metamask/utils` from `^12.0.0` to `^12.0.1` ([#11107](https://github.com/MetaMask/core/pull/11107))
- Bump `@metamask/profile-sync-controller` from `^36.0.0` to `^36.1.1` ([#11396](https://github.com/MetaMask/core/pull/11396), [#11419](https://github.com/MetaMask/core/pull/11419))

### Fixed

- Propagate errors thrown by `RecoveryEscrowProvider.isAvailable`, such as `feature_disabled` or a failed registration, instead of treating them as an unavailable escrow ([#11280](https://github.com/MetaMask/core/pull/11280))

[Unreleased]: https://github.com/MetaMask/core/
