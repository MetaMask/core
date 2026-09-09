# ADR 0001: Recovering server-first Seedless password changes

- Status: Proposed
- Date: 2026-09-07
- Scope: MetaMask extension password changes backed by Seedless

## Context

Changing a Seedless password updates multiple independently persisted states:

1. The remote Seedless/TOPRF password, backup data, and key shares.
2. The local Seedless controller state.
3. The local KeyringController vault password.
4. The Keyring encryption key stored in Seedless.
5. The password-change lifecycle state.

These changes cannot be committed atomically. A process, browser, app, device, network request, or persistence operation can fail between any two steps.

The proposed ordering commits the remote Seedless change first. After remote commitment, recovery must support both possible local states:

- The local Keyring is still protected by the old password. Recovery uses the new Seedless password to recover the stored Keyring encryption key, calls `submitEncryptionKey`, and re-encrypts the local Keyring with the new password.
- The local Keyring is already protected by the new password, but key synchronization failed. Recovery unlocks with the new password, exports the current Keyring encryption key, and synchronizes it to Seedless.

The lifecycle state helps select the recovery checks, but it cannot establish the actual state. The process may terminate before the lifecycle update is persisted. Cryptographic verification and authoritative server-state checks must therefore determine the recovery branch.

## Decision

Use a durable, idempotent lifecycle state machine around the server-first operation.

- Lock the wallet whenever the operation cannot establish a consistent state.
- On the next unlock, inspect the lifecycle state before normal unlock error handling.
- Require an authoritative Seedless server-state check for every unfinished state.
- Use cryptographic verification to determine whether the local Keyring is old or new.
- Re-run already-completed operations safely instead of attempting an in-process rollback.
- Lock the wallet from the client whenever any password-change or recovery step fails, before exposing an error or intermediary screen.
- Clear the lifecycle only after the current Keyring encryption key is synchronized to Seedless and all required local state is durably persisted. (There is no separate `COMPLETE` state: "no change in progress" and "done" are both represented by an unset/`undefined` phase.)
- Keep any state that cannot be distinguished safely as `unknown`.

The lifecycle names below are descriptive. They can be mapped to the final implementation enum without changing the recovery semantics. The implementation uses `undefined` for the "no change in progress / done" state rather than a dedicated `IDLE`/`COMPLETE` enum member.

## Implementation scope

The implementation is split between shared controller capabilities and client-specific orchestration/UI. The KeyringController and SeedlessOnboardingController should provide safe primitives; neither controller alone can own the complete transaction because the operation spans both controllers and multiple persistence systems.

### Controller and shared-contract scope

#### SeedlessOnboardingController

The controller already provides most of the required recovery primitives:

- `changePassword` performs the Seedless password/vault change and handles the controller-level token-refresh path.
- `loadKeyringEncryptionKey` can recover the stored Keyring encryption key after the new Seedless password is submitted.
- `storeKeyringEncryptionKey` encrypts and stores the current Keyring encryption key in controller state.
- `reconcilePassword` provides the password-sync operation needed to rehydrate and update local Seedless state after either an interrupted local password change or an another-device password change.
- `checkIsPasswordOutdated({ skipCache: true })` provides a cache-bypassed password-state check.
- Controller locking already serializes controller-level operations.

The new controller work is:

- Add a persisted password-change lifecycle state/phase to `SeedlessOnboardingControllerState`, with persistence metadata. The lifecycle must not store passwords, SRPs, raw Keyring encryption keys, or decrypted backup material.
- Modify `changePassword` to update the lifecycle after each relevant operation: before the remote change, after remote commitment, after the local Seedless vault/state update, and when the operation fails or becomes ambiguous.
- Modify `storeKeyringEncryptionKey` to update the lifecycle after the encrypted Keyring encryption key has been stored in controller state. The encrypted-key update and lifecycle update should be adjacent so observers do not see an inconsistent intermediate controller state.
- Do not let `storeKeyringEncryptionKey` clear the lifecycle by itself. Completion also requires client confirmation of the local Keyring state, remote synchronization, and durable persistence.
- Ensure a thrown error after a partial mutation does not reset the lifecycle to the pre-operation state. The last known phase must remain available for recovery.
- Facilitate the existing password-sync operations for both post-remote-commit recovery branches:
  - Old local Keyring: submit the new Seedless password, load the stored Keyring encryption key, and allow the client to call `submitEncryptionKey` before re-encrypting locally.
  - New local Keyring: submit the new password, verify/unlock the local Keyring, export its current Keyring encryption key, and store/synchronize it.
