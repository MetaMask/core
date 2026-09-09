# Phase 0 contract: Seedless password-change recovery

- Related ADR: [ADR 0001](./0001-seedless-password-change-recovery.md)
- Related plan: [Implementation plan 0002](./0002-seedless-password-change-implementation-plan.md)
- Status: Accepted for controller implementation, with documented `UNKNOWN` gaps
- Date: 2026-09-08
- Scope: contracts shared by `SeedlessOnboardingController`, clients (extension and mobile), and the Seedless/TOPRF API layer

This document is the Phase 0 deliverable. Later phases must follow these contracts. They must not treat `this.update(...)` or a rejected remote Promise as proof of remote or durable state.

## Confirmed current APIs (`@metamask/toprf-secure-backup@1.1.0`)

These are the APIs this package already calls. None of them accept a transaction identifier or idempotency key.

| Operation | Current API | What a success proves | What a rejection proves |
| --- | --- | --- | --- |
| Remote password / key-share change | `toprfClient.changeEncKey` | The SDK reported that key shares and re-encrypted secret metadata were updated. | Nothing about whether nodes or metadata already mutated. Timeout, disconnect, and many server errors are ambiguous. |
| Current remote auth public key | `toprfClient.fetchAuthPubKey` | Returns `{ authPubKey, keyIndex }` for the current remote authentication public key. | Fetch failure. It is not a transaction-status API. |
| Local password vs remote | `checkIsPasswordOutdated({ skipCache: true })` | Local `authPubKey` equals or differs from the fetched remote `authPubKey`. | Fetch failure. Cached results must not be used on recovery. |
| Recover with a candidate password | `recoverEncKey` / `submitGlobalPassword` | The candidate password can derive the current remote encryption material. | The candidate is wrong, rate-limited, or the request failed. A failure is not proof that a concurrent change did not commit. |
| OPRF key-share persist | `toprfClient.persistLocalKey` | Used for first-time key setup and related persist paths, not as a password-change status query. | Ambiguous unless the error is a known pre-mutation client error. |
| Local Keyring encryption-key copy | `storeKeyringEncryptionKey` / `loadKeyringEncryptionKey` | Controller state holds an AES-GCM copy of the Keyring encryption key, encrypted under the current Seedless password encryption key. | Local encrypt/state-update failure only. This is not a remote write. |

`changeEncKey` parameters today: `nodeAuthTokens`, `authConnectionId`, `groupedAuthConnectionId`, `userId`, `oldEncKey`, `oldPwEncKey`, `oldAuthKeyPair`, `newKeyShareIndex`, `newPassword` or `pregeneratedOprfKey`, and optional `transformDataItems`. There is no `transactionId`, `idempotencyKey`, or status-query field.

`EncAccountDataType` today is `PrimarySrp`, `ImportedSrp`, and `ImportedPrivateKey`. There is no typed remote item for a Keyring encryption key.

## Remote result after timeout or lost response

**Contract:** a lost, timed-out, or otherwise incomplete `changeEncKey` response is **not** a definitive remote failure.

Recovery must then:

1. Call `fetchAuthPubKey` with no password-outdated cache (`skipCache: true`).
2. Compare the remote `authPubKey` with the last durable local `authPubKey`.
3. Optionally confirm a candidate password with `recoverEncKey` / `submitGlobalPassword` when the user supplies one.

Classification after that check:

| Observation | Remote classification | Lifecycle effect |
| --- | --- | --- |
| Fetch succeeds and remote `authPubKey` equals the pre-change local `authPubKey`. | **Old** | Safe to treat as uncommitted. Clear the lifecycle to `IDLE` only after this check. |
| Fetch succeeds and remote `authPubKey` equals the expected post-change public key, or the new password recovers remote material. | **New** | Treat as committed. Advance to `SEEDLESS_COMMITTED` or later recovery. |
| Fetch fails, comparison is impossible, or local `authPubKey` is missing/stale so old vs new cannot be distinguished. | **Unknown** | Persist `UNKNOWN`. Keep the wallet locked. Do not retry `changeEncKey` as if it were a fresh change. |
| Metadata/key shares may have updated without a matching auth-public-key change, or only some nodes/items updated. | **Partial / unknown** | There is **no** API that reports partial backup or key-share state. Classify as **Unknown**. |

