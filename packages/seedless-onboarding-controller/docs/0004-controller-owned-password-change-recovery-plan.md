# Plan 0004: Migrate password-change recovery into the controller (Option B)

- Status: Planned (post-testing migration)
- Related: [ADR 0001](./0001-seedless-password-change-recovery.md), [Implementation plan 0002](./0002-seedless-password-change-implementation-plan.md), [Contracts 0003](./0003-seedless-password-change-contracts.md)
- Scope: `SeedlessOnboardingController` only

## Context

The first implementation ([0002](./0002-seedless-password-change-implementation-plan.md)) ships **Option A**: the controller owns all *Seedless-side* recovery sequencing, but the *Keyring-side* steps (`verifyPassword`, `submitEncryptionKey`, `changePassword`, `exportEncryptionKey`) stay in the client because `SeedlessOnboardingController` has no `KeyringController` dependency (`AllowedActions = never`).

This document plans the migration to **Option B**: the controller owns the entire recovery, including the Keyring side. Motivation: the recovery transaction spans two controllers, and we cannot rely on every client sequencing the Keyring-side steps correctly. Centralizing the full transaction removes a class of client-integration bugs.

This migration is deferred until Option A is shipped and tested, so the recovery contract is exercised end-to-end before the coupling is introduced.

## Goal

A single controller method performs the entire recovery for any non-IDLE phase and returns only a final status. The client no longer sequences Seedless or Keyring operations; it only supplies the password and reacts to the status.

## Current state (Option A)

- `recoverPasswordChange({ globalPassword })` does the Seedless-side steps (`#checkIsPasswordOutdated({ skipCache: true })`, `submitGlobalPassword`, `syncLatestGlobalPassword`, lifecycle advances) and returns a result describing the remaining Keyring-side step. Remote-state resolution for `SeedlessChangePending` is owned by `resolvePasswordSyncState()` (password-less), which the client calls first.
- The client classifies the local Keyring via `KeyringController:verifyPassword`, then runs the old-Keyring or new-Keyring branch itself, calling `KeyringController:submitEncryptionKey` / `changePassword` / `exportEncryptionKey` and the controller's `loadKeyringEncryptionKey` / `storeKeyringEncryptionKey` / `markPasswordChangeKeySyncPending` / `completePasswordChange`.
- `AllowedActions = never`; the controller does not call `KeyringController`.

## Target state (Option B)

- `AllowedActions` includes `KeyringController:verifyPassword`, `KeyringController:submitEncryptionKey`, `KeyringController:changePassword`, `KeyringController:exportEncryptionKey` (and `KeyringController:setLocked` if locking is folded in).
- `recoverPasswordChange({ globalPassword })` performs the full transaction:
  1. Resolve remote state for `SeedlessChangePending` via `resolvePasswordSyncState()` (which runs `#checkIsPasswordOutdated({ skipCache: true })`).
  2. Reconcile the Seedless side (`submitGlobalPassword` + `syncLatestGlobalPassword`) for `SeedlessCommitted` / `LocalKeyringPending`.
  3. Classify the local Keyring via `KeyringController:verifyPassword(newPassword)`.
  4. Old-Keyring branch: `loadKeyringEncryptionKey` → `KeyringController:submitEncryptionKey` → `KeyringController:changePassword` → `KeyringController:exportEncryptionKey` → `storeKeyringEncryptionKey` → `markPasswordChangeKeySyncPending`.
  5. New-Keyring branch: `KeyringController:exportEncryptionKey` → `storeKeyringEncryptionKey` → `markPasswordChangeKeySyncPending`.
  6. `KeySyncPending`: `KeyringController:exportEncryptionKey` → `storeKeyringEncryptionKey` → remote key sync → `completePasswordChange` → `clearPasswordChangePhase`.
  7. Return a final status only (`PasswordChangeRecoveryStatus.NoChange | Complete | Unknown`).
