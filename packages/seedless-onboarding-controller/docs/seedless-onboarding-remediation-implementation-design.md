# Repair the primary SRP backup

Follow-up of [identifying the users with an incomplete or incorrect backup](./identify-incomplete-metadata-users.md). It describes what `PrimarySrpBackupRepairService` does to the remote backup.

## Goal

Make the **local primary SRP** the single remote `PrimarySrp` item, without deleting or rewriting any encrypted data. Every other secret becomes an imported item, which also migrates all of them to v2.

The repair is best-effort: it runs asynchronously, never throws, and can be run again at any time.

## Flow

It runs after `submitPassword`, and on request through `identifyIncompleteMetadataBackup`.

```mermaid
flowchart TB
    A["Unlock"] --> B["Fetch remote items<br/>Export local primary SRP"]
    B --> C{"Remote primary<br/>== local primary?"}
    C -- "Yes" --> D["In sync: nothing to do"]
    C -- "No candidate: MISSING<br/>Other mnemonic: MISMATCH" --> E["Track analytics event"]
    E --> F["Controller lock<br/>Identity unchanged?"]
    F -- "No" --> G["Abort"]
    F -- "Yes" --> H["Step 1: retag<br/>every secret except the local copy"]
    H --> I{"Remote copy of the<br/>local primary SRP?"}
    I -- "Yes" --> J["Step 2: promote it to PrimarySrp"]
    I -- "No" --> K["Step 2: add it as v2 PrimarySrp"]
```

The remote primary is the first mnemonic that is untagged or `PrimarySrp`, once the items are ordered by `SecretMetadata.compare`. A backup whose primary is already the local one is left alone, even if it is v1.

## Repair matrix

| Remote backup                                                     | Step 1: retag                         | Step 2: primary        |
| ----------------------------------------------------------------- | ------------------------------------- | ---------------------- |
| Empty, or only imported v2 items                                  | none                                  | add                    |
| Only legacy private keys                                          | each to `ImportedPrivateKey`          | add                    |
| v2 `PrimarySrp` is another mnemonic                               | old primary to `ImportedSrp`          | add                    |
| v2 `PrimarySrp` is another mnemonic, local one is `ImportedSrp`   | old primary to `ImportedSrp`          | promote the local copy |
| Legacy mnemonics, earliest is not the local one, local one exists | every other item to its imported type | promote the local copy |
| Legacy mnemonics, none is the local one                           | every item to its imported type       | add                    |

Items that are already imported v2 items are not retagged. A retag is one `updateSecretDataItem` for one item, and one atomic `batchUpdateSecretDataItems` for several.

## Why two steps

The metadata service accepts one `PrimarySrp` per account and checks a request against what is stored before it (`metadata-service/src/routes/encAccountData.ts`):

- `/batch_update` ignores only the items the request sets to `PrimarySrp`. Demoting the old primary and promoting another item in one request is rejected: "Only one PRIMARY_SRP is allowed".
- `/update`, `/set` and `/batch_set` reject a new primary while another one is stored.
- `/update` and `/batch_update` change only `data_type` and `version` (always `v2`), never the encrypted data. There is no delete, and every add creates a new item.

So the retag, which never contains `PrimarySrp`, goes first. The primary write follows.

## Edge cases

### The repair runs twice

`submitPassword` doesn't await the repair, so quick consecutive unlocks start several runs. Each run plans from the remote state it read **before** taking the controller lock, so the second run applies a stale plan after the first one finishes.

```mermaid
sequenceDiagram
    participant A as Run A
    participant B as Run B
    participant S as Metadata service
    A->>S: fetch (primary missing)
    B->>S: fetch (primary missing)
    Note over A,B: both plan the same repair and track an event
    A->>S: add PrimarySrp (controller lock)
    S-->>A: ok
    B->>S: add PrimarySrp (waits for the lock)
    S-->>B: rejected, a primary already exists
    Note over B: error logged, nothing duplicated
```

| Situation                                | Result of the second run                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Primary SRP is missing, or must be added | The add is rejected by the service and logged. No duplicate.                    |
| The local copy is promoted               | The same retag and promotion are applied again. The service accepts them.       |
| Always                                   | The analytics event is tracked twice, because both runs planned before a write. |

The backup is correct in every case, since the service allows one primary and the retag is idempotent. The cost is a logged error and a double event. Re-planning under the controller lock would remove both, because the second run would see a backup in sync.

### Other cases

| Case                                                                  | Result                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The retag fails                                                       | Nothing is written for a batch. The next run plans again.                               |
| The primary write fails after the retag                               | The backup has no primary. The next run repairs it as MISSING, and promotes or adds it. |
| The write succeeded but the response was lost                         | The next run finds the backup in sync and does nothing.                                 |
| The identity changed while the repair waited for the lock             | Nothing is written.                                                                     |
| The controller is locked, or the password is out of sync              | Nothing is written.                                                                     |
| Fetching, parsing, or exporting the local primary SRP fails           | The error is logged and nothing is written.                                             |
| A healthy account, including a v1 backup with the local primary first | No write and no event.                                                                  |
| The remote copy of the local primary SRP has no item id               | The local primary SRP is added.                                                         |

## Not done yet

- Re-plan under the controller lock.