Do not infer “nothing changed” from `FailedToChangePassword` or from a rejected `#changeEncryptionKey` Promise.

Until TOPRF exposes an authoritative transaction-status API, the `SEEDLESS_CHANGE_PENDING` lost-response path remains `UNKNOWN` whenever step 1 fails or step 2 cannot distinguish old from new.

## No retries, no concurrency

**Contract:** a password-change operation must never be retried as a fresh `changePassword` / `changeEncKey` call. Race conditions here are dangerous and could block users from their wallets.

The existing controller mutex (`#withControllerLock` / `#controllerOperationMutex`) already serializes all mutable controller operations. The client coordinator adds a single lock that also covers the KeyringController operation. The lifecycle is a **recovery signal**, not a retry-enabler.

Recovery rules:

- Do **not** call `changeEncKey` again while remote classification is unknown.
- After remote classification is **old** (server did not commit), clear the lifecycle to `IDLE`. A later password change is a fresh operation, not a retry.
- After remote classification is **new** (server committed), do not call `changeEncKey` again. Reconcile the Seedless side through the controller-owned recovery methods, which wrap the existing password-sync flow: `resolvePasswordSyncState()` (password-less remote-state resolution; also merges the legacy `checkIsPasswordOutdated` read) → `recoverPasswordChange({ globalPassword })` (runs `submitGlobalPassword` → `syncLatestGlobalPassword` internally and advances to `LOCAL_KEYRING_PENDING`). The client then owns the Keyring-side steps (`loadKeyringEncryptionKey` / `storeKeyringEncryptionKey`, `markPasswordChangeKeySyncPending`, `completePasswordChange`).
- `storeKeyringEncryptionKey` of the already-current key is a local overwrite and is safe to re-run.

The controller-owned recovery methods return a `PasswordChangeRecoveryStatus` (`NoChange`, `EnterNewPassword`, `ReconcileKeyring`, `SyncKey`, `Complete`, `Unknown`) that the client routes on. This is Option A (controller owns the Seedless side; client owns the Keyring side). See [0004](./0004-controller-owned-password-change-recovery-plan.md) for the planned Option B migration where the controller also owns the Keyring side.

A transaction ID / idempotency key is out of scope — the TOPRF server does not accept one today, and adding it is not a simple server-side change. It remains a “good to have” for a future TOPRF release.

## Keyring encryption-key storage and recovery

The Keyring encryption key is stored **locally** in controller state (`encryptedKeyringEncryptionKey`), encrypted under the current Seedless password encryption key. There is no separate remote TOPRF API for it, and none is needed for this plan.

- `storeKeyringEncryptionKey` encrypts the current Keyring encryption key under the current Seedless password encryption key and writes `encryptedKeyringEncryptionKey` on controller state.
- `loadKeyringEncryptionKey` is read-only with respect to lifecycle. Loading a key does not complete recovery.
- `storeKeyringEncryptionKey` must never mark `COMPLETE`.

Recovery reuses the existing password-sync flow, which already handles “remote changed, local is outdated”. The controller now owns the Seedless-side sequencing through two public methods:

1. `resolvePasswordSyncState()` — password-less. Merges the legacy `checkIsPasswordOutdated` read (now private `#checkIsPasswordOutdated`) with password-change recovery routing, so the client makes a single call at unlock. For `IDLE` it runs the authoritative outdated check (`skipCache` honored) and returns `no-change` or `password-outdated`. For `SEEDLESS_CHANGE_PENDING` it forces a remote check (ignoring `skipCache`), clears to `IDLE` if remote is **old**, advances to `SEEDLESS_COMMITTED` if remote is **new**, and returns `unknown` (preserving the phase) if the check fails. For all other phases it returns the matching status without a remote call.
2. `recoverPasswordChange({ globalPassword })` — password-consuming. For `SEEDLESS_COMMITTED` / `LOCAL_KEYRING_PENDING` it runs `submitGlobalPassword({ globalPassword })` (`toprfClient.recoverPwEncKey` walks the server-side password-key history chain `maxPwChainLength` to find the `pwEncKey` matching this device’s `authPubKey`, then unlocks the vault) → `syncLatestGlobalPassword` (rewrites the local Seedless vault with the new password’s keys), then advances to `LOCAL_KEYRING_PENDING` and returns `reconcile-keyring`. For `IDLE` it re-checks the remote password and, if outdated, runs the same password-sync flow without advancing any phase (another-device sync); if not outdated it is a no-op. On failure it returns `unknown` and preserves the phase.