- Preserve the existing token-refresh and controller-lock behavior while making lifecycle transitions observable to clients.

The controller must not infer completion from a successful in-memory update or from a rejected Promise. The client remains responsible for coordinating the KeyringController and for the final durable clear of the lifecycle.

#### KeyringController

No new KeyringController recovery API is required by this ADR. The client reuses the existing primitives:

- `verifyPassword` cryptographically checks whether the local Keyring uses the old or new password.
- `submitEncryptionKey` unlocks an old local Keyring after its encryption key is recovered from Seedless.
- `changePassword` re-encrypts the local Keyring with the new password.
- `exportEncryptionKey` provides the current key for synchronization when the local Keyring is already new.

The KeyringController remains responsible only for local vault operations. Remote Seedless status, cross-controller orchestration, and final lifecycle completion remain outside it.

Wallet locking for password-change errors is also a client responsibility. The controllers should return the operation result/error and expose the locking primitives, while the client decides when to lock and which recovery/intermediary screen to present.

#### Password-change coordinator and lifecycle persistence

- The lifecycle state is persisted by `SeedlessOnboardingController`, while the client orchestration layer coordinates KeyringController operations against those phases.
- Persist only non-sensitive transaction data, such as lifecycle phase, transaction identifier, timestamps, retry metadata, and non-sensitive error classification.
- Write `SEEDLESS_CHANGE_PENDING` before the first remote mutation.
- Write `SEEDLESS_COMMITTED` only after remote commitment is confirmed by the server or an authoritative status check.
- Advance the lifecycle after each `changePassword` and `storeKeyringEncryptionKey` operation so a later unlock can identify the last known boundary, while treating the phase as advisory when persistence may have been interrupted.
- Use an awaitable durable persistence operation for lifecycle transitions and the final clear. The generic debounced state-change path must not be the only durability boundary.
- Serialize password-change and recovery operations. A second request must be rejected or queued until the first transaction is cleared (no change in progress) or reaches an explicitly recoverable terminal state.
- Make recovery verify the actual cryptographic state before mutating either controller.
- Keep the recovery transaction active until Keyring encryption-key synchronization and local persistence are confirmed. Do not clear the lifecycle marker early.

#### External server/API dependency

The controller changes reuse the existing Seedless/TOPRF operations. The following server/API behavior must be confirmed or added outside the controller lifecycle-state changes:

- Idempotent password-change and Keyring-key synchronization requests.
- A transaction identifier that can be queried after an ambiguous response.
- An authoritative distinction between old, new, and partial remote state.
- Verification that the current Keyring encryption key is the one stored by the completed backup.

If these capabilities are unavailable, the client must preserve `unknown` rather than infer that an error means “nothing changed.”

### Client scope

The extension and mobile client must implement the same recovery contract. The platform-specific location of each responsibility may differ, but the ordering, state transitions, cryptographic checks, and completion criteria must not.

#### Client orchestration

Each client must provide an orchestration layer that:

- Replaces the local-first/rollback flow with the server-first lifecycle flow.
- Persists the lifecycle phase before and after each irreversible boundary.
- Uses one transaction identifier for the password change and all retries.
- Locks the wallet if any password-change or recovery step returns an error, including remote Seedless operations, local controller operations, key synchronization, verification, and persistence.
- Performs the lock before surfacing the error, navigating to an intermediary screen, or returning control to a normal wallet screen.
- Keeps the wallet locked when recovery cannot establish a consistent state. If the lock operation itself fails, the client must keep the wallet in a recovery-blocked UI and must not expose wallet access.
- Prevents a second password-change transaction from running concurrently.

