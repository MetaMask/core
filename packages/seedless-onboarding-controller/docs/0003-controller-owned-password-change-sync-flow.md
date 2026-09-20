# Plan 0003: Controller-owned Password Change and Sync flow

- Status: Proposed
- Related: [Password-change flow 0001](./0001-seedless-password-change-flow.md), [client guide 0002](./0002-seedless-password-change-recovery-client-guide.md)

## Context

Seedless onboarding controller features consist of multiple operations across the `SeedlessOnboardingController`, `KeyringController` and `OAuthService`.
Currently for the password change/sync operation, **client** is responsible for orchestrating the right pieces in the right places. 
The whole operations outcome depends on **the client side orchestration**.
This exposes mistakes and repetitive codes in the client side. Harder to manage for both platforms.

## Current flow

Take the password sync flow as an example, in below diagram.

```mermaid
flowchart LR
 subgraph s1["ReconcilePassword"]
        n1["toprf:ChangeEncKey"]
        n2["Seedless:vaultCommitment"]
  end
 subgraph s2["ReconcileKeyring"]
        n3["Keyring:submitEncKey"]
        n6["Keyring:changePassword"]
        n9["Seedless:loadEncKey"]
  end
 subgraph s3["KeySync"]
        n7["Keyring:exportEncKey"]
        n8["Seedless:loadEncKey"]
  end
    n1 --> n2
    n3 --> n6
    s1 --> s2
    n9 --> n3
    n7 --> n8
    s2 --> s3
    n10(["Client<br>Mobile/Extension"]) --> n11["Lookup State Machine Checkpoint"]
    n11 --> s1 & s2
    n11 --> s3

    n1@{ shape: rounded}
    n2@{ shape: rounded}
    n3@{ shape: rounded}
    n6@{ shape: rounded}
    n9@{ shape: rounded}
    n7@{ shape: rounded}
    n8@{ shape: rounded}
    n11@{ shape: rect}
```

- The whole password sync flow depends on the local State Machine checkpoint or the remote server pub key status.
- Based on the checkpoint/status, the client will have to call the relevant methods from the different controllers.

## Goal

Move the complete transactions into `SeedlessOnboardingController`.
`SeedlessOnboardingController` will manage the transactions/methods calls with `KeyringController` via the central controller messenger.

### Password change flow

```mermaid
flowchart LR
    n1["Seedless:changePassword"] --> n2["toprf:changeEncKey"] & n3["Seedless:updateVault"] & n7["Controller Messenger"]
    n7 --> n4["Keyring:changePassword"] & n5["Keyring:exportEncKey"]
    n1 --> n6["Seedless:storeKeyringEncKey"]

    n1@{ shape: rounded}
    n2@{ shape: rounded}
    n3@{ shape: rounded}
    n7@{ shape: hex}
    n4@{ shape: rounded}
    n5@{ shape: rounded}
    n6@{ shape: rounded}
```


### Password Sync flow

```mermaid
flowchart LR
    n1["Seedless:reconcilePassword"] --> n2["toprf:getAuthPubKey"] & n5["Seedless:loadKeyringEncKey"] & n3["toprf:RecoverEncKey"] & n4["Seedless:updateVault"] & n11["Seedless:loadKeyringEncKey"] & n10["Controller Messenger"]
    n10 --> n6["Keyring:submitEncKey"] & n7["Keyring:changePassword"] & n8["Keyring:exportEncKey"]
    n1 --> n9["Seedless:storeKeyringEncKey"]

    n1@{ shape: rounded}
    n2@{ shape: rect}
    n5@{ shape: rounded}
    n3@{ shape: rect}
    n4@{ shape: rounded}
    n11@{ shape: rounded}
    n10@{ shape: hex}
    n6@{ shape: rounded}
    n7@{ shape: rounded}
    n8@{ shape: rounded}
    n9@{ shape: rounded}
```

