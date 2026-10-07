# Test cases and scenarios for Password Change, Sync and Recovery flow

The following are the test cases that clients using the `SeedlessOnboardingController` **must** test in the E2E tests or integration tests (with UI).
Unit tests for each scenario are included in the Controller package.

## Password Change (Happy path)

### Scenario A:

Password change succeeded, without any failure.

#### Expected Behavior

- User should see password updated banner or toast in the UI.
- No further action needed in the current session.
- User should be able to unlock with new password in next unlock.

## Password Change Recovery

### Scenario B:

Failed to send `Toprf:updateEncKey` request during the password change. Remote commitment failed.

#### Expected Behavior

- User device should be locked after the failure.
- User should be able to unlock the wallet with old password.

### Scenario C:

Password change is interrupted while the lifecycle is `REMOTE_PASSWORD_PENDING`, after the remote password change is committed.

#### Expected Behavior

- User device should be locked after the failure.
- User enters the password, wallet should show `Your password is outdated.`
- User submits the _global password_ and able to unlock the wallet.

### Scenario D:

Password change is interrupted while the lifecycle is `LOCAL_STATE_PENDING`, after the remote update but before the local Seedless state update.

#### Expected Behavior

- User device should be locked after the failure.
- User enters the password, wallet should show `Your password is outdated.`
- User submits the _global password_ and able to unlock the wallet.

### Scenario E:

Password change is interrupted while the lifecycle is `LOCAL_PASSWORD_PENDING`, after the Seedless vault is updated but before the Keyring password is updated.

#### Expected Behavior

- User device should be locked after the failure.
- User enters the password, wallet should show `Your password is outdated.`
- User submits the _global password_ and able to unlock the wallet.

### Scenario F:

Password change is interrupted while the lifecycle is `KEY_SYNC_PENDING`, after the Seedless and Keyring passwords are updated but before the Keyring encryption key is synchronized.

#### Expected Behavior

- User device should be locked after the failure.
- User enters the password, wallet should show `Your password is outdated.`
- User submits the _global password_ and able to unlock the wallet.

## Password Sync (Happy Path)

### Scenario G:

User changed password on Device B.
User does unlock attempt on Device A.

**Expected Behavior on Device A**

- User enters the current device A password, the wallet should show error, `Your password is outdated.`
- User enters the new _global password_ and the wallet should be unlocked.

## Password Sync + Recovery

Below is the combination of recovery and sync flow.

Pre-condition:

- User had `Password_1` on both Device A and Device B.
- On Device A, user has password change failure with `Password_2`.
- Before recovering the password change failure on Device A, user changes the new password, `Password_3` on Device B.

### Scenario H:

1. On Device A, password change (`Password_2`) failed with TOPRF network error, remote commitment failed.
2. On Device B, user changes new password successfully. (`Password_3`).

**Expected Behavior on Device A**

- Device A should be locked after the failure.
- User enters the current device A password (`Password_1`), the wallet should show error, `Your password is outdated.`
- User enters the `Password_2`, the wallet should show error, `Your password is incorrect.` (This is because `Password_2` is never committed)
- User submits the `Password_3` and able to unlock the wallet.

### Scenario I:

1. On Device A, password change (`Password_2`) failed with TOPRF network timeout error, **remote commitment has done.**
2. On Device B, user changes new password successfully. (`Password_3`).

**Expected Behavior on Device A**

- Device A should be locked after the failure.
- User enters the current device A password (`Password_1`), the wallet should show error, `Your password is outdated.`
- User enters the `Password_2`, the wallet should show error, `Your password is incorrect.` (This is because `Password_2` is has not committed to local Keyring vault yet.)
- User submits the `Password_3` and able to unlock the wallet.

### Scenario J:

1. On Device A, password change was interrupted while the lifecycle is `LOCAL_STATE_PENDING`, after the remote update but before the local Seedless state update.
2. On Device B, user changes new password successfully. (`Password_3`).

**Expected Behavior on Device A**

- Device A should be locked after the failure.
- User enters the current device A password (`Password_1`), the wallet should show error, `Your password is outdated.`
- User enters the `Password_2`, the wallet should show error, `Your password is incorrect.` (This is because `Password_2` is has not committed to local Keyring vault yet.)
- User submits the `Password_3` and able to unlock the wallet.

### Scenario K:

1. On Device A, password change (`Password_2`) failed with TOPRF network timeout error, **remote commitment has done.**
2. On Device B, user changes new password successfully. (`Password_3`).

**Expected Behavior on Device A**

- Device A should be locked after the failure.
- User enters the current device A password (`Password_1`), the wallet should show error, `Your password is outdated.`
- User enters the `Password_2`, the wallet should show error, `Your password is incorrect.` (This is because `Password_2` is has not committed to local Keyring vault yet.)
- User submits the `Password_3` and able to unlock the wallet.

### Scenario L:

1. On Device A, password change was interrupted while the lifecycle is `LOCAL_STATE_PENDING`, after the remote update but before the local Seedless state update.
2. On Device B, user changes new password successfully. (`Password_3`).

**Expected Behavior on Device A**

- Device A should be locked after the failure.
- User enters the current device A password (`Password_1`), the wallet should show error, `Your password is outdated.`
- User enters the `Password_2`, the wallet should show error, `Your password is incorrect.` (This is because `Password_2` is has not committed to local Keyring vault yet.)
- User submits the `Password_3` and able to unlock the wallet.

### Scenario M:

1. On Device A, password change (`Password_2`) failed during `Keyring:changePassword`.
2. On Device B, user changes new password successfully. (`Password_3`).

**Expected Behavior on Device A**

- Device A should be locked after the failure.
- User enters the current device A password (`Password_1`), the wallet should show error, `Your password is outdated.`
- User enters the `Password_2`, the wallet should show error, `Your password is incorrect.` (This is because `Password_2` is has not committed to local Keyring vault yet.)
- User submits the `Password_3` and able to unlock the wallet.

### Scenario N:

1. On Device A, password change was interrupted while the checkpoint is `KEY_SYNC_PENDING`, i.e. `Keyring:exportEncryptionKey`
2. On Device B, user changes new password successfully. (`Password_3`).

**This is a rare edge case specified [in the doc](./0002-seedless-password-sync-flow.md#key_sync_pending-edge-case)**

**Expected Behavior on Device A**

- Device A should be locked after the failure with the `KEY_SYNC_PENDING` checkpoint.
- When Device A detects the password outdated from Device B, we can't sync the global password to Keyring vault.
- Wallet should give the user the `WalletResetRequired` instruction to do a "Wallet reset" in order to recover social login on Device A.
