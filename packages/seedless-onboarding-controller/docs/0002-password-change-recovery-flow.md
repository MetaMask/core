# Password-change recovery flow

- Related ADR: [0001](./0001-seedless-password-change-recovery.md)
- Related Option B plan: [0003](./0003-controller-owned-password-change-recovery-plan.md)

This is the operational and technical guide for the Seedless password-change recovery flow: what the controller owns, what the client owns, the public API, the recovery flow, the client integration guide, and the technical invariants.

## Principles

- **Server-first.** The remote Seedless password changes first. Recovery then brings local state forward to the new password. There is no rollback.
- **No retries, no concurrency.** A password change is never re-run as a fresh `changePassword` / `changeEncKey` call while the previous outcome is unresolved. The controller mutex serializes controller operations; the client adds a coordinator lock that also covers the `KeyringController` step.
- **Lifecycle is a signal, not proof.** `passwordChangePhase` only tells the client that recovery _may_ be needed. Recovery always re-verifies actual remote and local state before acting.
- **Lock before error.** Any password-change or recovery failure locks the wallet _before_ an error modal or intermediary screen is shown.
- **`UNKNOWN` is honest.** If remote or local state cannot be established, the wallet stays locked and the phase is preserved. Never infer a result from a rejected Promise.

## The lifecycle phase

Persisted on `SeedlessOnboardingControllerState.passwordChangePhase` (`persist: true`). Missing / `undefined` means no change is in progress. The field holds no secrets.

| Phase                     | Meaning                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `SEEDLESS_CHANGE_PENDING` | A change started; the remote outcome is not yet confirmed.                    |
| `SEEDLESS_COMMITTED`      | The remote Seedless password change is confirmed committed.                   |
| `LOCAL_KEYRING_PENDING`   | The local Seedless vault has been rewritten with the new password.            |
| `KEY_SYNC_PENDING`        | The Keyring encryption key has been stored; awaiting final verification/sync. |
| `UNKNOWN`                 | The result of one or more steps could not be established.                     |

## The sync status

Returned by `resolvePasswordSyncState` and `reconcilePassword` as `PasswordSyncStatus`. The client routes UI from this status.

| Status               | Meaning                                                                     | Client action                                                                                   |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `in-sync`            | Local and remote passwords are synchronized; no recovery action is needed.  | Unlock normally.                                                                                |
| `password-outdated`  | No lifecycle is in flight but the remote password changed (another device). | Prompt for the new password, then `reconcilePassword`.                                          |
| `enter-new-password` | Remote committed (or the local Seedless side still needs the new password). | Prompt for the new password, then `reconcilePassword`.                                          |
| `reconcile-keyring`  | Seedless side reconciled (phase is `LOCAL_KEYRING_PENDING`).                | Cryptographically classify the local Keyring, then run the old/new branch.                      |
| `sync-key`           | Phase is `KEY_SYNC_PENDING`.                                                | Export, store, and sync the current Keyring encryption key, then `clearPasswordChangePhase`.    |
| `unknown`            | Remote or local state could not be established.                             | Keep the wallet locked. Preserve the phase. Offer reset wallet only as an explicit last resort. |

## Controller public API

The controller owns the Seedless-side sequencing. The client owns the Keyring-side steps and UI routing.

For password-change recovery and another-device password sync, clients call `resolvePasswordSyncState` followed by `reconcilePassword`, then use the lifecycle advances and Keyring-key methods described below. The old public `submitGlobalPassword` and `syncLatestGlobalPassword` methods have been removed: their sequencing is now internal to `reconcilePassword`, which also re-wraps `encryptedKeyringEncryptionKey` and advances to `LOCAL_KEYRING_PENDING`.

### Read / resolve (no password)

```ts
SeedlessOnboardingController:resolvePasswordSyncState({
  skipCache?: boolean,
}): Promise<PasswordSyncStatus>
```

Single unlock-time call (call on page render _and_ on password submit). Merges the legacy `checkIsPasswordOutdated` read with password-change recovery routing.

- No phase (`undefined`): authoritative outdated check; `skipCache` honored (cache on render, force-remote on submit). Returns `in-sync` or `password-outdated`.
- `SEEDLESS_CHANGE_PENDING`: forces a remote check (ignores `skipCache`). Clears the phase (`in-sync`) or advances to `SEEDLESS_COMMITTED` (`enter-new-password`).
- Other phases: returns the matching status without a remote call.
- On any failure: returns `unknown` and preserves the phase.

