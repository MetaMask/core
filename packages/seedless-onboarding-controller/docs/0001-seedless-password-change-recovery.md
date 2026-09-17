# Seedless password-change recovery: package notes

- Status: Implementation companion
- Scope: `@metamask/seedless-onboarding-controller`
- State-machine contract: [ADR 0002](https://github.com/MetaMask/decisions/pull/280)
- Password-change architecture: [ADR 0003](https://github.com/MetaMask/decisions/pull/281)
- Client guide: [Password-change recovery](./0002-seedless-password-change-recovery-client-guide.md)

The linked ADRs are the source of truth for the state-machine contract,
problem, decision, trade-offs, and cross-client behavior. This note records
only how this package implements them.

## Current implementation

This package implements the server-first flow with client-owned Keyring
recovery (Option A):

- The remote Seedless password change happens once. Recovery never starts a
  second remote password mutation.
- `SeedlessOnboardingController` owns the Seedless-side password change,
  vault rewrite, password reconciliation, and lifecycle state.
- The client owns `KeyringController` operations, wallet locking, remote
  Keyring-key synchronization, and the final lifecycle clear.
- Recovery repeats safe Seedless-side work instead of rolling back.
- The wallet stays locked while the state is incomplete or unknown.

The package stores the password-change lifecycle using the shared state-machine
record:

```ts
{
  operation: SeedlessOnboardingOperation.PasswordChange,
  phase: SeedlessOnboardingPhase.RemotePasswordPending,
}
```

The password-change flow uses these shared phases, in order:

```text
REMOTE_PASSWORD_PENDING → LOCAL_STATE_PENDING
                       → LOCAL_PASSWORD_PENDING
                       → KEY_SYNC_PENDING
```

`undefined` means that no operation is active. An unknown result preserves the
current phase and returns an unknown recovery status; it is not a new phase.

## Package invariants

1. Do not start a new password change while a phase is set.
2. A phase is a recovery signal, not proof that the associated step completed.
3. A rejected request does not prove that the remote mutation failed.
4. Clear the lifecycle only after the current Keyring encryption key is
   synchronized and required local state is durably persisted.
5. Preserve the phase and keep the wallet locked when recovery cannot establish
   the state.

## Controller/client boundary

The controller exposes these Seedless-side operations:

- `changePassword`
- `resolvePasswordSyncState`
- `reconcilePassword`
- `loadKeyringEncryptionKey` and `storeKeyringEncryptionKey`
- `markPasswordChangeKeySyncPending`
- `completePasswordChange`

The client must provide one coordinator lock around the complete Seedless and
Keyring workflow. It must classify the local Keyring cryptographically, run
the appropriate recovery branch, synchronize the current Keyring encryption
key, and lock the wallet before showing recovery errors.

## Current limitations

These are implementation constraints, not alternative design decisions:

- The controller does not depend on `KeyringController`; cross-controller
  coordination remains client-owned.
- The lifecycle currently models the password-change operation only; additional
  TOPRF workflows can add operations without changing the shared record shape.
- Lifecycle writes use ordinary controller persistence; there is no separate
  awaitable durability acknowledgement.
- The current server API does not provide a transaction/idempotency key for
  password changes or Keyring-key synchronization.

For the exact call sequence and client behavior, read the [client guide](./0002-seedless-password-change-recovery-client-guide.md).
For known concurrency concerns, read the [state-lock audit](./0004-controller-state-lock-audit.md).
