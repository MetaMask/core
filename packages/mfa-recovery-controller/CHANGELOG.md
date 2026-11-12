# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `authenticateIdentifier` returns an `IdentifierSession` from one identifier login: key-bound recovery material for `getRecoverySecret`, plus optional `seedlessAuthData` on that session when the login returned it (social logins; passkey / SIWE omit it) ([#11224](https://github.com/MetaMask/core/pull/11224))
  - `RecoveryIdentifierAuthProvider` has a single method, `getKeyBoundIdentifierLogin`, which returns the key-bound `token` and optional `seedlessAuthData` (`KeyBoundIdentifierLogin`). It replaces `getKeyBoundIdentifierToken`; reads and mutation writes both call it.
  - Callers decide whether they need `session.seedlessAuthData`, including checking `revokeToken` for the seedless password unlock path. Mutation writes and `getRecoverySecret` use only the key-bound credential fields and never send seedless tokens to escrows.
  - Validates that the key-bound token matches the requested identifier, proof key, and request hash. Empty request `identifier.value` (provider-discovered subject) is allowed only on `authenticateIdentifier`, not on mutation writes.
  - `seedlessAuthData` is `SeedlessAuthData` from `@metamask/seedless-onboarding-controller` (the `authenticate` parameters, without `skipLock`; based on `AuthenticatedUserDetails` without `nodeAuthTokens`). Shape checks use that package's `parseSeedlessAuthData`, and the issuer-namespace map is its `AUTH_CONNECTION_BY_NAMESPACE`. `authConnection` is still checked against the social identifier's issuer namespace (provider check only; subject / `userId` are not compared).
- Initial release of `MfaRecoveryController`, which manages MFA recovery flows and persists in-flight operations in its state ([#10022](https://github.com/MetaMask/core/pull/10022), [#11280](https://github.com/MetaMask/core/pull/11280))
  - Requires recent, request-bound AAL2 approvals for writes and reads.
  - Sends the approval's identifiers to escrows as `approvedIdentifiers` with `register` and `updateIdentifiers` mutations, and rejects payload identifiers that are not exactly among them before writing ([#10883](https://github.com/MetaMask/core/pull/10883))
  - Adds `getIdentifiers`, which returns the enrolled identifiers at the highest escrow version as `epoch` along with Auth's identifiers, for building `updateIdentifiers` calls ([#11149](https://github.com/MetaMask/core/pull/11149))
  - Passes the operation's AuthController token to `RecoveryEscrowProvider.generateChallenge`, and requires `RecoveryEscrowProvider.getIdentifiers` ([#11149](https://github.com/MetaMask/core/pull/11149))
  - Proves each SIWE identifier an escrow has not enrolled through `identifierAuthProvider`, including at `register`, instead of requiring it in `approvedIdentifiers`, and passes `RecoveryEscrowProvider.applyMutation` a list of identifier authorizations sharing one challenge ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Rejects SIWE identifiers with malformed verifier fields, an invalid address or domain, or a `namespace` that is not their verifier's `domain:chainId` with `invalid_identifier` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Rejects duplicate identifiers with `duplicate_identifier` and more than 16 identifiers with `too_many_identifiers` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Clears a `writing` mutation in `abort()` and `resume()` once its approval has expired and no escrow applied it; `resume()` then throws `MutationRejectedError` ([#11151](https://github.com/MetaMask/core/pull/11151))
  - Requires a `lockProvider` and adds `acquireLock` and `releaseLock`; the lease is acquired, or extended if already held, before every approval, and its ID is persisted in `lockId` ([#10910](https://github.com/MetaMask/core/pull/10910))
  - Exports `RecoveryRegistrationLockProvider`, `RecoveryRegistrationLockProviderOptions`, `RecoveryRegistrationLockProviderMessenger` and `RecoveryLockProvider` for holding the lease in the recovery registration service ([#10910](https://github.com/MetaMask/core/pull/10910))
  - Exports `MfaRecoveryController`, `getDefaultMfaRecoveryControllerState`, and the controller's action, event, messenger, state, and options types.
  - Exports `AuthApiRecoveryAuthProvider`, `AuthApiRecoveryAuthProviderOptions` and `AuthApiRecoveryAuthProviderMessenger` for requesting approvals through `AuthenticationController:requestMfaApproval`, using the profile id from `AuthenticationController:refreshCanonicalProfileId` ([#10883](https://github.com/MetaMask/core/pull/10883))
  - Exports `CubistEscrowProvider` and `CubistEscrowProviderOptions` for storing recovery secrets with CubeSigner. `CubistEscrowProviderOptions` takes a `getClient` callback instead of a CubeSigner client so callers can create and refresh the session lazily ([#11280](https://github.com/MetaMask/core/pull/11280))
  - Exports `MfaRecoveryError`, `IncompleteMutationError`, and `MutationRejectedError`.
  - Exports `MIN_IDENTIFIERS`, `IDENTIFIER_AUTH_MODES`, and `getIdentifierAuthMode` for identifier authentication.
  - Exports types for the recovery providers (`RecoveryAuthProvider`, `RecoveryIdentifierAuthProvider`, `RecoveryEscrowProvider`) and the pending operation encryptor (`PendingOperationEncryptor`), along with the related identifier, mutation, and recovery phase types, including `GetIdentifiersResponse` and `RecoveryIdentifiers` ([#11149](https://github.com/MetaMask/core/pull/11149))
- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Changed

- Bump `@metamask/utils` from `^12.0.0` to `^12.0.1` ([#11107](https://github.com/MetaMask/core/pull/11107))
- Bump `@metamask/profile-sync-controller` from `^36.0.0` to `^36.1.1` ([#11396](https://github.com/MetaMask/core/pull/11396), [#11419](https://github.com/MetaMask/core/pull/11419))

[Unreleased]: https://github.com/MetaMask/core/