### Apply (with password)

```ts
SeedlessOnboardingController:reconcilePassword({
  globalPassword: string,
}): Promise<PasswordSyncStatus>
```

Reconciles the Seedless side with the supplied password.

- `SEEDLESS_COMMITTED` / `LOCAL_KEYRING_PENDING`: re-runs the internal chain-unlock and local-vault rewrite (idempotent), advances to `LOCAL_KEYRING_PENDING`, returns `reconcile-keyring`.
- No phase (`undefined`): re-checks the remote password and, if outdated, runs the same password-sync flow, advances to `LOCAL_KEYRING_PENDING`, and returns `reconcile-keyring` so the client reconciles the local Keyring after a password change on another device. If not outdated, a no-op that returns `in-sync`.
- `SEEDLESS_CHANGE_PENDING`: returns `unknown` (resolve remote state via `resolvePasswordSyncState` first).
- On any failure: returns `unknown` and preserves the phase.

### Lifecycle advance (client-driven)

```ts
SeedlessOnboardingController:markPasswordChangeKeySyncPending(): Promise<void>
SeedlessOnboardingController:clearPasswordChangePhase(): Promise<void>
```

All idempotent, serialized under the controller lock, with no-op guards.

- `markPasswordChangeKeySyncPending` — advance to `KEY_SYNC_PENDING` after the Keyring encryption key is stored.
- `clearPasswordChangePhase` — clear the phase once Keyring encryption-key synchronization is verified and all required local state is durably persisted (or after a definitive remote non-commit). This is the only way back to no change in progress.

## Recovery flow

```
unlock render / submit
        │
        ▼
 resolvePasswordSyncState({ skipCache })
        │
        ▼
 ┌────────────────────┬───────────────────┬──────────────────┬─────────────────┬───────────┬─────────┐
 │ in-sync            │ password-outdated │ enter-new-password │ reconcile-keyring │ sync-key  │ unknown │
 │ unlock normally    │ prompt new pwd    │ prompt new pwd    │ classify Keyring │ finish sync│ locked   │
 └───────────────────┴───────────────────┴───────────────────┴─────────────────┴───────────┴─────────┘
        │                   │                   │                   │                │
        │                   ▼                   ▼                   ▼                ▼
        │          reconcilePassword       reconcilePassword       old/new branch   clearPasswordChangePhase
        │          ({ globalPassword })   ({ globalPassword })   (see below)      (after sync verified)
        ▼
   normal unlock            │                   │
                            ▼                   ▼
                    Seedless reconciled   Seedless reconciled
                    → reconcile-keyring  → reconcile-keyring
                            │                   │
                            ▼                   ▼
                  classify local Keyring via KeyringController:verifyPassword(newPassword)
```

### Old-Keyring branch (local Keyring still on the old password)

1. `loadKeyringEncryptionKey()` — recover the stored Keyring encryption key with the new Seedless password.
2. `KeyringController:submitEncryptionKey` — unlock the old local Keyring.
3. `KeyringController:changePassword(newPassword)` — re-encrypt the local Keyring.
4. `KeyringController:exportEncryptionKey` — export the current Keyring encryption key.
5. `storeKeyringEncryptionKey()` — store the current key locally (encrypted with the new Seedless password).
6. `markPasswordChangeKeySyncPending()` — advance to `KEY_SYNC_PENDING`.
7. Sync the Keyring encryption key to the remote Seedless backup.
8. `clearPasswordChangePhase()` — finish (only after sync is verified and local state is durably persisted).

### New-Keyring branch (local Keyring already on the new password)

1. `KeyringController:verifyPassword(newPassword)` — unlock/verify the local Keyring with the new password.
2. `KeyringController:exportEncryptionKey` — export the current Keyring encryption key.
3. `storeKeyringEncryptionKey()` — store the current key locally.
4. `markPasswordChangeKeySyncPending()` — advance to `KEY_SYNC_PENDING`.
5. Sync the Keyring encryption key to the remote Seedless backup.
6. `clearPasswordChangePhase()` — finish.