After remote commitment, the orchestrator must cryptographically classify the local Keyring:

- **Old Keyring:** recover the stored Keyring encryption key with the new Seedless password, call `submitEncryptionKey`, re-encrypt locally, export the current key, and synchronize it.
- **New Keyring:** verify/unlock with the new password, export the current key, and synchronize it.

The orchestrator must not infer the local state from the lifecycle marker, a rejected Promise, or a cached password-outdated result.

#### Client unlock and recovery

Each client must route an unfinished lifecycle through recovery before normal unlock failure handling:

- Read the last durably persisted lifecycle state before classifying a password as invalid.
- Perform an authoritative Seedless server-state check for every unfinished state.
- Bypass or invalidate cached password-outdated results during recovery.
- Verify cryptographically whether the supplied new password unlocks the local Keyring.
- Select the old-Keyring or new-Keyring recovery branch based on verification.
- Retry already-completed operations safely after process termination or a lost response.
- Leave the state as `unknown` when the server result or local cryptographic state cannot be established.

#### Client persistence

Each client must provide a durable persistence boundary for lifecycle state:

- Lifecycle transitions must have an explicit, awaitable durable-write path.
- The client must be able to read the last lifecycle state before normal unlock routing begins.
- The lifecycle must be cleared only after the synchronized Keyring encryption key and all required local controller state are durably persisted.
- A generic debounce may remain acceptable for unrelated state, but it cannot prove that password-change state is durable.
- Lifecycle state must contain only non-sensitive metadata and must never contain passwords, SRPs, raw Keyring encryption keys, or decrypted backup material.

#### Client UI and user behavior

Each client must provide UI behavior for `SEEDLESS_CHANGE_PENDING`, `SEEDLESS_COMMITTED`, `LOCAL_KEYRING_PENDING`, `KEY_SYNC_PENDING`, and `UNKNOWN` (no dedicated UI state is needed for "no change in progress" — that is the normal wallet UI):

- Show a recovery-blocked state for every unfinished lifecycle state.
- Treat any password-change error as a locked-wallet state before showing an error modal, retry screen, or other intermediary UI.
- Ask for the new password after remote commitment is established.
- Do not ask for the old Keyring password when Seedless can provide the Keyring encryption key through `submitEncryptionKey`.
- Explain whether the remote change is unresolved, local Keyring recovery is in progress, or Keyring-key synchronization is pending.
- Preserve retryable recovery actions across app/browser restarts and backgrounding.
- Prevent a second password change while recovery is pending.
- Do not display raw server/controller errors or sensitive recovery data.
- Do not expose the wallet as fully recovered until key synchronization is verified and the lifecycle is cleared.
- Keep reset wallet as an explicit last resort. It must not be triggered automatically for a recoverable partial state or used to hide an unresolved remote result.

The client owns this lock/error boundary because it controls navigation and intermediary screens. This allows UX changes without changing the controller’s cryptographic responsibilities, while ensuring that no client-specific screen accidentally leaves a partially changed wallet unlocked.

#### Client tests

Each client must add unit, integration, and end-to-end coverage for:

- Every lifecycle transition and durable-write boundary.
- Termination before and after remote commitment.
- Remote commitment with an old local Keyring.
- Remote commitment with an already-new local Keyring and failed key synchronization.
- Lost responses and idempotent retries.
- Stale/missing lifecycle state and stale password-outdated cache.
- Recovery UI, retry behavior, wallet locking, and explicit reset-wallet fallback.

Each platform may map these tests to its own orchestration, persistence, authentication, navigation, and UI modules. The fault-injection scenarios and expected final states must remain equivalent.

### Cross-client contract

All clients must agree on:

