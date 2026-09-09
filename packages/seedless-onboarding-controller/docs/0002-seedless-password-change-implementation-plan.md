# Implementation plan: Seedless password-change recovery

- Related ADR: [ADR 0001: Recovering server-first Seedless password changes](./0001-seedless-password-change-recovery.md)
- Related contract: [Phase 0 contract 0003](./0003-seedless-password-change-contracts.md)
- Status: Planned
- Scope: `SeedlessOnboardingController`, its messenger contract, package tests, and the client persistence/orchestration contract required by the controller

## Progress tracker

Update the checkboxes as work is completed. Keep the phase status aligned with its checklist:

- `Not started` — no task in the phase is complete.
- `In progress` — at least one task is complete, but the phase checklist is not complete.
- `Blocked` — progress cannot continue until an open decision or external dependency is resolved.
- `Complete` — all tasks and verification items in the phase are complete.

| Phase                              | Status      | Remaining work                                                 |
| ---------------------------------- | ----------- | -------------------------------------------------------------- |
| 0. External prerequisites          | Complete    | —                                                              |
| 1. Lifecycle model                 | Complete    | —                                                              |
| 2. Controller lifecycle operations | Complete    | —                                                              |
| 3. `changePassword` flow           | Complete    | —                                                              |
| 4. Keyring-key storage             | Complete    | —                                                              |
| 5. Recovery primitives             | Complete    | —                                                              |
| 6. Messenger/package contracts     | Complete    | —                                                              |
| 7. Client integration              | Not started | Add coordinator, locking, unlock routing, UI, and E2E coverage |