### `KEY_SYNC_PENDING` (resuming after a restart)

1. Unlock with the new password.
2. `KeyringController:exportEncryptionKey` — export the current Keyring encryption key.
3. `storeKeyringEncryptionKey()` — re-store/sync the current key.
4. Sync to the remote Seedless backup and verify.
5. `clearPasswordChangePhase()`.

## Client integration guide

1. **Coordinator lock.** Add a single lock covering the whole Seedless + Keyring transaction. The controller mutex already serializes controller operations; this lock extends serialization across the `KeyringController` step. Reject a second password change while the lifecycle is unfinished.

2. **Persist `SEEDLESS_CHANGE_PENDING` before the first remote mutation.** The controller writes this itself inside `changePassword`; the client must ensure the controller state slice is persisted (debounced, same as other persisted controller state) before any irreversible step.

3. **Unlock routing.** On unlock (page render _and_ password submit), read `passwordChangePhase` from controller state, then call `resolvePasswordSyncState({ skipCache })`. Route UI from the returned status using the table above. Do not classify a password as invalid until recovery has run.

4. **Two-step UX.**
   - Step 1 (password-less): `resolvePasswordSyncState` decides whether the old or new password is needed.
   - Step 2 (password-consuming): only after step 1 returns `enter-new-password` / `password-outdated`, prompt for the new password and call `reconcilePassword({ globalPassword })`.

5. **Keyring classification.** On `reconcile-keyring`, call `KeyringController:verifyPassword(newPassword)` to choose the old-Keyring or new-Keyring branch. Do **not** infer the local Keyring state from the lifecycle phase.

6. **Lock before error.** Any failure from `changePassword`, `resolvePasswordSyncState`, `reconcilePassword`, or any Keyring step must lock the wallet _before_ surfacing an error modal, retry screen, or intermediary UI. If the lock itself fails, keep the wallet in a recovery-blocked UI and never expose wallet access.

7. **Completion boundary.** Call `clearPasswordChangePhase()` only after the synchronized Keyring encryption key and all required local state are durably persisted. This clears the lifecycle so the next unlock is normal.

8. **`UNKNOWN` is terminal for this attempt.** If `resolvePasswordSyncState` or `reconcilePassword` returns `unknown`, keep the wallet locked, preserve the phase, and stop. Do not retry `changePassword` / `changeEncKey`. Offer reset wallet only as an explicit last resort for a confirmed unrecoverable state.

9. **Cache.** `resolvePasswordSyncState` honors `skipCache` for the no-phase outdated check only. Use `skipCache: false` (default) on render and `skipCache: true` on submit. `SEEDLESS_CHANGE_PENDING` always forces a remote check.

### Password out of sync (another device changed the remote password)

No local `changePassword` is in flight (`passwordChangePhase` is unset). The remote Seedless password is newer than this device.

