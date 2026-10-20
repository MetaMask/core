# Controller Owned Password Change/Sync flow

## Background

Social login password change has multiple sub-operations and strictly requires the proper client-side orchestration as mentioned in [here](0002-seedless-password-sync-flow.md).
Currently, the client (metamask extension or mobile) is responsible for orchestrating the password changes in both Seedless/TOPRF and local Keyring areas.

This exposes the high risks of breaking issues;

- Incorrect orchestration from the client
- Different flows in client sides

## Proposed Design

Move the whole orchestration logics into the `seedless-onboarding-controller` package.

```mermaid
flowchart TB
    n1["New Password"] --> n2["Seedless:changePassword"]
    n2 --> n3(["Toprf:updateEncKey"]) & n4(["Seedless:updateVault"]) & n5(("Controller Messenger")) & n8(["Seedless:storeKeyringEncKey"])
    n5 --> n6(["Keyring:changePassword"]) & n7(["Keyring:exportEncKey"])
    n7 --> n8
    n6 --> n9["FAIL"]
    n9 --> n10(["Keyring:setLocked"])
    n3 --> n11["FAIL"]
    n4 --> n11
    n11 --> n12(["Seedless:setLocked"])
    n12 --> n13(("Controller Messenger"))
    n13 --> n10

    n1@{ shape: text}
    n2@{ shape: rounded}
    n9@{ shape: text}
    n11@{ shape: text}
    style n1 fill:#cccccc
    style n5 fill:#FFE0B2
    style n9 color:#D50000
    style n11 color:#D50000
    style n13 fill:#FFE0B2
```

`SeedlessOnboardingController` will also be responsible to do the _password change operations_ for the `KeyringController`, via the **controller messenger**.
