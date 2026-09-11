# Plan 0003: Migrate password-change recovery into the controller (Option B)

- Status: Planned (post-testing migration)
- Related: [ADR 0001](./0001-seedless-password-change-recovery.md), [Recovery flow 0002](./0002-password-change-recovery-flow.md)
- Scope: `SeedlessOnboardingController` only

## Context

The first implementation (see [0002](./0002-password-change-recovery-flow.md)) ships **Option A**: the controller owns all _Seedless-side_ recovery sequencing, but the _Keyring-side_ steps (`verifyPassword`, `submitEncryptionKey`, `changePassword`, `exportEncryptionKey`) stay in the client because `SeedlessOnboardingController` has no `KeyringController` dependency (`AllowedActions = never`).

This document plans the migration to **Option B**: the controller owns the entire recovery, including the Keyring side. Motivation: the recovery transaction spans two controllers, and we cannot rely on every client sequencing the Keyring-side steps correctly. Centralizing the full transaction removes a class of client-integration bugs.

This migration is deferred until Option A is shipped and tested, so the recovery contract is exercised end-to-end before the coupling is introduced.

The `encryptedKeyringEncryptionKey` state field remains optional during the
compatibility period. Users created before that field was introduced may have
valid Seedless state without it, and the controller cannot reconstruct the
missing value from persisted data. The migration therefore includes an
unlock-time backfill before the field becomes a precondition for password
changes and password reconciliation.

## Goal

A single controller method performs the entire recovery for any set phase and returns only a final status. The client no longer sequences Seedless or Keyring operations; it only supplies the password and reacts to the status.

## Current state (Option A)

- `reconcilePassword({ globalPassword })` does the Seedless-side steps (`#checkIsPasswordOutdated({ skipCache: true })`, chain unlock, local vault rewrite, lifecycle advances) and returns a result describing the remaining Keyring-side step. Remote-state resolution for `SeedlessChangePending` is owned by `resolvePasswordSyncState()` (password-less), which the client calls first.
- The client classifies the local Keyring via `KeyringController:verifyPassword`, then runs the old-Keyring or new-Keyring branch itself, calling `KeyringController:submitEncryptionKey` / `changePassword` / `exportEncryptionKey` and the controller's `loadKeyringEncryptionKey` / `storeKeyringEncryptionKey` / `markPasswordChangeKeySyncPending` / `clearPasswordChangePhase`.
- `AllowedActions = never`; the controller does not call `KeyringController`.
- `encryptedKeyringEncryptionKey` may be missing for legacy users or users whose initial Keyring-key synchronization did not complete. Missing state is a migration signal, not proof that the user has no Keyring encryption key.
- During unlock, the client must backfill a missing value by calling `KeyringController:exportEncryptionKey` and then `SeedlessOnboardingController:storeKeyringEncryptionKey` before exposing the normal unlocked wallet flow. The backfill is lifecycle-neutral.

## Target state (Option B)

- `AllowedActions` includes `KeyringController:verifyPassword`, `KeyringController:submitEncryptionKey`, `KeyringController:changePassword`, `KeyringController:exportEncryptionKey` (and `KeyringController:setLocked` if locking is folded in).
- `reconcilePassword({ globalPassword })` performs the full transaction:
  1. During unlock, backfill a missing `encryptedKeyringEncryptionKey` from `KeyringController:exportEncryptionKey` before allowing password-change recovery.
  2. Resolve remote state for `SeedlessChangePending` via `resolvePasswordSyncState()` (which runs `#checkIsPasswordOutdated({ skipCache: true })`).
  3. Reconcile the Seedless side (internal chain unlock + local vault rewrite) for `SeedlessCommitted` / `LocalKeyringPending`.
  4. Classify the local Keyring via `KeyringController:verifyPassword(newPassword)`.
  5. Old-Keyring branch: `loadKeyringEncryptionKey` → `KeyringController:submitEncryptionKey` → `KeyringController:changePassword` → `KeyringController:exportEncryptionKey` → `storeKeyringEncryptionKey` → `markPasswordChangeKeySyncPending`.
  6. New-Keyring branch: `KeyringController:exportEncryptionKey` → `storeKeyringEncryptionKey` → `markPasswordChangeKeySyncPending`.
  7. `KeySyncPending`: `KeyringController:exportEncryptionKey` → `storeKeyringEncryptionKey` → remote key sync → `clearPasswordChangePhase`.
  8. Return a final status only (`PasswordSyncStatus.InSync | Unknown`).
- The client supplies the password, calls one method, and routes UI from the status. It performs no cross-controller sequencing.

## Changes

### 0. Keyring encryption-key backfill and precondition

- Keep `encryptedKeyringEncryptionKey` optional for backward-compatible state
  loading and migration.
- Treat a missing value as an incomplete local synchronization state. It must
  not be interpreted as evidence that the local Keyring encryption key does
  not exist.
- During unlock, after the Keyring is available, call
  `KeyringController:exportEncryptionKey` when the Seedless controller has no
  `encryptedKeyringEncryptionKey`, then persist the result through
  `SeedlessOnboardingController:storeKeyringEncryptionKey`.
- Perform this backfill for both legacy users and any new account or
  rehydration flow that reaches unlock without a stored value.