1. Lock the wallet before any error or “wrong password” UI.
2. On unlock render / submit, call `resolvePasswordSyncState({ skipCache })`. Expect `password-outdated` (or `in-sync` if this device is current).
3. Prompt for the **new** global password. Do not ask for the old Keyring password.
4. Call `reconcilePassword({ globalPassword })`. That rewrites the local Seedless vault, re-wraps `encryptedKeyringEncryptionKey`, sets `LOCAL_KEYRING_PENDING`, and returns `reconcile-keyring`.
5. Classify the local Keyring with `KeyringController:verifyPassword(newPassword)` and run the [old-Keyring](#old-keyring-branch-local-keyring-still-on-the-old-password) or [new-Keyring](#new-keyring-branch-local-keyring-already-on-the-new-password) branch.
6. Finish with `clearPasswordChangePhase()` only after key sync and local persistence.

The chain-unlock and vault-rewrite steps are internal; clients do not call separate password-sync primitives.

### Password-change error (this device’s `changePassword` failed)

A local change started and left a phase. Do **not** retry `changePassword` / `changeEncKey`.

1. Lock the wallet **before** showing the error, retry screen, or any intermediary UI.
2. On the next unlock, call `resolvePasswordSyncState({ skipCache })` and route on the status:

   | Status               | What happened                                                                                         | Client action                                                                                                 |
   | -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
   | `in-sync`            | Remote did not commit (`SEEDLESS_CHANGE_PENDING` resolved to old). Phase cleared.                     | Unlock with the **old** password.                                                                             |
   | `enter-new-password` | Remote committed (`SEEDLESS_CHANGE_PENDING` → `SEEDLESS_COMMITTED`, or already `SEEDLESS_COMMITTED`). | Prompt for the **new** password, then `reconcilePassword`.                                                    |
   | `reconcile-keyring`  | Local Seedless vault already rewritten (`LOCAL_KEYRING_PENDING`).                                     | Classify Keyring; run the old/new branch. If Seedless is locked, call `reconcilePassword` first (idempotent). |
   | `sync-key`           | Keyring is on the new password; backup key sync is unfinished.                                        | Unlock with the new password; export / store / remote-sync; `clearPasswordChangePhase`.                       |
   | `unknown`            | Remote or local state could not be established.                                                       | Keep locked. Preserve the phase. Do not retry `changePassword`.                                               |

3. After `reconcilePassword` returns `reconcile-keyring`, run the same Keyring branches as another-device sync. `loadKeyringEncryptionKey` is valid because reconciliation re-wraps the stored key under the new Seedless wrapping key.

## Technical details

### Lifecycle model and persistence

The lifecycle is one optional persisted field:

```ts
passwordChangePhase?: SeedlessPasswordChangePhase;
```

It is persisted as ordinary controller state (`persist: true`) through the normal debounced `stateChange` flow — the same path as every other persisted field. There is **no** separate awaitable durability hook on the controller. The lifecycle is a recovery signal only: it is not proof that a remote or local operation completed, and it is not proof that the lifecycle itself reached durable storage before the next step ran. A crash can leave the durable marker behind the actual cryptographic state, so recovery always re-verifies actual remote and local state before acting on the phase. A missing or stale marker is recoverable: `#checkIsPasswordOutdated({ skipCache: true })` detects a remote change with no marker at all, and cryptographic Keyring verification classifies the local state.

### Lifecycle write points

Controller `this.update(...)` calls happen:

- before the first remote mutation (`SEEDLESS_CHANGE_PENDING`);
- after authoritative remote commitment (`SEEDLESS_COMMITTED`);
- after the local Seedless vault rewrite (`LOCAL_KEYRING_PENDING`);
- the password-change commit writes the vault, `authPubKey`, encrypted
  Keyring key, and lifecycle phase together;
- after an explicit clear (no change in progress).

These publish `SeedlessOnboardingController:stateChange`; they are not awaited durability boundaries.

### Phase preservation on failure

On a failed step the controller **preserves the last known phase**; it does not overwrite it with `UNKNOWN` and does not clear the phase on every error. The last written phase is the recovery signal: e.g. if `#changeEncryptionKey` rejects, the phase stays `SEEDLESS_CHANGE_PENDING` and the client performs an authoritative password-outdated check to choose the recovery branch. If the failure happened before the first lifecycle write, the phase stays unset (nothing to recover). `UNKNOWN` is a recovery-time determination made by the client when an authoritative server check or local cryptographic verification cannot establish the state — not a phase written by `changePassword`'s catch block.

### No retries, no concurrency

A password-change operation must never be retried as a fresh `changePassword` / `changeEncKey` call while the previous outcome is unresolved. Race conditions here are dangerous and could block users from their wallets. The existing controller mutex (`#withControllerLock` / `#controllerOperationMutex`) serializes all mutable controller operations; the client coordinator adds a single lock that also covers the `KeyringController` operation. The lifecycle exists to signal that recovery is needed — not to enable retries. `#assertPasswordInSync` also guards against TOPRF operations while a change is pending (with a `skipPhaseCheck` bypass for `changePassword`'s own token-refresh retry).

### `changePassword` behavior

`changePassword` is now lifecycle-aware: it writes `SEEDLESS_CHANGE_PENDING` before the first remote mutation, `SEEDLESS_COMMITTED` after authoritative remote commitment, and `LOCAL_KEYRING_PENDING` after the local Seedless vault rewrite. It rejects a second concurrent change with `PasswordChangeInProgress`. It reuses the existing `verifyVaultPassword`, `#assertPasswordInSync({ skipCache: true })`, `#changeEncryptionKey` (via `#executeWithTokenRefresh`), and `#commitPasswordChangeState`. The final commit writes the rewritten vault, `authPubKey`, encrypted Keyring key, and lifecycle phase in one state update. A rejected `#changeEncryptionKey` Promise is not proof that the server did not mutate; only a definitive server result may clear the lifecycle.

### `storeKeyringEncryptionKey` behavior

`storeKeyringEncryptionKey` encrypts the current Keyring encryption key under the current Seedless password encryption key and writes `encryptedKeyringEncryptionKey` on controller state. It never clears the lifecycle by itself — completion also requires client confirmation of the local Keyring state, remote synchronization, and durable persistence. `loadKeyringEncryptionKey` is read-only with respect to lifecycle state; loading a key does not complete recovery.

### Recovery mechanism

`reconcilePassword` runs the password-sync flow internally:

- `#submitGlobalPassword` — `toprfClient.recoverPwEncKey` walks the server-side password-key history chain (`maxPwChainLength`) to find the `pwEncKey` matching this device's `authPubKey`, then unlocks the vault.
- `#syncLatestGlobalPasswordInner` — `toprfClient.recoverEncKey` derives encryption material from the candidate password, rewrites the local Seedless vault with the new password's keys, and re-encrypts `encryptedKeyringEncryptionKey` under the new `toprfPwEncryptionKey` so `loadKeyringEncryptionKey` still works.

Both run through `#executeWithTokenRefresh`. `storeKeyringEncryptionKey` of the already-current key is a local overwrite and is safe to re-run.

### Remote-state classification

After a lost, timed-out, or incomplete `changeEncKey` response, recovery classifies remote state via `toprfClient.fetchAuthPubKey` (with `skipCache: true`), comparing the remote `authPubKey` with the last durable local `authPubKey`:

| Observation                                                                                                               | Classification | Lifecycle effect                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| Fetch succeeds and remote `authPubKey` equals the pre-change local `authPubKey`.                                          | **Old**        | Safe to treat as uncommitted. Clear the phase only after this check.     |
| Fetch succeeds and remote `authPubKey` equals the expected post-change key, or the new password recovers remote material. | **New**        | Treat as committed. Advance to `SEEDLESS_COMMITTED` or later recovery.   |
| Fetch fails, comparison is impossible, or local `authPubKey` is missing/stale.                                            | **Unknown**    | Preserve the phase. Keep the wallet locked. Do not retry `changeEncKey`. |

There is no API that reports partial backup or key-share state; such cases are classified as **Unknown**. The TOPRF server does not accept a transaction ID / idempotency key today; that remains a "good to have" for a future release. Until then, ambiguous remote results stay `UNKNOWN`.

## What the controller does not do

- It does not call `KeyringController` (`AllowedActions = never`). Keyring classification, re-encryption, and key export are client responsibilities.
- It does not provide an awaitable durability boundary for lifecycle writes. The lifecycle is persisted as ordinary debounced controller state. Recovery re-verifies actual state, so a stale/missing marker is recoverable.
- It does not retry `changePassword` / `changeEncKey`. Password reconciliation performs the chain unlock and local vault rewrite internally.
- It does not lock the wallet. Locking is a client responsibility (the client owns navigation/intermediary screens).

## Controller-side status

All controller-package work is complete:

- Lifecycle model, helpers, metadata, exports.
- Lifecycle-aware `changePassword` with concurrency guard and phase preservation on error.
- Lifecycle-neutral `storeKeyringEncryptionKey`; password-change lifecycle
  phases are committed by the password-change flow and explicit lifecycle
  methods.
- `resolvePasswordSyncState` + `reconcilePassword` (Option A: controller owns the Seedless side).
- `markPasswordChangeKeySyncPending` / `clearPasswordChangePhase`.
- Messenger action types, package exports, and unit tests (290 tests, 100% statement / 99.22% branch coverage).

Remaining work is **not** in this package:

- **Client integration** — coordinator, unlock routing, locking, UI, and E2E coverage (see the [Client integration guide](#client-integration-guide) above).
- **Open decisions** — rate-limit behavior for recovery; whether clients need an explicit migration version bump for persisted state created before `passwordChangePhase` existed.
- **Option B** — future migration where the controller also owns the `KeyringController` side (see [0003](./0003-controller-owned-password-change-recovery-plan.md)).