At the end of each phase, update its status and remove completed items from the remaining-work description. Keep unresolved items in [Open decisions before implementation](#open-decisions-before-implementation).

## Goal

Make Seedless password changes recoverable after a crash, lost response, or partial local update.

The controller should persist enough non-sensitive lifecycle information to tell the client that recovery is required. The client should then verify the actual remote and local state and finish the operation. The implementation must remain server-first. The password change is never retried; recovery reconciles local state using the existing password-sync flow.

## Design summary

Use one persisted field that holds the last-known phase:

```ts
passwordChangePhase?: SeedlessPasswordChangePhase;
```

The field must never contain a password, SRP, raw encryption key, decrypted vault data, or an error message that may contain sensitive data. Missing or `undefined` means `IDLE`.

Use the lifecycle as a recovery signal only. It is not proof that a remote or local operation completed. Recovery must always:

1. Check authoritative remote state.
2. Verify the local Keyring cryptographically.
3. Reconcile local state using the existing password-sync flow (`submitGlobalPassword` + `syncLatestGlobalPassword`); never retry `changePassword` or `changeEncKey`.
4. Keep the wallet locked if the state cannot be established.

**No retries, no concurrency.** A password-change operation must never be retried as a fresh `changePassword`/`changeEncKey` call while the previous outcome is unresolved. Race conditions here are dangerous and could block users from their wallets. The existing controller mutex (`#withControllerLock` / `#controllerOperationMutex`) already serializes all mutable controller operations; the client coordinator must add a single lock that also covers the KeyringController operation. The lifecycle exists to signal that recovery is needed — not to enable retries.

The lifecycle phases are the names from the ADR:

`IDLE`, `SEEDLESS_CHANGE_PENDING`, `SEEDLESS_COMMITTED`, `LOCAL_KEYRING_PENDING`, `KEY_SYNC_PENDING`, `COMPLETE`, and `UNKNOWN`.

## Current implementation and gaps

The plan should reuse these existing capabilities:

- `changePassword` already verifies the old Seedless vault password, calls `#assertPasswordInSync({ skipCache: true })`, calls `#changeEncryptionKey`, rewrites the local Seedless vault with `#createNewVaultWithAuthData`, and stores the existing Keyring encryption key with `storeKeyringEncryptionKey`.
- `#executeWithTokenRefresh` already handles the controller’s token-refresh retry path.
- `#withControllerLock` already serializes mutable controller operations.
- `loadKeyringEncryptionKey` and `storeKeyringEncryptionKey` already decrypt and encrypt the Keyring encryption key using the current Seedless password encryption key.
- `submitGlobalPassword` and `syncLatestGlobalPassword` already recover and persist the latest global password locally. This is the **existing password-sync flow** that handles “remote changed, local is outdated” (e.g. another device changed the password). It is reused as the recovery mechanism for a partially committed password change.
- `checkIsPasswordOutdated({ skipCache: true })` already provides a cache-bypassed auth-public-key comparison via `toprfClient.fetchAuthPubKey`. This is the authoritative old-vs-new check.
- `verifyVaultPassword`, `#unlockVaultAndGetVaultData`, and `#updateVault` already provide local Seedless vault verification and rewriting.
- `serializeVaultData`, `deserializeVaultData`, and the existing AES helpers should continue to be used for vault/key handling.

The gaps that the implementation must address are:

- `changePassword` has no lifecycle transitions.
- `storeKeyringEncryptionKey` currently updates controller state but does not prove that the state reached durable storage.
- `BaseController.update` is synchronous. It publishes `stateChanged`, but the controller cannot currently await a client’s storage write.
- The current controller mutex protects controller operations, but it does not serialize a client’s KeyringController operation with the controller operation.

## Proposed public contract

Keep the existing methods where possible. Add only the lifecycle information needed to make recovery safe.

### State and constants

1. Add `SeedlessPasswordChangePhase` to `src/constants.ts`.

   - Use string enum values matching the ADR exactly.
   - Add no sensitive values to the enum.

2. Add `passwordChangePhase?: SeedlessPasswordChangePhase` to `SeedlessOnboardingControllerState` in `src/types.ts`.

   - Make the field optional so old persisted state without it is treated as `IDLE`.

3. Add metadata for `passwordChangePhase` in `seedlessOnboardingMetadata`.

   - Set `persist: true`.
   - Keep state logs and debug snapshots limited to safe fields, or exclude the field if the platform does not need it there.
   - Do not expose raw error objects through state.

4. Export the phase type through `src/index.ts`.

### Lifecycle helpers

Add small, pure helpers rather than spreading phase mutations through the controller:

1. Define a helper for treating a missing phase as `IDLE`.
2. Validate legal transitions in tests. Do not make the transition validator the source of truth for recovery; a persisted phase may be stale.

These helpers can live in `src/utils.ts` if they remain general and pure. Keep controller-specific transition behavior in private controller methods.

### Transaction identifier

Out of scope for this plan. The Seedless/TOPRF server does not accept an idempotency key or transaction ID today, and adding one is not a simple server-side change. Recovery here does not retry the password change — it uses the existing password-sync flow (`checkIsPasswordOutdated` + `submitGlobalPassword` + `syncLatestGlobalPassword`) to reconcile local state once remote state is established. A transaction ID remains a “good to have” for a future TOPRF release; until then, ambiguous remote results stay `UNKNOWN`.

### Lifecycle persistence

The lifecycle is persisted as ordinary controller state. The `passwordChangePhase` field has `persist: true` metadata, so it is written through the controller's normal `stateChange` flow (the same debounced persistence path as every other persisted field). There is no separate awaitable durability hook on the controller.

The lifecycle is a recovery signal only — it is not proof that a remote or local operation completed, and it is not proof that the lifecycle itself reached durable storage before the next step ran. A crash can leave the durable marker behind the actual cryptographic state, so recovery must always re-verify actual remote and local state before acting on the phase. A missing or stale marker is recoverable: `checkIsPasswordOutdated({ skipCache: true })` detects a remote change with no marker at all, and cryptographic Keyring verification classifies the local state.

Required lifecycle write points (controller `this.update(...)` calls):

- before the first remote mutation (`SEEDLESS_CHANGE_PENDING`);
- after each irreversible boundary (`SEEDLESS_COMMITTED`, `LOCAL_KEYRING_PENDING`);
- after local Keyring-key storage when that update is coupled to a lifecycle write;
- after `COMPLETE`;
- after explicit clear to `IDLE`.

On a failed step the controller **preserves the last known phase**; it does not overwrite it with `UNKNOWN`. The last written phase is the recovery signal: e.g. if `changeEncKey` rejected, the phase stays `SEEDLESS_CHANGE_PENDING` and the client performs an authoritative password-outdated check to choose the recovery branch. If the failure happened before the first lifecycle write, the lifecycle stays `IDLE` (nothing to recover). `UNKNOWN` is a recovery-time determination made by the client when an authoritative server check or local cryptographic verification cannot establish the state — not a phase written by `changePassword`'s catch block.

These publish `SeedlessOnboardingController:stateChange`; they are not awaited durability boundaries. See [0003](./0003-seedless-password-change-contracts.md).

## Development phases

### Phase 0: Confirm external prerequisites

Complete these checks before changing controller behavior:

- [x] Confirm how Seedless reports the result of a password-change request after a timeout or lost response.
- [x] Confirm whether the password-change request accepts an idempotency key or transaction ID.
- [x] Confirm whether Keyring encryption-key synchronization is a Seedless/TOPRF API, a client persistence operation, or both.
- [x] Define how the remote service reports old, new, partial, and unknown state.
- [x] Define the lifecycle persistence approach for extension and mobile.
- [x] Define how the client reads the lifecycle before attempting normal unlock.

Deliverable: [0003-seedless-password-change-contracts.md](./0003-seedless-password-change-contracts.md). Authoritative remote status is unavailable in `@metamask/toprf-secure-backup@1.1.0`; lost-response and partial backup paths remain `UNKNOWN` until TOPRF adds that API.

### Phase 1: Add the lifecycle model

- [x] Add the phase enum and lifecycle type.
- [x] Add the optional state field and metadata.
- [x] Treat missing state as `IDLE` for backward compatibility.
- [x] Add pure lifecycle helpers and legal-transition tests.
- [x] Add exports and messenger type visibility where required.
- [x] Update the test fixture helpers so lifecycle state can be supplied and inspected.

Verify:

- [x] Lifecycle values are persisted.
- [x] Sensitive fields are not included in the lifecycle.
- [x] Old state fixtures still construct successfully.
- [x] Default state behavior remains unchanged except for the new optional field.

### Phase 2: Add controller lifecycle operations

Add private methods with names that describe the boundary, for example:

- `#startPasswordChangeLifecycle`
- `#advancePasswordChangeLifecycle`
- `#writePasswordChangePhase`
- `#completePasswordChangeLifecycle`
- `#clearPasswordChangePhase`

Implement them in this order:

- [x] Create the lifecycle before the first remote mutation with `SEEDLESS_CHANGE_PENDING`.
- [x] Preserve the last known phase when any later operation throws; do not overwrite it with `UNKNOWN` and do not reset to `IDLE` on every error.
- [x] Make clearing the lifecycle an explicit operation after definitive remote failure or durable `COMPLETE`.
- [x] Keep all transitions serialized under `#withControllerLock`.
- [x] Route durable lifecycle writes through the persistence contract selected in Phase 0.

Do not add a second mutex unless the existing controller mutex cannot protect the lifecycle update. The client must use its own coordinator lock for the cross-controller transaction.

### Phase 3: Refactor `changePassword` around explicit boundaries

Refactor the current method without duplicating its cryptographic work:

- [x] Acquire the existing controller lock.
- [x] Reject a second concurrent password change; recovery must finish before a new one starts.
- [x] Create/persist the lifecycle as `SEEDLESS_CHANGE_PENDING`.
- [x] Reuse `verifyVaultPassword(oldPassword, { skipLock: true })`.
- [x] Reuse `#assertPasswordInSync({ skipCache: true, skipLock: true })`.
- [x] Reuse `loadKeyringEncryptionKey()` before the remote mutation when an encrypted Keyring key exists.
- [x] Call `#changeEncryptionKey` through the existing `#executeWithTokenRefresh` wrapper.
- [x] After authoritative remote commitment, persist `SEEDLESS_COMMITTED`.
- [x] Reuse `#createNewVaultWithAuthData` to write the new local Seedless vault.
- [x] Persist `LOCAL_KEYRING_PENDING` after local Seedless state has been updated.
- [x] Reuse `storeKeyringEncryptionKey` for the encrypted local copy of the current Keyring key.
- [x] Leave final Keyring re-encryption, local Keyring-key storage, and `COMPLETE` to the client coordinator.
- [x] Preserve the existing error wrapping with `SeedlessOnboardingError`, but retain the last lifecycle phase when wrapping the error.
- [x] Reset the password-outdated cache only after the local Seedless password update succeeds, using the existing `#resetPasswordOutdatedCache`.

Important: a rejected Promise from `#changeEncryptionKey` does not prove that the server did not mutate. Only a definitive server result may return the lifecycle to `IDLE`.

### Phase 4: Make Keyring-key storage lifecycle-aware

Update `storeKeyringEncryptionKey` and its private helper with minimal behavior changes:

- [x] Keep the current `#unlockVaultAndGetVaultData` call to obtain the Seedless password encryption key.
- [x] Keep the current AES-GCM encryption and base64 encoding.
- [x] Update `encryptedKeyringEncryptionKey` and the lifecycle boundary in the same controller update where possible, so observers do not see an unrelated intermediate lifecycle state.
- [x] Allow the client to mark `KEY_SYNC_PENDING` before synchronization and `COMPLETE` only after synchronization verification and all local writes succeed.
- [x] Never let `storeKeyringEncryptionKey` mark `COMPLETE` by itself.
- [x] Keep `loadKeyringEncryptionKey` read-only with respect to lifecycle state; loading a key is not proof of recovery completion.

> **Descoped:** A separate awaitable durable-persistence boundary for lifecycle writes is out of scope for the controller. The lifecycle is persisted as ordinary controller state via the normal debounced `stateChange` path (same as every other persisted field); there is no extra durability hook on the controller. Recovery must therefore always re-verify actual remote and local state before acting on the phase — a missing or stale marker is recoverable via `checkIsPasswordOutdated({ skipCache: true })` and cryptographic Keyring verification. See [Design summary](#design-summary) and [0003](./0003-seedless-password-change-contracts.md).

### Phase 5: Add recovery-facing controller behavior

Keep cross-controller orchestration in the client, but make the controller primitives safe and explicit:

- [x] `submitGlobalPassword({ globalPassword })` remains the entry point to recover the Seedless controller with the new password.
- [x] `syncLatestGlobalPassword({ globalPassword })` remains the operation that rewrites the local Seedless vault after recovery.
- [x] `loadKeyringEncryptionKey()` remains the old-Keyring recovery input.
- [x] `storeKeyringEncryptionKey()` remains the local encrypted-key persistence operation.
- [x] `checkIsPasswordOutdated({ skipCache: true })` must be used during recovery whenever the client needs a fresh auth-public-key comparison. (Controller honors `skipCache`; covered by the "should bypass cache if skipCache is true" test.)
- [x] Do not silently use a cached `passwordOutdatedCache` result on the recovery path. (Satisfied by `skipCache` bypass.)
- [x] Preserve `#executeWithTokenRefresh` behavior for all existing password-sync operations.
- [x] Ensure controller lock state is cleaned up correctly when recovery operations fail. (`withLock` releases in `finally`.)

The client coordinator then performs the two ADR branches:

#### Old local Keyring

- [ ] Confirm remote Seedless is new via `checkIsPasswordOutdated({ skipCache: true })`.
- [ ] Recover the Seedless controller with the new password via `submitGlobalPassword({ globalPassword })` (walks the server password-key history chain).
- [ ] Rewrite the local Seedless vault via `syncLatestGlobalPassword({ globalPassword })`.
- [ ] Load the stored Keyring encryption key via `loadKeyringEncryptionKey()`.
- [ ] Call `KeyringController:submitEncryptionKey`.
- [ ] Call `KeyringController:changePassword(newPassword)`.
- [ ] Export the current Keyring encryption key.
- [ ] Store it locally via `storeKeyringEncryptionKey`.
- [ ] Verify durable local state.
- [ ] Mark `COMPLETE`.

#### New local Keyring

- [ ] Confirm remote Seedless is new via `checkIsPasswordOutdated({ skipCache: true })`.
- [ ] Recover the Seedless controller with the new password via `submitGlobalPassword({ globalPassword })`.
- [ ] Rewrite the local Seedless vault via `syncLatestGlobalPassword({ globalPassword })`.
- [ ] Verify/unlock the local Keyring with the new password.
- [ ] Export the current Keyring encryption key.
- [ ] Store it locally via `storeKeyringEncryptionKey`.
- [ ] Verify durable local state.
- [ ] Mark `COMPLETE`.

If local cryptographic verification or remote status cannot establish the branch, mark `UNKNOWN` and keep the wallet locked.

> **Scope note:** The two ADR branches above (Old / New local Keyring) are client orchestration and are implemented in [Phase 7](#phase-7-implement-client-integration). No controller-package code is required for them beyond the primitives already preserved in this phase.

### Phase 6: Update messenger and package contracts

- [x] Update `src/SeedlessOnboardingController-method-action-types.ts` documentation and types for the lifecycle-aware `changePassword` behavior. (Regenerated via `messenger-action-types:generate` after adding `clearPasswordChangePhase`, `markPasswordChangeKeySyncPending`, `completePasswordChange`, `resolvePasswordSyncState`, `recoverPasswordChange` to `MESSENGER_EXPOSED_METHODS`; `messenger-action-types:check` passes.)
- [x] Export the new lifecycle types and enum from `src/index.ts`. (`SeedlessPasswordChangePhase` and `PasswordChangeRecoveryStatus` enums exported from `./constants.js`; added the new action-type exports. The recovery methods return `PasswordChangeRecoveryStatus` directly, so no separate result type is exported.)
- [x] Check all generated/action type references compile without manually editing generated output beyond the source-of-truth file. (Only `MESSENGER_EXPOSED_METHODS` in the controller was hand-edited; the generated file was regenerated, not hand-edited.)
- [x] Update package consumers and mock messengers that call `changePassword`. (Mock messenger auto-derives from `SeedlessOnboardingControllerMessenger`; no external package references the removed `SeedlessPasswordChangeLifecycle`/`passwordChangeLifecycle`.)
- [x] Preserve the existing `changePassword` signature and behavior for callers that do not opt into lifecycle-aware recovery. (Signature unchanged; lifecycle is additive via new state field and methods.)
- [x] Add controller-owned Seedless-side recovery methods (`resolvePasswordSyncState` + `recoverPasswordChange`) so clients do not have to hand-orchestrate the Seedless half of recovery. `resolvePasswordSyncState` merges the legacy `checkIsPasswordOutdated` read with password-change recovery routing into a single unlock-time call. See [0004](./0004-controller-owned-password-change-recovery-plan.md) for the future Option B (full cross-controller recovery) migration.

### Phase 7: Implement client integration

This work is outside the controller package but is required for the ADR to be complete. The controller side of recovery is already provided (Option A): `resolvePasswordSyncState()` resolves remote state without a password (merging the legacy `checkIsPasswordOutdated` read with password-change recovery routing), and `recoverPasswordChange({ globalPassword })` reconciles the Seedless side with the new password. The client owns the Keyring-side steps and UI routing based on the returned `PasswordChangeRecoveryStatus`. See [0004](./0004-controller-owned-password-change-recovery-plan.md) for the planned Option B migration where the controller also owns the Keyring side.

- [ ] Add a single coordinator lock covering Seedless and Keyring password changes. The controller mutex already serializes controller operations; this lock extends serialization to the cross-controller transaction.
- [ ] Persist `SEEDLESS_CHANGE_PENDING` before the first remote mutation.
- [ ] Lock the wallet before exposing any password-change or recovery error.
- [ ] On unlock, inspect the durable lifecycle before normal invalid-password handling.
- [ ] For every unfinished phase, call `resolvePasswordSyncState()` first (password-less remote-state resolution); only prompt for the new password when it returns `enter-new-password`.
- [ ] After the user supplies the new password, call `recoverPasswordChange({ globalPassword })` to reconcile the Seedless side; on `reconcile-keyring`, run the Keyring-side branch below.
- [ ] Use `KeyringController:verifyPassword` to classify old versus new local Keyring state.
- [ ] Old-Keyring branch: `loadKeyringEncryptionKey` → `KeyringController:submitEncryptionKey` → `KeyringController:changePassword` → `storeKeyringEncryptionKey` → `markPasswordChangeKeySyncPending`.
- [ ] New-Keyring branch: `KeyringController:exportEncryptionKey` → `storeKeyringEncryptionKey` → `markPasswordChangeKeySyncPending`.
- [ ] `KEY_SYNC_PENDING`: unlock with the new password, export the current Keyring encryption key, store/sync it to the remote Seedless backup, then `completePasswordChange` → `clearPasswordChangePhase`.
- [ ] Never retry `changePassword` or `changeEncKey`; reconcile only via the recovery methods and the existing password-sync flow.
- [ ] Keep the wallet locked and the phase `UNKNOWN` if the result is not distinguishable.
- [ ] Persist `COMPLETE` only after local persistence is verified.
- [ ] Offer reset wallet only as an explicit last resort for a confirmed unrecoverable state.

## Test plan

### Controller unit tests

Extend `src/SeedlessOnboardingController.test.ts` and add focused tests for:

- [ ] Default and legacy state handling.
- [ ] Lifecycle metadata persistence flags.
- [ ] Valid and invalid phase transitions.
- [ ] `changePassword` writing each expected phase.
- [ ] Lifecycle preservation when old-password verification fails.
- [ ] Lifecycle preservation when `#changeEncryptionKey` rejects.
- [ ] Lifecycle preservation when local vault rewriting rejects.
- [ ] Lifecycle preservation when `storeKeyringEncryptionKey` rejects.
- [ ] Definitive remote failure returning to `IDLE` only after authoritative confirmation.
- [ ] Ambiguous remote failure becoming `UNKNOWN`.
- [ ] Keyring-key storage and lifecycle update ordering.
- [ ] Durable persistence failures being surfaced to the caller.
- [ ] Repeated lifecycle transitions being safe to re-run.
- [ ] Existing token-refresh retry behavior remaining unchanged.
- [ ] Existing `loadKeyringEncryptionKey` and `storeKeyringEncryptionKey` behavior remaining compatible.
- [ ] `resolvePasswordSyncState` returning the correct `PasswordChangeRecoveryStatus` for each phase, clearing to `IDLE` when remote did not commit, advancing to `SEEDLESS_COMMITTED` when remote committed, and returning `unknown` (preserving the phase) when the remote check fails.
- [ ] `recoverPasswordChange` reconciling the Seedless side and advancing to `LOCAL_KEYRING_PENDING` for `SEEDLESS_COMMITTED`/`LOCAL_KEYRING_PENDING`, and returning `unknown` (preserving the phase) when reconciliation fails.

Use the existing fixtures and mocks in `tests/__fixtures__` and `tests/mocks`. Add only the remote-status mocks that the new contract requires.

### Coordinator/integration tests

Add tests in each client for:

- termination before the remote request;
- termination during the remote request;
- remote commitment with an old local Keyring;
- remote commitment with an already-new local Keyring;
- failure during local Seedless persistence;
- failure during local Keyring password change;
- failure during Keyring-key storage;
- lost responses;
- stale or missing lifecycle state;
- stale password-outdated cache;
- persistence failure before `COMPLETE`;
- wallet locking before error UI or recovery UI is shown;
- recovery remaining blocked when the lock operation fails.

For every fault-injection test, verify both the durable lifecycle and the actual cryptographic/server state after restart.

## Acceptance checklist

The implementation is ready when:

- [ ] A lifecycle marker is durable before the first remote mutation.
- [ ] A remote timeout is never classified as a definitive remote failure without an authoritative status result.
- [ ] The old-Keyring branch can recover through the stored Keyring encryption key without asking for the old Keyring password.
- [ ] The new-Keyring branch can export and store the current Keyring encryption key locally.
- [ ] `COMPLETE` cannot be written before local persistence is durable.
- [ ] Recovery bypasses stale password-outdated cache results.
- [ ] Any password-change or recovery error locks the wallet before error/intermediary UI is exposed.
- [ ] An unresolved server or cryptographic result remains `UNKNOWN`.
- [ ] A second password change cannot run concurrently.
- [ ] `changePassword` / `changeEncKey` is never retried; recovery uses the existing password-sync flow.
- [ ] Existing controller tests, lint, type checks, and changelog validation pass.

## Suggested implementation order

- [x] Confirm the remote status and durable persistence contracts.
- [ ] Add lifecycle types, constants, metadata, helpers, and unit tests.
- [ ] Add the persistence boundary and test its failure behavior.
- [ ] Add lifecycle transitions to `changePassword`.
- [ ] Make `storeKeyringEncryptionKey` lifecycle-aware.
- [ ] Update messenger exports and package consumers.
- [ ] Implement client recovery orchestration and locking.
- [ ] Add fault-injection integration tests.
- [ ] Run focused package tests, then lint/type checks and changelog validation.

## Files expected to change

### This package

- `src/constants.ts` — lifecycle phase enum and `PasswordChangeRecoveryStatus` enum.
- `src/types.ts` — password-change phase state field.
- `src/utils.ts` — pure lifecycle helpers, if needed.
- `src/SeedlessOnboardingController.ts` — metadata, transition helpers, lifecycle-aware `changePassword`, lifecycle-aware key storage, and controller-owned recovery methods (`resolvePasswordSyncState`, `recoverPasswordChange`). `resolvePasswordSyncState` folds the legacy `checkIsPasswordOutdated` read (now private `#checkIsPasswordOutdated`) into the unlock-time recovery routing.
- `src/SeedlessOnboardingController-method-action-types.ts` — public action documentation/signature.
- `src/index.ts` — public exports.
- `src/SeedlessOnboardingController.test.ts` — unit and fault-injection coverage.
- `docs/0003-seedless-password-change-contracts.md` — Phase 0 shared contract.
- `docs/0004-controller-owned-password-change-recovery-plan.md` — Option B (full cross-controller recovery) migration plan.
- `tests/__fixtures__/*` and `tests/mocks/*` — lifecycle, status, and persistence fixtures as needed.

### Outside this package

- Client password-change coordinator and unlock/recovery routing.
- KeyringController integration for `verifyPassword`, `submitEncryptionKey`, `changePassword`, and `exportEncryptionKey`.
- Client persistence of the `SeedlessOnboardingController` state slice (debounced, same as other persisted controller state).
- Seedless/TOPRF API support for authoritative status (future: idempotent retries keyed by transaction ID).
- Client UI and end-to-end tests.

## Open decisions before implementation

Resolved in [0003](./0003-seedless-password-change-contracts.md):

- [x] Decide the lifecycle persistence approach. Persisted as ordinary controller state (`persist: true`) via the normal `stateChange` flow; no separate awaitable durability hook. Recovery re-verifies actual state, so a stale/missing marker is recoverable.
- [x] Define what exact remote API confirms password-change and Keyring-key synchronization status. Today: `fetchAuthPubKey` plus cryptographic recover. No transaction-status API. Local Keyring-key proof is `storeKeyringEncryptionKey` durability only.
- [x] Confirm whether `transactionId` is accepted by the current Seedless/TOPRF API, or whether server work must land first. Not accepted, and out of scope for this plan. Recovery uses `fetchAuthPubKey` comparison and cryptographic verification instead.
- [x] Define what the remote service returns for a partial backup/key-share update. Nothing; classify as `UNKNOWN`.
- [x] Decide whether the lifecycle phase is visible to UI state or only to the client coordinator through the messenger. Persisted controller state; coordinator reads `getState` before unlock; `usedInUi: true` for the phase only.

Still open:

- [ ] Define rate-limit behavior for recovery.
- [ ] Define migration behavior for persisted state created before this field existed. Phase 1 treats a missing field as `IDLE`; confirm whether clients need an explicit migration version bump.
