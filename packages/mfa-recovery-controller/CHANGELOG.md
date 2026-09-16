# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `MfaRecoveryController` for replicating an MFA recovery secret across injected escrow replicas
  - Public methods: `register`, `updateRecoverySecret`, `updateIdentifiers`, `getRecoverySecret`, `resume`, `abort`, and `getPhase`
  - Inject `RecoveryAuthProvider`, `RecoveryIdentifierAuthProvider`, `RecoveryEscrowProvider[]`, and `PendingOperationEncryptor`
  - Persist only an encrypted `authorizing` / `writing` pending mutation (`idle` when `pendingOperation` is `null`)
  - `register` and `updateIdentifiers` require at least two identifiers (`MIN_IDENTIFIERS`)
  - Identifier types `passkey`, `oidc`, and `siwe` are key-bound; `emailOtp` / `smsOtp` are not wired yet
  - `getRecoverySecret` returns `{ recoverySecret, epoch }`; pass that `epoch` into later `updateRecoverySecret` / `updateIdentifiers` calls (register uses `0`)
  - Mutation `payloadHash` is the hash of the logical pending payload (`identifiers` and/or `0x`-hex secret). At apply, each escrow receives `{ pkE, ciphertext }` wrapped to its own wrap key with escrow-wrap-v1
  - `getSecret` request hashes bind the client's ephemeral `pkE`; responses are `{ ciphertext }` plus `wrapKeyId`
  - `Mutation.audiences` is the configured replica-id list, in that order. Each replica should require an exact match
  - `MutationReceipt` includes `receiptKeyId`. `RecoveryEscrowProvider.verifyReceipt` takes the expected escrow id and verifies with that replica's receipt key
  - `AuthControllerToken.expiresAt` and `PoPChallenge.expiresAt` are Unix seconds
  - `abort()` is allowed only while `authorizing`. `writing` is persisted before the first escrow apply and must be finished with `resume()`

[Unreleased]: https://github.com/MetaMask/core/