- Lifecycle state names and meanings.
- Which states require a server check before unlock.
- The two cryptographic recovery branches.
- Idempotency and transaction-identifier semantics.
- The definition of durable synchronization and the completion (clear) boundary.
- The meaning of `unknown` and the conditions under which reset wallet may be offered.
- The requirement that any password-change or recovery error locks the wallet before an error or intermediary screen is shown.

Platform-specific UI can differ, but it must not change the recovery decision or silently treat an ambiguous state as a failed or completed password change.

## Lifecycle state matrix

This table defines what the user and UI should experience when the lifecycle state is encountered during unlock. The current server and local states are defined separately below so that recovery behavior is not confused with state observation.

| Lifecycle state           | Sync Server state check required before unlock?                                                                                         | User behaviors                                                                                                                                                                                                                                         | UI requirements                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _No phase (`undefined`)_  | No. A server check may run as part of normal Seedless behavior, but it is not a recovery prerequisite.                                  | Enter the current wallet password and continue normally. The user may start a new password change.                                                                                                                                                     | Show the normal locked or unlocked wallet UI.                                                                                                                                                        |
| `SEEDLESS_CHANGE_PENDING` | Yes. The remote request may not have started, may have failed before mutation, or may have committed with a lost response.              | Do not assume which password is valid. If the server proves that the change did not commit, enter the old password. If it proves commitment, enter the new password. If the result remains ambiguous, `unknown`. Do not start another password change. | Show a password-change recovery screen. Do not report an entered password as an ordinary unlock failure while recovery is pending. Explain that the previous password change must be resolved first. |
| `SEEDLESS_COMMITTED`      | Yes. Confirm the remote Seedless password and required backup/key-share changes.                                                        | Enter the new Seedless password. The user should not need the old Keyring password when the stored Keyring encryption key is recoverable from Seedless.                                                                                                | Keep wallet access behind a recovery screen. Explain that the remote change succeeded but local recovery still needs to finish.                                                                      |
| `LOCAL_KEYRING_PENDING`   | Yes. Confirm the remote new-password state before recovering the Keyring encryption key or synchronizing a local key.                   | Enter the new password. Allow recovery to determine cryptographically whether the local Keyring is old or new; do not ask the user to guess which state occurred.                                                                                      | Keep wallet access blocked until the local Keyring is reconciled and its current encryption key is synchronized. Show progress and retryable errors without clearing the recovery state.             |
| `KEY_SYNC_PENDING`        | Yes. The remote password is expected to be new, but the remote copy of the Keyring encryption key may be old, new, missing, or unknown. | Enter the new password, unlock the local Keyring, and allow the current Keyring encryption key to be exported and synchronized. Do not start another password change.                                                                                  | Show that the wallet password has changed but backup synchronization is incomplete. Do not expose the wallet as fully recovered until synchronization is verified.                                   |
| `UNKNOWN`                 | Yes, whenever a server status check or cryptographic verification may resolve the state. If it cannot, remain `unknown`.                | unknown                                                                                                                                                                                                                                                | Keep the wallet locked and show a recovery-blocked state. Do not silently retry a non-idempotent operation or claim that either password is authoritative.                                           |

## Server and local state matrix

