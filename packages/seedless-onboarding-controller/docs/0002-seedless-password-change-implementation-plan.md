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
| 2. Controller lifecycle operations | Not started | Add serialized lifecycle transitions and durable writes        |
| 3. `changePassword` flow           | Not started | Add server-first lifecycle boundaries                          |
| 4. Keyring-key storage             | Not started | Couple encrypted-key storage to lifecycle persistence          |
| 5. Recovery primitives             | Not started | Preserve existing recovery methods and add recovery safeguards |
| 6. Messenger/package contracts     | Not started | Update exports, action types, fixtures, and consumers          |
| 7. Client integration              | Not started | Add coordinator, locking, unlock routing, UI, and E2E coverage |

At the end of each phase, update its status and remove completed items from the remaining-work description. Keep unresolved items in [Open decisions before implementation](#open-decisions-before-implementation).

## Goal

Make Seedless password changes recoverable after a crash, lost response, or partial local update.

The controller should persist enough non-sensitive lifecycle information to tell the client that recovery is required. The client should then verify the actual remote and local state and finish the operation. The implementation must remain server-first. The password change is never retried; recovery reconciles local state using the existing password-sync flow.

## Design summary

Use one persisted lifecycle record:

```ts
type SeedlessPasswordChangeLifecycle = {
  phase: SeedlessPasswordChangePhase;
  lastErrorCode?: string;
};
```

The record must never contain a password, SRP, raw encryption key, decrypted vault data, or an error message that may contain sensitive data.

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

2. Add `SeedlessPasswordChangeLifecycle` to `src/types.ts`.

   - Make the lifecycle state optional so old persisted state without the field is treated as `IDLE`.

3. Add `passwordChangeLifecycle?: SeedlessPasswordChangeLifecycle` to `SeedlessOnboardingControllerState`.

4. Add metadata for `passwordChangeLifecycle` in `seedlessOnboardingMetadata`.

   - Set `persist: true`.
   - Keep state logs and debug snapshots limited to safe fields, or exclude the field if the platform does not need it there.
   - Do not expose raw error objects through state.

5. Export the phase and lifecycle types through `src/index.ts`.

### Lifecycle helpers

Add small, pure helpers rather than spreading phase mutations through the controller:

1. Define a helper for creating a new lifecycle record.
2. Define a helper for applying a phase transition.
3. Define a helper for classifying errors into a non-sensitive error code.
4. Define a helper for treating missing lifecycle state as `IDLE`.
5. Validate legal transitions in tests. Do not make the transition validator the source of truth for recovery; a persisted phase may be stale.

These helpers can live in `src/utils.ts` if they remain general and pure. Keep controller-specific transition behavior in private controller methods.

### Transaction identifier

Out of scope for this plan. The Seedless/TOPRF server does not accept an idempotency key or transaction ID today, and adding one is not a simple server-side change. Recovery here does not retry the password change — it uses the existing password-sync flow (`checkIsPasswordOutdated` + `submitGlobalPassword` + `syncLatestGlobalPassword`) to reconcile local state once remote state is established. A transaction ID remains a “good to have” for a future TOPRF release; until then, ambiguous remote results stay `UNKNOWN`.

### Durable lifecycle persistence

The existing `stateChanged` event remains the notification mechanism, but a normal state update is not a durability acknowledgement.

**Phase 0 decision:** use a narrow awaitable persistence hook on the controller options (`persistPasswordChangeLifecycle`), used only for lifecycle boundaries. Clients implement the hook with a non-debounced durable write. See [0003](./0003-seedless-password-change-contracts.md).

The hook must provide:

- an awaitable write before the first remote mutation;
- an awaitable write after each irreversible boundary;
- an awaitable write for `COMPLETE`;
- a read of the last durable lifecycle before normal unlock error handling;
- surfaced write failures, so the client can lock the wallet and keep recovery active.

Do not claim that `this.update(...)` alone satisfies this contract. Do not use the generic debounced persistence path as the only completion boundary.

## Development phases

### Phase 0: Confirm external prerequisites

Complete these checks before changing controller behavior:

- [x] Confirm how Seedless reports the result of a password-change request after a timeout or lost response.
- [x] Confirm whether the password-change request accepts an idempotency key or transaction ID.
- [x] Confirm whether Keyring encryption-key synchronization is a Seedless/TOPRF API, a client persistence operation, or both.
- [x] Define how the remote service reports old, new, partial, and unknown state.
- [x] Define the durable persistence hook for extension and mobile.
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
- `#markPasswordChangeUnknown`
- `#completePasswordChangeLifecycle`
- `#clearPasswordChangeLifecycle`

Implement them in this order:

- [ ] Create the lifecycle before the first remote mutation with `SEEDLESS_CHANGE_PENDING`.
- [ ] Preserve the lifecycle when any later operation throws.
- [ ] Mark `UNKNOWN` only when the controller cannot safely classify the result; do not reset to `IDLE` on every error.
- [ ] Make clearing the lifecycle an explicit operation after definitive remote failure or durable `COMPLETE`.
- [ ] Keep all transitions serialized under `#withControllerLock`.
- [ ] Route durable lifecycle writes through the persistence contract selected in Phase 0.

Do not add a second mutex unless the existing controller mutex cannot protect the lifecycle update. The client must use its own coordinator lock for the cross-controller transaction.

### Phase 3: Refactor `changePassword` around explicit boundaries

Refactor the current method without duplicating its cryptographic work:

- [ ] Acquire the existing controller lock.
- [ ] Reject a second concurrent password change; recovery must finish before a new one starts.
- [ ] Create/persist the lifecycle as `SEEDLESS_CHANGE_PENDING`.
- [ ] Reuse `verifyVaultPassword(oldPassword, { skipLock: true })`.
- [ ] Reuse `#assertPasswordInSync({ skipCache: true, skipLock: true })`.
- [ ] Reuse `loadKeyringEncryptionKey()` before the remote mutation when an encrypted Keyring key exists.
- [ ] Call `#changeEncryptionKey` through the existing `#executeWithTokenRefresh` wrapper.
- [ ] After authoritative remote commitment, persist `SEEDLESS_COMMITTED`.
- [ ] Reuse `#createNewVaultWithAuthData` to write the new local Seedless vault.
- [ ] Persist `LOCAL_KEYRING_PENDING` after local Seedless state has been updated.
- [ ] Reuse `storeKeyringEncryptionKey` for the encrypted local copy of the current Keyring key.
- [ ] Leave final Keyring re-encryption, local Keyring-key storage, and `COMPLETE` to the client coordinator.
- [ ] Preserve the existing error wrapping with `SeedlessOnboardingError`, but retain the last lifecycle phase when wrapping the error.
- [ ] Reset the password-outdated cache only after the local Seedless password update succeeds, using the existing `#resetPasswordOutdatedCache`.

Important: a rejected Promise from `#changeEncryptionKey` does not prove that the server did not mutate. Only a definitive server result may return the lifecycle to `IDLE`.

### Phase 4: Make Keyring-key storage lifecycle-aware

Update `storeKeyringEncryptionKey` and its private helper with minimal behavior changes:

- [ ] Keep the current `#unlockVaultAndGetVaultData` call to obtain the Seedless password encryption key.
- [ ] Keep the current AES-GCM encryption and base64 encoding.
- [ ] Update `encryptedKeyringEncryptionKey` and the lifecycle boundary in the same controller update where possible, so observers do not see an unrelated intermediate lifecycle state.
- [ ] Await the selected durable persistence boundary after the encrypted key is stored.
- [ ] Allow the client to mark `KEY_SYNC_PENDING` before synchronization and `COMPLETE` only after synchronization verification and all local writes succeed.
- [ ] Never let `storeKeyringEncryptionKey` mark `COMPLETE` by itself.
- [ ] Keep `loadKeyringEncryptionKey` read-only with respect to lifecycle state; loading a key is not proof of recovery completion.

### Phase 5: Add recovery-facing controller behavior

Keep cross-controller orchestration in the client, but make the controller primitives safe and explicit:

- [ ] `submitGlobalPassword({ globalPassword })` remains the entry point to recover the Seedless controller with the new password.
- [ ] `syncLatestGlobalPassword({ globalPassword })` remains the operation that rewrites the local Seedless vault after recovery.
- [ ] `loadKeyringEncryptionKey()` remains the old-Keyring recovery input.
- [ ] `storeKeyringEncryptionKey()` remains the local encrypted-key persistence operation.
- [ ] `checkIsPasswordOutdated({ skipCache: true })` must be used during recovery whenever the client needs a fresh auth-public-key comparison.
- [ ] Do not silently use a cached `passwordOutdatedCache` result on the recovery path.
- [ ] Preserve `#executeWithTokenRefresh` behavior for all existing password-sync operations.
- [ ] Ensure controller lock state is cleaned up correctly when recovery operations fail.

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

### Phase 6: Update messenger and package contracts

- [ ] Update `src/SeedlessOnboardingController-method-action-types.ts` documentation and types for the lifecycle-aware `changePassword` behavior.
- [ ] Export the new lifecycle types and enum from `src/index.ts`.
- [ ] Check all generated/action type references compile without manually editing generated output beyond the source-of-truth file.
- [ ] Update package consumers and mock messengers that call `changePassword`.
- [ ] Preserve the existing `changePassword` signature and behavior for callers that do not opt into lifecycle-aware recovery.

### Phase 7: Implement client integration

This work is outside the controller package but is required for the ADR to be complete:

- [ ] Add a single coordinator lock covering Seedless and Keyring password changes. The controller mutex already serializes controller operations; this lock extends serialization to the cross-controller transaction.
- [ ] Persist `SEEDLESS_CHANGE_PENDING` before the first remote mutation.
- [ ] Lock the wallet before exposing any password-change or recovery error.
- [ ] On unlock, inspect the durable lifecycle before normal invalid-password handling.
- [ ] For every unfinished phase, bypass stale password-outdated cache and query remote state via `checkIsPasswordOutdated({ skipCache: true })`.
- [ ] Use `KeyringController:verifyPassword` to classify old versus new local Keyring state.
- [ ] Use the old-Keyring or new-Keyring branch above (existing `submitGlobalPassword` + `syncLatestGlobalPassword` flow).
- [ ] Never retry `changePassword` or `changeEncKey`; reconcile only via the existing password-sync flow.
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

- `src/constants.ts` — lifecycle phase enum.
- `src/types.ts` — lifecycle record and state field.
- `src/utils.ts` — pure lifecycle helpers, if needed.
- `src/SeedlessOnboardingController.ts` — metadata, transition helpers, lifecycle-aware `changePassword`, and lifecycle-aware key storage.
- `src/SeedlessOnboardingController-method-action-types.ts` — public action documentation/signature.
- `src/index.ts` — public exports.
- `src/SeedlessOnboardingController.test.ts` — unit and fault-injection coverage.
- `docs/0003-seedless-password-change-contracts.md` — Phase 0 shared contract.
- `tests/__fixtures__/*` and `tests/mocks/*` — lifecycle, status, and persistence fixtures as needed.

### Outside this package

- Client password-change coordinator and unlock/recovery routing.
- KeyringController integration for `verifyPassword`, `submitEncryptionKey`, `changePassword`, and `exportEncryptionKey`.
- Durable storage adapter or persistence hook implementation.
- Seedless/TOPRF API support for authoritative status (future: idempotent retries keyed by transaction ID).
- Client UI and end-to-end tests.

## Open decisions before implementation

Resolved in [0003](./0003-seedless-password-change-contracts.md):

- [x] Decide which layer owns the awaitable durable persistence hook. Controller option `persistPasswordChangeLifecycle`; clients supply the durable write.
- [x] Define what exact remote API confirms password-change and Keyring-key synchronization status. Today: `fetchAuthPubKey` plus cryptographic recover. No transaction-status API. Local Keyring-key proof is `storeKeyringEncryptionKey` durability only.
- [x] Confirm whether `transactionId` is accepted by the current Seedless/TOPRF API, or whether server work must land first. Not accepted, and out of scope for this plan. Recovery uses `fetchAuthPubKey` comparison and cryptographic verification instead.
- [x] Define what the remote service returns for a partial backup/key-share update. Nothing; classify as `UNKNOWN`.
- [x] Decide whether the lifecycle record is visible to UI state or only to the client coordinator through the messenger. Persisted controller state; coordinator reads `getState` before unlock; `usedInUi: true` for safe fields only.

Still open:

- [ ] Define rate-limit behavior for recovery.
- [ ] Define migration behavior for persisted state created before this field existed. Phase 1 treats a missing field as `IDLE`; confirm whether clients need an explicit migration version bump.