- The client supplies the password, calls one method, and routes UI from the status. It performs no cross-controller sequencing.

## Changes

### 1. Messenger dependency

- Add the `KeyringController` action types to `AllowedActions` in `SeedlessOnboardingController.ts`.
- Confirm there is no cycle: `KeyringController` must not depend on `SeedlessOnboardingController`. (Expected to hold; `KeyringController` is lower-level.)
- Update `SeedlessOnboardingControllerMessenger` and any package-level messenger assembly/permission wiring so the controller is granted the `KeyringController:*` actions it calls.
- Update the mock messenger (`tests/__fixtures__/mockMessenger.ts`) so `KeyringController` actions are callable in tests.

### 2. Controller method

- Fold the Keyring-side steps into `recoverPasswordChange`. Keep the existing private helpers; replace the "return a plan" shape with a final-status shape.
- Preserve all existing invariants:
  - No retries of `changePassword` / `changeEncKey`; reconcile only via the password-sync flow.
  - Preserve the last known phase on failure; do not write `UNKNOWN` from the happy path.
  - Keep `storeKeyringEncryptionKey` lifecycle-neutral as a public method (the internal coupling still uses the private `#persistKeyringEncryptionKey` with a phase).
  - Serialize under `#withControllerLock`. The cross-controller Keyring operations happen while the controller lock is held; document that the client coordinator lock (Phase 7) must not deadlock with it.

### 3. Contracts and exports

- Update [0003](./0003-seedless-password-change-contracts.md): the client contract shrinks to "call `recoverPasswordChange`, route on status". The Keyring-side client steps move to the controller.
- Update [0002](./0002-seedless-password-change-implementation-plan.md) Phase 7 controller-side items and the progress tracker.
- Re-export the new result/status types from `src/index.ts`.
- Regenerate `SeedlessOnboardingController-method-action-types.ts` (the method signature change is picked up automatically).

### 4. Clients

- Remove client-side Keyring-side recovery sequencing (the old-Keyring / new-Keyring branches).
- Keep: the single coordinator lock, wallet locking on error, unlock routing to call `recoverPasswordChange`, and UI per status.
- Update client tests to assert against the new status-only result.

## Trade-offs and risks

- **Coupling:** `SeedlessOnboardingController` gains a hard dependency on `KeyringController`. This is precedented in the monorepo but breaks this controller's current self-contained design. Reuse in contexts without `KeyringController` becomes harder.
- **Lock ordering:** the controller lock now spans `KeyringController` calls. The client coordinator lock must order consistently with it to avoid deadlock. Document the ordering; prefer the controller acquiring its lock first and the coordinator lock wrapping the whole call.
- **Test surface:** controller tests must mock `KeyringController` actions; fault-injection moves from client E2E into controller unit tests.
- **Rollback:** if Option B proves problematic, Option A remains the fallback. Keep the Option A return shape recoverable by reverting the messenger dependency and method body.

## Test plan

- Controller unit tests for every phase, each branch (old/new Keyring), and each failure injection point (remote check error, `submitGlobalPassword` error, `verifyPassword` error, `submitEncryptionKey` error, `changePassword` error, `exportEncryptionKey` error, `storeKeyringEncryptionKey` error, remote key-sync error).
- Assert the final status and the resulting `passwordChangePhase` for each.
- Assert no `changePassword`/`changeEncKey` retry occurs on any recovery path.
- Assert the controller lock is released on every failure path.
- Client integration tests reduced to: one call per phase, status routing, locking, and UI.

## Migration order

1. Land Option A and ship it; gather client integration feedback.
2. Add the `KeyringController` messenger dependency and mock wiring (behind no behavior change yet).
3. Fold the Keyring-side steps into `recoverPasswordChange`; change the return shape to final status.
4. Update contracts (0003), plan (0002), exports, and clients.
5. Run the full controller + client test suites; remove the now-dead client sequencing code.