The client then owns the Keyring side based on the returned status:

3. `loadKeyringEncryptionKey()` (old-Keyring branch) or `storeKeyringEncryptionKey(currentKey)` (new-Keyring branch) — recover or persist the Keyring encryption key locally.
4. `markPasswordChangeKeySyncPending()` → `completePasswordChange()` → `clearPasswordChangePhase()` once the current key is synchronized and persisted.

`COMPLETE` in this contract means: remote Seedless password is new, local Seedless vault is new, local Keyring uses the new password, and the current Keyring encryption key is durably stored via `storeKeyringEncryptionKey`.

## Lifecycle persistence

**Decision:** the password-change lifecycle is persisted as ordinary controller state. The `passwordChangePhase` field has `persist: true` metadata, so it is written through the controller's normal `stateChange` flow (the same debounced persistence path used by every other persisted field). There is no separate awaitable durability hook on the controller.

The lifecycle is a **recovery signal only** — it is not proof that a remote or local operation completed, and it is not proof that the lifecycle itself reached durable storage before the next step ran. A crash can leave the durable marker behind the actual cryptographic state. Recovery must therefore always re-verify actual remote and local state (see [No retries, no concurrency](#no-retries-no-concurrency) and [Unlock-time lifecycle read](#unlock-time-lifecycle-read)) before acting on the phase. A missing or stale marker is recoverable: `checkIsPasswordOutdated({ skipCache: true })` detects a remote change with no marker at all, and cryptographic Keyring verification classifies the local state.

Required lifecycle write points (in controller code):

- before the first remote mutation (`SEEDLESS_CHANGE_PENDING`);
- after authoritative remote commitment (`SEEDLESS_COMMITTED`);
- after the local Seedless vault rewrite (`LOCAL_KEYRING_PENDING`);
- after local Keyring-key storage when that update is coupled to a lifecycle write;
- after `COMPLETE`;
- after explicit clear to `IDLE`.

On a failed step the controller **preserves the last known phase**; it does not overwrite it with `UNKNOWN`. The last written phase is the recovery signal (e.g. a `changeEncKey` rejection leaves `SEEDLESS_CHANGE_PENDING`, and the client performs an authoritative password-outdated check to choose the branch). If the failure happened before the first lifecycle write, the lifecycle stays `IDLE`. `UNKNOWN` is a recovery-time determination made by the client when an authoritative server check or local cryptographic verification cannot establish the state — not a phase written by `changePassword`'s catch block.

These are `this.update(...)` calls that publish `SeedlessOnboardingController:stateChange`. They are not awaited durability boundaries.

### Platform persistence

| Client | Durable write | Unlock-time read |
| --- | --- | --- |
| Extension | The persisted `SeedlessOnboardingController` slice in `chrome.storage` / the client persist pipeline (debounced). | Read the persisted slice during background/start hydration, before password-unlock error handling. |
| Mobile | The filesystem / redux-persist (or equivalent) write for the same slice (debounced). | Read the rehydrated slice at app start, before treating unlock as a normal invalid-password failure. |

The generic ComposableController / redux persist debounce remains the persistence path for this field, the same as for all other persisted controller state.

## Unlock-time lifecycle read

**Decision:** the lifecycle is persisted controller state. Clients read it through `SeedlessOnboardingController:getState` (or the already-hydrated persisted snapshot) **before** normal Keyring invalid-password handling. Recovery UI may observe safe fields; the coordinator, not the UI, decides the recovery branch.

Metadata for `passwordChangePhase` (Phase 1):

- `persist: true`
- `usedInUi: true` so recovery screens can show phase, without exposing secrets
- `includeInDebugSnapshot: false`
- `includeInStateLogs: true` (the only stored field is `phase`, which is non-sensitive)

Missing persisted field ⇒ `IDLE`.

Unlock routing:

1. Hydrate durable controller state.
2. Read `passwordChangePhase`; treat missing as `IDLE`.
3. If phase is `IDLE` or `COMPLETE` (or `COMPLETE` already cleared to `IDLE`): continue normal unlock.
4. Otherwise: recovery-blocked path. Do not report the entered password as an ordinary Keyring unlock failure while recovery is pending.
5. Call `resolvePasswordSyncState()` to resolve remote state without a password. Only prompt for the new password when it returns `enter-new-password`; if it returns `no-change`, unlock with the old password normally.
6. After the user supplies the new password, call `recoverPasswordChange({ globalPassword })` to reconcile the Seedless side. On `reconcile-keyring`, classify the local Keyring with `KeyringController:verifyPassword` (new vs old). Do not infer that from the lifecycle phase.
7. If remote or local classification cannot be established, keep the phase as-is (the recovery methods return `unknown` and preserve the phase) and keep the wallet locked.

`COMPLETE` is not a second source of cryptographic truth. After a durable `COMPLETE`, the controller should clear to `IDLE` so the next unlock is normal.

## Implications for later phases

- Phase 1–2 may add lifecycle types and lifecycle write points without calling new TOPRF methods.
- Phase 3 must **preserve the last known lifecycle phase** on ambiguous `changeEncKey` failures (e.g. leave `SEEDLESS_CHANGE_PENDING` in place) and must not reset to `IDLE` without an **old** remote classification. It must never retry `changeEncKey`. `UNKNOWN` is determined later by recovery, not written by the catch block.
- Phase 4 couples local Keyring-key storage to a lifecycle write; no remote key-sync API is needed.
- Phase 5 reuses `submitGlobalPassword` and `syncLatestGlobalPassword` as the recovery mechanism.
- Phase 6 exposes the controller-owned recovery methods (`resolvePasswordSyncState`, `recoverPasswordChange`) and the `PasswordChangeRecoveryStatus` enum through the messenger and package exports. The legacy `checkIsPasswordOutdated` is folded into `resolvePasswordSyncState` (now private `#checkIsPasswordOutdated`).
- Phase 7 clients must implement the unlock-time read of the persisted lifecycle and route through `resolvePasswordSyncState` / `recoverPasswordChange` for the Seedless side, owning only the Keyring side (Option A). They must not start a second password change while the lifecycle is unfinished, and must never retry `changePassword` / `changeEncKey`. Option B (controller owning the Keyring side too) is planned in [0004](./0004-controller-owned-password-change-recovery-plan.md).

## Existing TOPRF endpoints used by recovery

The TOPRF server already exposes the endpoints this recovery model needs. No new server-side API is required for this plan:

- `fetchAuthPubKey` — returns the current remote auth public key and key index. Used by `checkIsPasswordOutdated({ skipCache: true })` to classify old vs new after a lost response.
- `recoverPwEncKey` — walks the server-side password-key history chain (`maxPwChainLength`) to find the `pwEncKey` matching this device’s `authPubKey`. Used by `submitGlobalPassword` to unlock with the new password from a device still on the old auth key.
- `recoverEncKey` — derives encryption material from a candidate password. Used by `syncLatestGlobalPassword` to rewrite the local vault.

The only residual risk is a network failure during the `fetchAuthPubKey` status check itself. In that case the result stays `UNKNOWN` and the wallet remains locked — this is not a missing API, just a network failure.

## Future server/API work (optional, not required by this plan)

These would improve recovery but are not required. The current plan works without them:

1. Authoritative password-change status after a lost response (would let recovery distinguish committed vs uncommitted without relying on `authPubKey` comparison).
2. Idempotent `changeEncKey` keyed by a transaction ID (would make retries safe, but this plan does not retry).
3. Explicit partial-state reporting for backup and key-share updates (would reduce `UNKNOWN` outcomes).
