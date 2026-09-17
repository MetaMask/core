# Seedless password-change recovery: client integration guide

- State-machine contract: [ADR 0002](https://github.com/MetaMask/decisions/pull/280)
- Password-change architecture: [ADR 0003](https://github.com/MetaMask/decisions/pull/281)
- Package notes: [0001](./0001-seedless-password-change-recovery.md)
- Option B plan: [0003](./0003-controller-owned-password-change-recovery-plan.md)

Read this document for the calls and decisions a client must make. Read the
ADR for the reasons behind the design.

## The short version

Password changes are server-first:

1. `SeedlessOnboardingController:changePassword` changes Seedless once.
2. Recovery brings the local Seedless vault and local Keyring forward.
3. The current Keyring encryption key is synchronized to Seedless.
4. The lifecycle is cleared only after synchronization and local persistence
   are verified.

There is no rollback and no fresh password change while recovery is active.

## Rules

- Keep one client coordinator lock around the Seedless and Keyring operations.
- Do not start `changePassword` while `seedlessOperationLifecycle` is set.
- Treat the phase as a recovery signal, not proof that a step completed.
- A timeout or rejected request does not prove that the remote change failed.
- Lock the wallet before showing a password-change or recovery error.
- Keep the wallet locked and preserve the phase when the state is unknown.
- Call `completePasswordChange` only after the current Keyring encryption key
  is synchronized and required local state is durably persisted.

## Lifecycle phases

The controller persists `seedlessOperationLifecycle`, with
`operation: PasswordChange`. An unset lifecycle means normal operation.

- `REMOTE_PASSWORD_PENDING`: the remote password outcome is unresolved.
- `LOCAL_STATE_PENDING`: the remote password change is committed; local
  Seedless recovery remains.
- `LOCAL_PASSWORD_PENDING`: local Seedless state is rewritten; the client must
  reconcile the local Keyring.
- `KEY_SYNC_PENDING`: the current Keyring encryption key still needs verified
  remote synchronization.

These are shared phases from ADR 0002. An unknown result preserves the current
phase and returns `Unknown`; it is not a separate phase.

## Unlock and recovery routing

At unlock render and password submit, call:

```ts
resolvePasswordSyncState({ skipCache?: boolean }): Promise<PasswordSyncStatus>
```

Route by the returned status:

- `InSync`: unlock normally.
- `PasswordOutdated` or `EnterNewPassword`: ask for the new global password,
  then call `reconcilePassword`.
- `ReconcileKeyring`: classify the local Keyring with
  `KeyringController:verifyPassword(newPassword)` and run a recovery branch.
- `SyncKey`: resume Keyring-key synchronization with the new password.
- `Unknown`: keep the wallet locked and preserve the phase.

`REMOTE_PASSWORD_PENDING` always performs an authoritative remote check.
Other active phases are routed directly to their recovery status.

To reconcile the Seedless side, call:

```ts
reconcilePassword({
  globalPassword: string,
}): Promise<PasswordSyncStatus>
```

This performs the chain unlock and local Seedless vault rewrite internally.
It also re-wraps `encryptedKeyringEncryptionKey` under the new Seedless
wrapping key. Re-running it is safe when the Seedless side is already synced.

Do not call `reconcilePassword` directly for `REMOTE_PASSWORD_PENDING`;
resolve the remote outcome first.

## Keyring recovery branches

After `reconcilePassword` returns `ReconcileKeyring`, classify the local
Keyring. Do not infer its state from the lifecycle phase.

### Old local Keyring

1. `loadKeyringEncryptionKey()`.
2. `KeyringController:submitEncryptionKey`.
3. `KeyringController:changePassword(newPassword)`.
4. `KeyringController:exportEncryptionKey`.
5. `storeKeyringEncryptionKey()`.
6. `markPasswordChangeKeySyncPending()`.
7. Synchronize the Keyring encryption key to Seedless and verify the result.
8. Call `completePasswordChange()`.

### New local Keyring

1. `KeyringController:verifyPassword(newPassword)`.
2. `KeyringController:exportEncryptionKey`.
3. `storeKeyringEncryptionKey()`.
4. `markPasswordChangeKeySyncPending()`.
5. Synchronize the Keyring encryption key to Seedless and verify the result.
6. Call `completePasswordChange()`.

### Resuming `KEY_SYNC_PENDING`

1. Unlock with the new password.
2. Export the current Keyring encryption key.
3. Store it locally and synchronize it to Seedless.
4. Verify the remote result and local persistence.
5. Call `completePasswordChange()`.

`storeKeyringEncryptionKey` only stores the encrypted key. It does not advance
or clear the lifecycle.

## Lifecycle methods

```ts
markPasswordChangeKeySyncPending(): Promise<void>
completePasswordChange(): Promise<void>
```

These methods are serialized by the controller, but the client must call them
only for the active recovery flow. The client coordinator must prevent stale
or concurrent lifecycle work from crossing transaction boundaries.

## Failure handling

- If the remote result is definitively old, clear the pending lifecycle after
  verification and allow the old password.
- If the remote result is committed, continue recovery with the new password.
- If the remote result is ambiguous, do not retry the remote password change.
  Preserve the phase and keep the wallet locked.
- If a Keyring or key-synchronization step fails, preserve the phase and retry
  that recovery step safely.
- Never treat an in-memory update, rejected Promise, or stale phase as proof
  that the operation completed.

## Ownership

The controller owns Seedless authentication, the Seedless vault, password
reconciliation, and the persisted lifecycle. The client owns:

- The coordinator lock covering both controllers.
- Local Keyring verification, password changes, and key export.
- Wallet locking and recovery UI.
- Remote Keyring-key synchronization.
- Final lifecycle completion.

The controller does not call `KeyringController` in the current implementation.
The future controller-owned migration is described in [0003](./0003-controller-owned-password-change-recovery-plan.md).