- Keep the backfill idempotent and lifecycle-neutral. It must not clear or
  advance `passwordChangePhase`.
- If export or persistence fails, keep the wallet locked and do not begin
  `changePassword` or `reconcilePassword`.
- After the migration is complete, require the value as a precondition for
  `changePassword` and `reconcilePassword`. A missing value must fail closed
  into the recovery/unknown path rather than allowing a password mutation to
  proceed without a recoverable Keyring encryption key.

### 1. Messenger dependency

- Add the `KeyringController` action types to `AllowedActions` in `SeedlessOnboardingController.ts`.
- Confirm there is no cycle: `KeyringController` must not depend on `SeedlessOnboardingController`. (Expected to hold; `KeyringController` is lower-level.)
- Update `SeedlessOnboardingControllerMessenger` and any package-level messenger assembly/permission wiring so the controller is granted the `KeyringController:*` actions it calls.
- Update the mock messenger (`tests/__fixtures__/mockMessenger.ts`) so `KeyringController` actions are callable in tests.

### 2. Controller method

- Fold the Keyring-side steps into `reconcilePassword`. Keep the existing private helpers; replace the "return a plan" shape with a final-status shape.
- Preserve all existing invariants:
  - No retries of `changePassword` / `changeEncKey`; reconcile only via the password-sync flow.
  - Preserve the last known phase on failure; do not write `UNKNOWN` from the happy path.
  - Require `encryptedKeyringEncryptionKey` before starting a password-change or reconciliation transaction after the backfill migration.
  - Keep `storeKeyringEncryptionKey` lifecycle-neutral as a public method. Its private persistence helper only updates the encrypted key; lifecycle phases are committed separately with the password-change state.
  - Serialize under `#withControllerLock`. The cross-controller Keyring operations happen while the controller lock is held; document that the client coordinator lock (Phase 7) must not deadlock with it.

### 3. Contracts and exports

- Update [0002](./0002-password-change-recovery-flow.md): the client contract shrinks to "call `reconcilePassword`, route on status". The Keyring-side client steps move to the controller.
- Update the controller-side status and remaining-work notes in [0002](./0002-password-change-recovery-flow.md).
- Re-export the new result/status types from `src/index.ts`.
- Regenerate `SeedlessOnboardingController-method-action-types.ts` (the method signature change is picked up automatically).

### 4. Clients

- Remove client-side Keyring-side recovery sequencing (the old-Keyring / new-Keyring branches).
- Keep: the single coordinator lock, wallet locking on error, unlock routing to call `reconcilePassword`, and UI per status.
- Update client tests to assert against the new status-only result.

## Trade-offs and risks

- **Coupling:** `SeedlessOnboardingController` gains a hard dependency on `KeyringController`. This is precedented in the monorepo but breaks this controller's current self-contained design. Reuse in contexts without `KeyringController` becomes harder.
- **Lock ordering:** the controller lock now spans `KeyringController` calls. The client coordinator lock must order consistently with it to avoid deadlock. Document the ordering; prefer the controller acquiring its lock first and the coordinator lock wrapping the whole call.
- **Test surface:** controller tests must mock `KeyringController` actions; fault-injection moves from client E2E into controller unit tests.
- **Rollback:** if Option B proves problematic, Option A remains the fallback. Keep the Option A return shape recoverable by reverting the messenger dependency and method body.

## Test plan

- Legacy unlock with no `encryptedKeyringEncryptionKey` calls
  `KeyringController:exportEncryptionKey`, stores the result, and does not
  advance the password-change lifecycle.
- New-account creation and rehydration persist the exported Keyring
  encryption key before normal unlock completes.
- Export or persistence failure keeps the wallet locked and prevents
  `changePassword` and `reconcilePassword` from starting.
- After backfill, `changePassword` and `reconcilePassword` reject or route to
  `Unknown` when the required encrypted Keyring key is missing.
- Controller unit tests for every phase, each branch (old/new Keyring), and each failure injection point (remote check error, chain-unlock error, `verifyPassword` error, `submitEncryptionKey` error, `changePassword` error, `exportEncryptionKey` error, `storeKeyringEncryptionKey` error, remote key-sync error).
- Assert the final status and the resulting `passwordChangePhase` for each.
- Assert no `changePassword`/`changeEncKey` retry occurs on any recovery path.
- Assert the controller lock is released on every failure path.
- Client integration tests reduced to: one call per phase, status routing, locking, and UI.

## Migration order

1. Land Option A and ship it; gather client integration feedback.
2. Add unlock-time backfill for missing `encryptedKeyringEncryptionKey` using `KeyringController:exportEncryptionKey` and `storeKeyringEncryptionKey`.
3. Ensure new-account creation and rehydration persist the exported Keyring encryption key before normal unlock.
4. Add the `KeyringController` messenger dependency and mock wiring (behind no behavior change yet).
5. Enforce the stored encrypted Keyring key as a precondition for `changePassword` and `reconcilePassword`.
6. Fold the Keyring-side steps into `reconcilePassword`; change the return shape to final status.
7. Update the recovery flow guide (0002), exports, and clients.
8. Run the full controller + client test suites; remove the now-dead client sequencing code.
