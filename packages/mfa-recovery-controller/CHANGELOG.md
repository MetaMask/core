# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `MfaRecoveryController` for replicating an MFA recovery secret across injected escrow replicas ([#10022](https://github.com/MetaMask/core/pull/10022))
  - Public methods: `register`, `updateRecoverySecret`, `updateIdentifiers`, `authenticateIdentifier`, `getRecoverySecret`, `resume`, `abort`, and `getPhase`
  - Inject `RecoveryAuthProvider`, `RecoveryIdentifierAuthProvider`, `RecoveryEscrowProvider[]`, and `PendingOperationEncryptor`
  - Persist only an encrypted `authorizing` / `writing` pending mutation (`idle` when `pendingOperation` is `null`)
  - `register` and `updateIdentifiers` require at least two distinct identifiers (`MIN_IDENTIFIERS`)
  - Identifier types `passkey`, `oidc`, and `siwe` are key-bound; `emailOtp` / `smsOtp` are not wired yet
  - `getRecoverySecret` returns `{ recoverySecret, epoch }`; pass that `epoch` into later `updateRecoverySecret` / `updateIdentifiers` calls (register uses `0`). Does not block on a pending mutation; returns the highest consistent version across available escrows
  - Mutation `payloadHash` is the hash of the logical pending payload (`identifiers` and/or `0x`-hex secret). At apply, each escrow receives `{ pkE, ciphertext }` wrapped to its own wrap key with escrow-wrap-v1
  - `getSecret` request hashes bind the client's ephemeral `pkE`; responses are `{ ciphertext }` plus `wrapKeyId`
  - `Mutation.audiences` is the configured replica-id list, in that order. Each replica should require an exact match
  - `MutationReceipt` includes `receiptKeyId`. `RecoveryEscrowProvider.verifyReceipt` takes the expected escrow id and verifies with that replica's receipt key
  - `AuthControllerToken.expiresAt` and `PoPChallenge.expiresAt` are Unix seconds
  - Mutations require idle pending state (`resume()` / `abort()` first). `abort()` drops `authorizing` only; `writing` must be finished with `resume()`
  - `CubistEscrowProvider` invokes Cubist escrow commands through `@cubist-labs/cubesigner-sdk` `policyInvoke` (`ping`, `generateChallenge`, `applyMutation`, `getSecret` on `cubist_secret_escrow`) and verifies receipts with a pinned receipt public key
  - `authenticateIdentifier` returns an in-memory `IdentifierSession` for key-bound recovery-secret reads
  - Configurable `promptTimeoutMs` (default `300000`) and `requestTimeoutMs` (default `30000`); each must be a positive integer or construction fails with `invalid_timeout`
  - Bound authorization, identifier, escrow, and pending-state encrypt/decrypt calls; user prompts use `prompt_timeout`, network and storage use `request_timeout` when a limit is exceeded
  - Forward cooperative `AbortSignal` values to injected auth, identifier, and escrow providers; `CubistEscrowProvider` skips new `policyInvoke` calls when already aborted but cannot cancel an in-flight SDK request
  - `getPhase` and `getRecoverySecret` do not wait for the mutation lock and may run while a mutation is authorizing or writing
  - `abort()` aborts in-flight authorizing work, clears `authorizing` pending, and rejects operations queued before the abort with `operation_aborted`; rejects immediately with `abort_not_allowed` once escrow apply may have started (`writing` must `resume()`). A resume of persisted `writing` state may be cancelled during pre-apply work but still rejects `abort()` and leaves the pending mutation unchanged

### Changed

- **BREAKING:** `getRecoverySecret` now accepts an `IdentifierSession` returned by `authenticateIdentifier` instead of an `Identifier`

### Fixed

- Clear a pending mutation when every escrow rejects it before applying, so a second `register` or an update with a stale epoch does not stay in `writing`. `resume()` still retries an incomplete write, and `abort()` still refuses a `writing` mutation that may have been applied

[Unreleased]: https://github.com/MetaMask/core/