| Lifecycle state           | Server State                                                                                                                                  | Local State                                                                                                                                                               | Recovered server state                                                                                                                                          | Recovered local state                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _No phase (`undefined`)_  | Stable and synchronized. The password is the current password; no change is pending.                                                          | Local Keyring, local Seedless state, and the persisted Keyring encryption key are stable and synchronized.                                                                | No change. The server remains in its current stable state.                                                                                                      | No change. The local state remains in its current stable state.                                                                                                                                                                                                                                                                         |
| `SEEDLESS_CHANGE_PENDING` | `unknown` until authoritative server status resolves whether the remote password change and backup updates are old, new, or partial.          | Normally old/old, but local state may already have changed if lifecycle persistence was delayed or lost. Verify the local Keyring and local Seedless state independently. | Definitively old: clear the phase after durable cleanup. Definitively new: transition to `SEEDLESS_COMMITTED` or `LOCAL_KEYRING_PENDING`. Ambiguous: `unknown`. | Do not mutate until the server result is resolved. After remote commitment, cryptographically classify the local Keyring as old or new and follow the matching branch.                                                                                                                                                                  |
| `SEEDLESS_COMMITTED`      | New Seedless password and new remote backup/key-share state, confirmed through server verification. If this cannot be established, `unknown`. | Local Keyring may be old or new. Local Seedless state and the stored Keyring encryption key may be old, new, or not durably persisted.                                    | Remains new and committed.                                                                                                                                      | Transition to `LOCAL_KEYRING_PENDING`; cryptographically determine whether to recover the old local Keyring or synchronize the already-new local Keyring.                                                                                                                                                                               |
| `LOCAL_KEYRING_PENDING`   | Remote Seedless is new and committed.                                                                                                         | Local Keyring state is unresolved: old with a recoverable stored encryption key, new with a locally exportable current key, or `unknown`.                                 | Remains new and committed.                                                                                                                                      | **Old Keyring:** recover the stored key with the new Seedless password, call `submitEncryptionKey`, re-encrypt locally, export the current key, and synchronize it. **New Keyring:** unlock with the new password, export the current key, and synchronize it. In both cases, verify and durably persist before clearing the lifecycle. |
| `KEY_SYNC_PENDING`        | New Seedless password and remote backup/key-share state. The synchronized Keyring encryption key is not confirmed.                            | Local Keyring uses the new password. The Seedless copy of its Keyring encryption key is stale, missing, or not durably confirmed.                                         | New password with the current Keyring encryption key synchronized and verified.                                                                                 | Local Keyring, local Seedless state, synchronized key, and lifecycle marker are durably persisted. Only then clear the lifecycle.                                                                                                                                                                                                       |
| `UNKNOWN`                 | `unknown`. The server may have accepted some, all, or none of the remote password-change or key-synchronization operations.                   | `unknown`. Local Keyring, local Seedless state, or durable lifecycle state may reflect different points in the operation.                                                 | unknown                                                                                                                                                         | unknown                                                                                                                                                                                                                                                                                                                                 |

## Failure and recovery rules

### Definitive remote failure before mutation

**Trigger**

Seedless returns a definitive error and server status confirms that the remote password change did not commit.

**Wallet state**

Remote Seedless, local Seedless, and local Keyring remain old and synchronized.

**Recovery plan**

Lock the wallet if required, ask the user to unlock with the old password, and durably clear the pending lifecycle state. A later retry starts from no phase set.

### Remote error after a possible mutation

**Trigger**

Timeout, connection reset, lost response, client crash, or server error while remote Seedless operations were in flight.

**Wallet state**

unknown

**Recovery plan**

unknown

The implementation must not classify this as “server failed” solely from the rejected Promise.

### Local Keyring failure after remote commitment

**Trigger**

`KeyringController:changePassword` throws, or the process terminates while local Keyring persistence is pending.

**Wallet state**

Remote Seedless is new. The local Keyring may be old, new in memory, new and durably persisted, or unknown.

**Recovery plan**

Cryptographically verify the local Keyring:

- Old local Keyring: recover the stored Keyring encryption key with the new Seedless password, call `submitEncryptionKey`, re-encrypt locally, then synchronize the current key.
- New local Keyring: export the current Keyring encryption key and synchronize it to Seedless.
- Indeterminate result: unknown.

### Key synchronization failure or lost response

**Trigger**

The local Keyring is new, but the synchronization request fails or returns an ambiguous result.

**Wallet state**

Remote Seedless is new. The remote synchronized Keyring encryption key is old, new, missing, or unknown.

**Recovery plan**

Keep `KEY_SYNC_PENDING`. Unlock with the new password, export the current Keyring encryption key, retry using the same transaction identity, and verify the remote result. Do not clear the lifecycle until synchronization and local persistence are durable. If the remote result cannot be verified, unknown.

### Lifecycle persistence failure

