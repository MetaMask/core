# Seedless Onboarding Password Sync flow

## Background and Context

For seedless onboarding (social login), users can only have one password globally across different devices.
When user change new password in the extension, the same session in the mobile has to sync with the latest password.
So that the encryption keys are in sync globally and encrypted secret metadata can be updated from any devices.

We call this, `Password Sync` flow. Currently, `Password Sync` flow can only sync the remote password updates.
Integrating with the password change state machine checkpoints, we can use this existing flow as for the recovery too.

For the more information about the architecture decisions and researches, please refer to [the original document for Password Sync flow](https://docs.google.com/document/d/1tyVz7QPlaB7o5KLcNwwJKlywOakEJUrcw5AtOddNpUM/edit?tab=t.0#heading=h.fcfnz78jlyyl).

In this document, we are focusing on updating the `Password Sync` flow to use for `Password Change Recovery`.

## Goal

- Update `Password Sync` flow to **aware of state machine checkpoints.**
- Use `Password Sync` flow for the Password change failure recovery.

## Proposed Design

The existing **Password Sync** flow includes two top level steps;

- verify the current device is sync with the latest global password from remote server
- if not in sync, perform sync for local Seedless and Keyring vault in the current device

### Password sync check

The existing public method for this is, `checkIsPasswordOutdated`.
We will rename this method to `resolvePasswordState` to facilitate the both `Remote Password Check` and `Local Password Recovery`.

Previously, the method returns `boolean` value to indicate if the device is out of sync.
In the new design, the method, `resolvePasswordState` will no longer return `boolean`.
It will return the UX aware instructions to do in the client side.

The updated method signature:

```ts
resolvePasswordState(): Promise<PasswordSyncInstruction>
```

`PasswordSyncInstruction` is an enum, clients can use this instruction take relevant actions in the UX.

```ts
export enum PasswordSyncInstruction {
  /**
   * No password change activities on other devices.
   * Even if the last password change has failed, no commitment has done on the remote server.
   * The check point is either empty or `REMOTE_PASSWORD_PENDING`.
   * The local and remote passwords are synchronized; no recovery action is needed. Unlock normally.
   */
  InSync = 'in-sync',
  /**
   * The remote password changed due to
   *    - another device changed it.
   *    - the last password change has failed, but commitment has done in the server
   * The check point can be empty, `REMOTE_PASSWORD_PENDING` or `LOCAL_STATE_PENDING`.
   * Prompt for the new password, then call `reconcilePassword`.
   */
  PasswordOutdated = 'password-outdated',
  /**
   * Prompt for the new password.
   * The Seedless vault is reconciled (checkpoint is `LOCAL_PASSWORD_PENDING`).
   * The client needs to unlock Seedless vault with new password.
   * Recover current keyring and call the Keyring:changePassword.
   */
  ReconcileKeyring = 'reconcile-keyring',
  /**
   * Prompt for the new password.
   * Checkpoint is `KEY_SYNC_PENDING`.
   * The client must enter new password to unlock both Keyring and Seedless vault.
   * After that, must sync Keyring Encryption Key to seedless vault.
   */
  SyncKey = 'sync-key',
}
```

The following is the execution flow for the `resolvePasswordState`.

```mermaid
flowchart LR
    n1["resolvePasswordSyncState"] --> n2["Check state machine for any checkpoint"]
    n2 --> n11["no checkpoint"] & n12["REMOTE_PASSWORD_PENDING"] & n9["LOCAL_STATE_PENDING"] & n8["LOCAL_PASSWORD_PENDING"] & n10["KEY_SYNC_PENDING"]
    n4["toprf:getAuthPubKey"] --> n6["outdated password?"]
    n6 -- NO --> n7(["InSync"])
    n6 -- YES --> n5(["PasswordOutdated"])
    n11 --> n4
    n12 --> n4
    n9 --> n5
    n8 --> n13(["ReconcileKeyring"])
    n10 --> n14(["SyncKey"])

    n1@{ shape: rounded}
    n2@{ shape: rect}
    n11@{ shape: rect}
    n12@{ shape: rect}
    n9@{ shape: rect}
    n8@{ shape: rect}
    n10@{ shape: rect}
    n4@{ shape: rounded}
    n6@{ shape: diam}
    style n1 font-size:12px
```

### Execute password sync

The password sync execution has three sub steps

#### Sync local seedless vault with the remote server. (`ReconcilePassword`)

This method first recovers the encryption key belongs to the current device, so that we can unlock the current Seedless and Keyring vault which allows us to change their respective password (and encryption key).
Then it syncs the latest password from the server, update the Seedless vault with new encryption keys.

```mermaid
flowchart LR
 subgraph s1["ReconcilePassword"]
        n1["reconcilePassword"]
        n13["toprf:RecoverPwdEncKey"]
        n14["decrypt **current** seedless vault"]
        n15["decrypt **current** keyring enc key"]
        n16["toprf:RecoverEncKey"]
        n19["Encrypt the Seedless Vault and Keyring Enc Key with new Password"]
        n17["Seedless:updateVault"]
        n18["Seedless vault"]
  end
    n13 --> n14 & n15 & n16
    n16 --> n19
    n14 --> n19
    n15 --> n19
    n19 --> n17
    n17 --> n18
    n1 --> n13
    n20["no checkpoint (or)<br>REMOTE_PASSWORD_PENDING (or)<br>LOCAL_STATE_PENDING"] --> s1
    s1 --> n21["ReconcileKeyring"]
    n21 --> n22["SyncKey"]

    n1@{ shape: rounded}
    n13@{ shape: rounded}
    n14@{ shape: rect}
    n15@{ shape: rect}
    n16@{ shape: rounded}
    n19@{ shape: rect}
    n17@{ shape: rounded}
    n18@{ shape: cyl}
    n20@{ shape: rect}
    n21@{ shape: rounded}
    n22@{ shape: rounded}
    style n1 font-size:12px
```

#### Recover the current Keyring vault and sync with the latest password. (`ReconcileKeyring`)

This step is responsible for recovering the **current** device Keyring vault, using the **current** Keyring encryption key, stored in the seedless vault.
After the Keyring vault recovery and has unlocked, we can change the password of the Keyring vault.

```mermaid
flowchart LR
 subgraph s1["ReconcileKeyring"]
        n1["Seedless:loadKeyringEncKey"]
        n2["`**current** device Keyring Enc Key`"]
        n3["Keyring:submitEncKey"]
        n4["Keyring unlock, allow password change."]
        n5["Keyring:changePassword(newPassword)"]
  end
    n1 --> n2
    n2 --> n3
    n3 --> n4
    n4 --> n5
    n7["New Password"] --> n6["ReconcilePassword"]
    n6 --> s1
    s1 --> n8["KeySync"]

    n1@{ shape: rounded}
    n2@{ shape: rect}
    n3@{ shape: rounded}
    n4@{ shape: rect}
    n5@{ shape: rounded}
    n7@{ shape: rect}
    n6@{ shape: rounded}
    n8@{ shape: rounded}
```

#### Sync the new Keyring encryption to the Seedless vault. (`SyncKey`)

After both Keyring and Seedless vault has updated, export the new keyring encryption.
The exported key will be stored inside the seedless state, encrypted with the TROPF password enc key.
This encrypted key will be used again on the next password sync, to unlock the current Keyring.

```mermaid
flowchart LR
 subgraph s1["SyncKey"]
        n1["Keyring:exportEncryptionKey"]
        n2["Seedless:storeKeyringEncKey"]
        n4["Encrypted and persisted in the Seedless state"]
        n3["TOPRF Pwd Enc Key"]
        n5["Keyring Vault (Unlocked)"]
        n6["Seedless Vault (Unlocked)"]
  end
    n1 --> n2
    n2 --> n4
    n3 --> n4
    n5 --> n1
    n6 --> n3
    n7["ReconcileKeyring"] --> s1
    n8["ReconcilePassword"] --> n7
    n9["New Password"] --> n8

    n1@{ shape: rounded}
    n2@{ shape: rounded}
    n4@{ shape: rect}
    n3@{ shape: rounded}
    n5@{ shape: rounded}
    n6@{ shape: rounded}
    n7@{ shape: rounded}
    n8@{ shape: rounded}
    n9@{ shape: rect}
```

### Usage with the password change failure recovery

Refer the below diagram, based on the last checkpoint on the password change failure, we can go to different branches.
The diagram assumes that user's device is already out of sync.

At this point, the possible checkpoints user can have are ~

- **REMOTE_PASSWORD_PENDING**: remote commitment has done in the last password change failure, but no attempt has started for local yet.
- **LOCAL_STATE_PENDING**: remote commitment has done, but local state write has failed.
- **LOCAL_PASSWORD_PENDING**: Seedless vault is already updated/synced, but the `Keyring:changePassword` has failed.
- **KEY_SYNC_PENDING**: Both keyring and seedless vault were updated, but sync key steps has not finished yet.
- **no checkpoint**: No failure. Another device updated the password.

```mermaid
flowchart LR
 subgraph s1["ReconcilePassword"]
        n1["reconcilePassword"]
        n13["toprf:RecoverPwdEncKey"]
        n14["decrypt **current** seedless vault"]
        n15["decrypt **current** keyring enc key"]
        n16["toprf:RecoverEncKey"]
        n19["Encrypt the Seedless Vault and Keyring Enc Key with new Password"]
        n17["Seedless:updateVault"]
        n18["Seedless vault"]
  end
    n13 --> n14 & n15 & n16
    n16 --> n19
    n14 --> n19
    n15 --> n19
    n19 --> n17
    n17 --> n18
    n1 --> n13
    n20["no checkpoint (or)<br>REMOTE_PASSWORD_PENDING (or)<br>LOCAL_STATE_PENDING"] --> s1
    s1 --> n21["ReconcileKeyring"]
    n21 --> n22["SyncKey"]
    n23["LOCAL_PASSWORD_PENDING"] --> n21
    n24["KEY_SYNC_PENDING"] --> n22
    n25["Look up State Machine Checkpoint"] --> n20 & n23
    n25 --> n24

    n1@{ shape: rounded}
    n13@{ shape: rounded}
    n14@{ shape: rect}
    n15@{ shape: rect}
    n16@{ shape: rounded}
    n19@{ shape: rect}
    n17@{ shape: rounded}
    n18@{ shape: cyl}
    n20@{ shape: rect}
    n21@{ shape: rounded}
    n22@{ shape: rounded}
    n23@{ shape: rect}
    n24@{ shape: rect}
    n25@{ shape: diam}
    style n1 font-size:12px
```

#### REMOTE_PASSWORD_PENDING (or no checkpoint)

In this case, the remote server already has the encrypted shares associated to the new password.
The client must go through the `reconcilePassword` method to recover the **current device Seedless vault** and sync the last to the device. Please refer to the [`ReconcilePassword` flow above](#sync-local-seedless-vault-with-the-remote-server-reconcilepassword).

#### LOCAL_STATE_PENDING

This checkpoint means that the client has acknowledged the remote commitment. But the process failed before updating the Seedless vault with new password (and encryption keys).
Both vaults are (**must be**) still locked.
The client will have to start from [`ReconcilePassword` flow](#sync-local-seedless-vault-with-the-remote-server-reconcilepassword) again.

#### LOCAL_PASSWORD_PENDING

From the password change checkpoint, it means Seedless vault is updated and synced.
The next step would be to recover and update Keyring vault, following this [`ReconcileKeyring` path](#recover-the-current-keyring-vault-and-sync-with-the-latest-password-reconcilekeyring).

#### KEY_SYNC_PENDING

Both Seedless and Keyring were synced.
At this point, user can technically unlock the wallet session with new password.
The last step of both `Password Change` and `Password Sync` flow.
The client has just to do the [`SyncKey`](#sync-the-new-keyring-encryption-to-the-seedless-vault-synckey)
