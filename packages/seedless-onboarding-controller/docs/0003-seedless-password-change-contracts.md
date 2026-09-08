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
- After remote classification is **new** (server committed), do not call `changeEncKey` again. Reconcile local state using the existing password-sync flow: `submitGlobalPassword` (unlock via server password-key history chain) → `syncLatestGlobalPassword` (rewrite local vault) → `loadKeyringEncryptionKey` / `storeKeyringEncryptionKey`.
- `storeKeyringEncryptionKey` of the already-current key is a local overwrite and is safe to re-run.

A transaction ID / idempotency key is out of scope — the TOPRF server does not accept one today, and adding it is not a simple server-side change. It remains a “good to have” for a future TOPRF release.

## Keyring encryption-key storage and recovery

The Keyring encryption key is stored **locally** in controller state (`encryptedKeyringEncryptionKey`), encrypted under the current Seedless password encryption key. There is no separate remote TOPRF API for it, and none is needed for this plan.

- `storeKeyringEncryptionKey` encrypts the current Keyring encryption key under the current Seedless password encryption key and writes `encryptedKeyringEncryptionKey` on controller state.
- `loadKeyringEncryptionKey` is read-only with respect to lifecycle. Loading a key does not complete recovery.
- `storeKeyringEncryptionKey` must never mark `COMPLETE`.

Recovery reuses the existing password-sync flow, which already handles “remote changed, local is outdated”:

1. `checkIsPasswordOutdated({ skipCache: true })` — fetches remote `authPubKey`, compares with local. Classifies old vs new.
2. `submitGlobalPassword({ globalPassword })` — calls `toprfClient.recoverPwEncKey`, which walks the server-side password-key history chain (`maxPwChainLength`) to find the `pwEncKey` matching this device’s `authPubKey`, then unlocks the vault with the new password.
3. `syncLatestGlobalPassword({ globalPassword })` — rewrites the local Seedless vault with the new password’s keys.
4. `loadKeyringEncryptionKey()` (old-Keyring branch) or `storeKeyringEncryptionKey(currentKey)` (new-Keyring branch) — recover or persist the Keyring encryption key locally.

`COMPLETE` in this contract means: remote Seedless password is new, local Seedless vault is new, local Keyring uses the new password, and the current Keyring encryption key is durably stored via `storeKeyringEncryptionKey`.

## Durable persistence hook (extension and mobile)

**Decision:** use the plan’s preferred approach — a narrow awaitable persistence hook on the controller, used only at lifecycle boundaries. Do not rely on generic debounced `stateChanged` persistence as the completion boundary.

### Hook

```ts
type PersistPasswordChangeLifecycle = (input: {
  lifecycle: SeedlessPasswordChangeLifecycle | undefined;
  state: SeedlessOnboardingControllerState;
}) => Promise<void>;
```

Constructor option: `persistPasswordChangeLifecycle?: PersistPasswordChangeLifecycle`.

Semantics:

1. The controller updates in-memory state first (`this.update`), then **awaits** this hook before treating the boundary as durable.
2. The hook must return only after the lifecycle (and any adjacent fields written in the same update, such as `encryptedKeyringEncryptionKey`) is written to the platform’s durable store.
3. Hook rejection is a persistence failure. Surface it to the caller. The client must lock the wallet and keep recovery active. Do not classify the remote password change from this failure.
4. If the hook is omitted, later phases that persist lifecycle **fail closed** before the first remote mutation. Unit tests inject a resolving or rejecting mock.
5. `undefined` lifecycle means the durable record was cleared (`IDLE`).

Required await points:

- before the first remote mutation (`SEEDLESS_CHANGE_PENDING`);
- after authoritative remote commitment (`SEEDLESS_COMMITTED`);
- after local Seedless vault rewrite (`LOCAL_KEYRING_PENDING`);
- after local Keyring-key storage when that update is coupled to a lifecycle write;
- after `UNKNOWN`;
- after `COMPLETE`;
- after explicit clear to `IDLE`.

### Platform adapters

| Client | Durable write | Unlock-time read |
| --- | --- | --- |
| Extension | Await the persisted `SeedlessOnboardingController` slice in `chrome.storage` / the client persist pipeline. Bypass debounce for this write. | Read the persisted slice during background/start hydration, before password-unlock error handling. |
| Mobile | Await the filesystem / redux-persist (or equivalent) write for the same slice. Bypass debounce for this write. | Read the rehydrated slice at app start, before treating unlock as a normal invalid-password failure. |

The generic ComposableController / redux persist debounce may remain for unrelated state. It must not be the only write that `COMPLETE` waits on.

## Unlock-time lifecycle read

**Decision:** the lifecycle is persisted controller state. Clients read it through `SeedlessOnboardingController:getState` (or the already-hydrated persisted snapshot) **before** normal Keyring invalid-password handling. Recovery UI may observe safe fields; the coordinator, not the UI, decides the recovery branch.

Metadata for `passwordChangeLifecycle` (Phase 1):

- `persist: true`
- `usedInUi: true` so recovery screens can show phase, without exposing secrets
- `includeInDebugSnapshot: false`
- `includeInStateLogs: true` only for non-sensitive fields (`phase`, `lastErrorCode`)

Missing persisted field ⇒ `IDLE`.

Unlock routing:

1. Hydrate durable controller state.
2. Read `passwordChangeLifecycle`; treat missing as `IDLE`.
3. If phase is `IDLE` or `COMPLETE` (or `COMPLETE` already cleared to `IDLE`): continue normal unlock.
4. Otherwise: recovery-blocked path. Do not report the entered password as an ordinary Keyring unlock failure while recovery is pending.
5. For every unfinished phase, bypass `passwordOutdatedCache` and fetch remote `authPubKey`.
6. Classify the local Keyring with `KeyringController:verifyPassword` (new vs old). Do not infer that from the lifecycle phase.
7. If remote or local classification cannot be established, persist `UNKNOWN` and keep the wallet locked.

`COMPLETE` is not a second source of cryptographic truth. After a durable `COMPLETE`, the controller should clear to `IDLE` so the next unlock is normal.

## Error codes stored on the lifecycle

`lastErrorCode` must be a closed, non-sensitive set. Do not persist error messages, passwords, or server bodies.

Suggested codes for later phases:

- `REMOTE_TIMEOUT`
- `REMOTE_AMBIGUOUS`
- `REMOTE_DEFINITIVE_FAILURE`
- `REMOTE_STATUS_UNAVAILABLE`
- `LOCAL_VAULT_FAILURE`
- `LOCAL_KEYRING_FAILURE`
- `KEY_STORE_FAILURE`
- `PERSISTENCE_FAILURE`

## Implications for later phases

- Phase 1–2 may add lifecycle types and the persistence hook without calling new TOPRF methods.
- Phase 3 must mark `UNKNOWN` on ambiguous `changeEncKey` failures and must not reset to `IDLE` without an **old** remote classification. It must never retry `changeEncKey`.
- Phase 4 couples local Keyring-key storage to the hook; no remote key-sync API is needed.
- Phase 5 reuses `submitGlobalPassword` and `syncLatestGlobalPassword` as the recovery mechanism.
- Phase 7 clients must implement the hook and the unlock-time read. They must not start a second password change while the lifecycle is unfinished, and must never retry `changePassword` / `changeEncKey`.

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