**Trigger**

The logical state transition succeeds, but the state-change notification is queued, debounced, lost, or fails before reaching durable storage.

**Wallet state**

The durable lifecycle marker may lag behind the actual cryptographic state. A marker such as `SEEDLESS_CHANGE_PENDING` does not prove that remote or local later steps did not happen.

**Recovery plan**

Use the marker only to trigger broader verification. Check remote state and cryptographically verify the local Keyring. Repeat the appropriate recovery branch idempotently. Do not treat an in-memory update or queued persistence operation as durable.

### Process, browser, app, or device termination

**Trigger**

Termination occurs before or after any remote request, local controller update, synchronization request, or lifecycle write.

**Wallet state**

The state is determined by the last durable evidence, but may differ from the last in-memory state.

**Recovery plan**

At next startup/unlock, inspect the lifecycle marker and then verify actual state. Use the old-Keyring recovery branch if the new password does not unlock the local Keyring; use the new-Keyring synchronization branch if it does. If remote commitment cannot be established, unknown.

## Idempotency requirements

The recovery operations must be safe across retries and lost responses.

- Assign one transaction identifier to the entire password change and reuse it during recovery.
- Make the remote password change and key synchronization idempotent or queryable by transaction identifier.
- Verify the local Keyring before changing its password again.
- Treat storing the already-current Keyring encryption key as a deterministic no-op or safe overwrite.
- Do not perform a compensating rollback based solely on an error response.
- Serialize password-change and recovery requests so two transactions cannot update the same vault concurrently.
- Persist lifecycle transitions with an awaitable durability boundary.

## Consequences

### Positive

- A committed remote Seedless change has a deterministic recovery direction: bring the local Keyring forward to the new password.
- The old-Keyring and new-Keyring post-commit states are both recoverable through the new password when the stored Keyring encryption key is available.
- In-process rollback is not required for normal partial-failure handling.
- Recovery remains possible even if the lifecycle update was lost, because cryptographic verification is authoritative for the local Keyring state.

### Negative and residual risks

- This is still a distributed transaction. Server-first ordering does not make the operation atomic.
- Ambiguous remote outcomes remain `unknown` unless the server supports authoritative status lookup and idempotency.
- Recovery adds a special unlock path and additional user-facing states.
- The remote server must support safe retries; otherwise a lost response can still create an unrecoverable ambiguity.
- If the stored Keyring encryption key cannot be recovered, the old-Keyring branch cannot proceed and the state remains `unknown`.
- Locking the wallet protects the vault but does not itself restore consistency; the recovery path must be available before normal unlock failure handling.
- Mobile and extension must implement compatible lifecycle and recovery semantics to avoid platform-dependent outcomes.

## Acceptance criteria

Fault-injection tests must terminate or fail the operation at every boundary:

- Before the remote request.
- During every remote Seedless round trip.
- After remote commitment but before the response.
- Before and after local Seedless persistence.
- Before, during, and after local Keyring password change.
- Before, during, and after Keyring encryption-key synchronization.
- Before and after each lifecycle persistence write.
- Immediately before clearing the lifecycle.

After restart, each test must verify that:

- The correct password is requested for the recovered state.
- The local Keyring can be unlocked with the new password after recovery.
- Seedless recovers the current Keyring encryption key.
- Retrying recovery produces the same final state.
- A lost response does not cause a second non-idempotent password change.
- The lifecycle is never cleared before key synchronization and local persistence.
- An unresolved server result remains `unknown`.

## Open questions

The following are intentionally left as `unknown` until addressed separately:

- How TOPRF/Seedless exposes authoritative status after an ambiguous request.
- Whether password changes and key synchronization support idempotency keys.
- Recovery when the remote result is `unknown`.
- Recovery when the stored Keyring encryption key is unavailable or corrupt.
- The exact durable-persistence guarantee available on each platform.
- The final lifecycle enum names and migration strategy.
- Retry limits, rate-limit behavior, and user-facing copy for recovery-blocked states.
