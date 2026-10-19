# Controller-Owned Password Change Flow: Implementation Plan

## Status

This document tracks the implementation of [0005-controller-owned-password-change-flow.md](./0005-controller-owned-password-change-flow.md).

- [x] Review the current extension password-change flow.
- [x] Confirm the existing Keyring action names.
- [x] Register the Keyring actions in the Seedless controller messenger.
- [ ] Extract controller-owned Keyring and key-sync helpers.
- [ ] Move the password-change happy path into `SeedlessOnboardingController`.
- [ ] Add failure, locking, and checkpoint coverage.
- [ ] Remove duplicate orchestration from client code.
- [ ] Decide and implement controller ownership of password-sync recovery.
- [ ] Update documentation and changelog.

## Scope

The first implementation should move the social-login password-change happy path into `SeedlessOnboardingController`, while preserving the existing public method signature:

```ts
changePassword(newPassword: string, oldPassword: string): Promise<void>
```

The controller will own:

1. Seedless/TOPRF password change.
2. Local Seedless vault update.
3. Keyring password change.
4. Keyring encryption-key synchronization.
5. Key synchronization verification.
6. Password-change lifecycle completion.
7. Locking both controllers when the operation fails.

The existing password-sync recovery instruction API should remain unchanged during the first migration. Recovery orchestration is tracked separately below because it requires additional Keyring actions.

## Action names and messenger registration

The Keyring controller already exposes these actions:

- `KeyringController:changePassword`
- `KeyringController:exportEncryptionKey`
- `KeyringController:setLocked`

`KeyringController:exportKeyringEncryptionKey` does not currently exist. Do not add a duplicate action unless a separate API requirement is introduced.

### Files

- `src/SeedlessOnboardingController-types.ts`
  - Add the three existing Keyring action types to `AllowedActions`.
- `packages/wallet/src/initialization/instances/seedless-onboarding-controller/seedless-onboarding-controller.ts`
  - Delegate the three actions from the root messenger.
- `packages/wallet/src/initialization/instances/seedless-onboarding-controller/seedless-onboarding-controller.test.ts`
  - Update the delegated-action expectation.
- `tests/__fixtures__/mockMessenger.ts`
  - Delegate the actions needed by controller tests.

### Acceptance criteria

- The Seedless controller can call all three Keyring actions through its restricted messenger.
- No Keyring controller implementation changes are required.
- Messenger action and type checks pass.

### Messenger registration status

Completed on 2026-10-19.

- Added the three Keyring action types to the Seedless controller's allowed actions.
- Delegated the actions through the Core wallet Seedless controller messenger.
- Updated the Seedless test messenger fixture and wallet delegation test.
- Verified the Seedless controller tests, wallet delegation test, messenger action checks, and Seedless package build.

## Implementation steps

### Step 1: Extract private controller helpers

- Add private helpers for:
  - Calling `KeyringController:changePassword`.
  - Calling `KeyringController:exportEncryptionKey`.
  - Storing and verifying the exported Keyring encryption key.
  - Best-effort Keyring locking.
- Refactor lifecycle methods so their internal, unlocked variants can be used while `changePassword` owns the controller mutex.
- Do not call public controller methods that reacquire the same mutex from inside `changePassword`.

Acceptance criteria:

- Existing public lifecycle methods retain their current behavior.
- No mutex deadlocks are introduced.
- Helper-level tests cover the expected call order.

### Step 2: Move the successful password-change sequence

After the Seedless vault reaches `LOCAL_PASSWORD_PENDING`:

1. Call `KeyringController:changePassword(newPassword)`.
2. Persist `KEY_SYNC_PENDING`.
3. Export the current Keyring encryption key.
4. Store it in the Seedless vault.
5. Export the Keyring encryption key again.
6. Compare the stored and current values.
7. Clear the lifecycle only after the comparison succeeds.

Acceptance criteria:

- The controller performs the complete sequence without client coordination.
- `LOCAL_PASSWORD_PENDING` is written before the Keyring password change.
- `KEY_SYNC_PENDING` is written before key synchronization.
- The lifecycle is cleared only after successful key verification.

### Step 3: Implement failure and locking behavior

For every failure in the operation:

- Preserve the latest persisted checkpoint.
- Lock the Seedless controller.
- Attempt to lock the Keyring controller.
- Preserve the original operation error if either lock attempt fails.

`KeyringController:setLocked` may reject when the Keyring is already locked. Locking must therefore be best effort and must not mask the password-change error.

Add tests for failures at:

- Remote password mutation.
- Seedless vault update.
- Keyring password change.
- Key export.
- Seedless key storage.
- Key verification mismatch.
- Seedless locking.
- Keyring locking.

Acceptance criteria:

- `LOCAL_PASSWORD_PENDING` remains recoverable after a Keyring password failure.
- `KEY_SYNC_PENDING` remains recoverable after a key-sync failure.
- The wallet is not left unlocked after a failed operation.
- Error causes remain observable to callers.

### Step 4: Migrate the extension happy path

Update `metamask-extension/app/scripts/services/legacy-background-api-service.ts`:

- Keep the outer operation mutex and telemetry initially.
- Reduce the social-login password-change path to a single `SeedlessOnboardingController:changePassword` call.
- Remove duplicate calls to:
  - `KeyringController:changePassword`
  - `markPasswordChangeKeySyncPending`
  - Keyring-key export/store/verification
  - `completePasswordChange`
- Update extension tests to verify that the controller owns the sequence.

The extension may retain generic lock and recovery code until the controller-owned flow is proven, but it must not run the same happy-path Keyring operations a second time.

Acceptance criteria:

- A successful social-login password change changes both vaults exactly once.
- The extension no longer performs password-change lifecycle coordination.
- Existing telemetry and user-facing error behavior remain compatible.

## Recovery migration

The current recovery flow also uses:

- `KeyringController:verifyPassword`
- `KeyringController:submitEncryptionKey`
- `KeyringController:submitPassword`
- `KeyringController:getState`

These are outside the initial three-action registration. Recovery should be migrated in a follow-up step after the happy path is stable. Preserve:

- `PasswordSyncInstruction` values.
- `LOCAL_PASSWORD_PENDING` recovery.
- `KEY_SYNC_PENDING` recovery.
- The `KEY_SYNC_PENDING` plus remote-password-outdated wallet-reset path.

Before changing `reconcilePassword`, decide whether to:

1. Add a new explicit controller-owned recovery method, or
2. Extend `reconcilePassword` to perform Keyring operations while preserving its current return contract.

The decision must be documented before implementation because it changes client responsibilities and recovery semantics.

## Documentation and release tasks

- Update `0005-controller-owned-password-change-flow.md` with the complete lifecycle, verification, and failure behavior.
- Update `0001-seedless-password-change-flow.md` so the client call order reflects controller ownership.
- Update the password-sync recovery documentation when recovery is migrated.
- Add a changelog entry for the new messenger dependencies and expanded `changePassword` behavior.
- Mark the messenger contract change as potentially breaking for consumers that construct the controller directly.

## Validation checklist

- [ ] Seedless controller package tests pass.
- [ ] Wallet initialization tests pass.
- [ ] Extension password-change tests pass.
- [ ] Type checks pass.
- [ ] Messenger action checks pass.
- [ ] Oxlint/Oxfmt pass.
- [ ] Changelog validation passes.
