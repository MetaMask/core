# Seedless Onboarding Repair and Remediation — Implementation Design

## Background context

This document defines the implementation plan and design for remediating production accounts affected by [inconsistent seedless onboarding backup state](https://docs.google.com/document/d/1Z2-hBnrYC4Q5d35_maG3uUyn297ODgmrikZDJljRqBE/edit?tab=t.0#heading=h.ic7lth3mlv9b).

During seedless onboarding, the primary SRP is written to the metadata service before the TOPRF key shares and local vault are fully persisted. If key-share persistence fails, the metadata write and local backup-state update can remain even though the initialization is incomplete. A later retry can generate a different TOPRF key, skip writing the SRP because local state reports it as already backed up, and persist the new key instead. The resulting recoverable key can point to secret metadata without the primary SRP, preventing wallet rehydration on another device.

The issue can be reproduced with the following sequence:

1. Start seedless onboarding and generate TOPRF key 1.
2. Successfully write the primary SRP to metadata and update `socialBackupsMetadata`.
3. Make TOPRF key-share persistence fail after the metadata write.
4. Retry onboarding with the same password and SRP after the failed attempt.
5. Generate TOPRF key 2. The local duplicate check finds the existing SRP hash and skips the second SRP metadata write.
6. Successfully persist key 2 and create the local vault.
7. Add imported secrets, which are written under key 2’s secret metadata namespace.
8. Attempt recovery on another device. The recovered key 2 fetches the imported secrets but not the primary SRP, causing the strict primary-secret validation to fail.

The implementation must safely restore the primary SRP backup, handle users with different secret metadata versions, complete any required data migration, avoid duplicate or conflicting records, and verify the final state before reporting success.

The incident investigation and historical analysis are maintained separately. This document is intentionally limited to the remediation design, including its scope, acceptance criteria, implementation approaches, failure handling, and rollout considerations.

## Scope

This design covers production repair for seedless onboarding accounts with inconsistent backup metadata.

It includes the core controller, client integration points, and metadata-service APIs required to repair authenticated accounts with v1 or v2 secret metadata.

It is limited to repairing existing affected accounts. It does not define the root-cause fix for future onboarding attempts or a general-purpose metadata recovery mechanism.

## Glossary and data model

- **Secret metadata:** The client-side representation of a backed-up secret, including its encrypted payload and associated metadata such as item ID, type, storage version, and creation time.
- **Secret metadata item:** One backed-up secret represented by `SecretMetadata`. The secret can be a mnemonic or private keys (`Mnemonic` or `PrivateKeys`).
- **Primary SRP:** The mnemonic secret used to rehydrate the wallet. It is identified by the `PrimarySrp` data type after classification.
- **Imported secret:** A backed-up secret added after onboarding. It can be a mnemonic or private keys (`Mnemonic` or `PrivateKeys`).
- **v1 secret metadata:** Legacy secret metadata that stores the secret `type` and client creation time in the encrypted payload. The repair uses these fields to recover the secret metadata and identify the primary SRP. The oldest mnemonic is considered the primary SRP. This ordering is fragile because it depends on client-side timestamps.
- **v2 secret metadata:** The improved format with an explicit `dataType` field that identifies the secret's role, such as `PrimarySrp` or an imported secret type. It does not rely on ordering to identify the primary SRP.



### Primary SRP classification

- **v1:** `type` identifies whether an item contains a mnemonic or private keys, but does not identify whether a mnemonic is primary or imported. The repair compares every v1 mnemonic with the local primary SRP. A matching item is classified as `PrimarySrp`; if there is no match, the local primary SRP is added as a new v2 item.
- **v2:** `dataType` explicitly identifies the item's role. The item marked `PrimarySrp` must match the local primary SRP, and the repair corrects the classification if it does not.



## Solution overview

For an authenticated affected account, the repair recovers the missing primary SRP using the trusted local wallet state. It then migrates the account's v1 secret metadata to v2 and verifies the final remote state.

The detailed recovery, migration, validation, and failure-handling steps are defined in later sections.

## Threat model

The repair changes encrypted secret metadata on behalf of an already authenticated user. The main security goal is to repair only the correct account, using the correct local primary SRP, without exposing secret data or overwriting valid backups.

### Protected assets

- The local primary SRP and the unlocked wallet.
- Remote secret metadata, including encrypted secret payloads and their classifications.
- TOPRF encryption keys, authentication keys, and the user's authenticated session.
- Local repair state and repair telemetry.

### Trust boundaries and assumptions

- The repair runs only on an existing device after the user has unlocked the wallet and the seedless vault.
- The local primary SRP comes from the first HD keyring and is the trusted source for this repair.
- The metadata service stores encrypted secret metadata. Its item order and classification fields must be checked against the local primary SRP before they are changed.
- Secret values must remain in memory only for the comparison and must never be written to logs, analytics, Sentry events, or repair state.

### Threats and required protections

- **Selecting the wrong primary SRP:** A v1 timestamp or an incorrect v2 `PrimarySrp` label could cause an imported SRP to be selected. Compare remote mnemonic values with the local primary SRP and fail closed when the result is ambiguous. The local primary SRP is the only value that may be promoted to `PrimarySrp`.
- **Creating duplicate or conflicting records:** A retry or repair could add another primary item or assign `PrimarySrp` to the wrong item. Before writing migrated v2 metadata, compare every remote mnemonic with the primary SRP from the local first HD keyring. Only the matching item may be assigned `dataType: PrimarySrp`; other mnemonics must remain imported SRPs. After writing, verify that exactly one item has `dataType: PrimarySrp` and exactly one item matches the local primary SRP. These must be the same item.
- **Concurrent changes:** Another operation could change the metadata after the repair reads it. Keep the read, plan, and write under the metadata lock where supported, then fetch the metadata again and verify it before reporting success. **If required, block the UI too.**
- **Partial or uncertain writes:** A network failure may occur after the service applies a write. Treat the repair as incomplete until a later fetch confirms the final state. Persist only a pending or incomplete repair status and make the next attempt safe to retry.
- **Malformed or unsupported metadata:** Corrupt or unexpected metadata could cause the repair to classify an item incorrectly. Validate each item and stop without writing when it cannot be safely interpreted.
- **Secret leakage through diagnostics:** Raw SRPs, decrypted payloads, encryption keys, and authentication keys must not appear in logs, errors, analytics, or Sentry events. Telemetry should contain only non-sensitive outcomes such as the detected shape, item counts, failure category, and repair status.
- **Repeated repair attempts:** A persistent failure could cause repeated writes or excessive requests. Store the repair status, make each operation idempotent, and use the existing endpoint rate limits and bounded retry behavior.

The repair must fail closed: when account ownership, primary-SRP matching, metadata parsing, or final verification cannot be established, it must not claim success or make an unverified change.

## Goals

- Safely identify accounts that need repair before changing remote secret metadata.
- Restore a missing or mismatched primary SRP using the trusted local copy, without creating a duplicate.
- Complete migration of v1 secret metadata to v2.
- Verify the repaired remote state before reporting success.
- Make the repair safe to retry and leave unresolved accounts unchanged.



## Repair workflow

The repair check runs when a social-login user unlocks the wallet or adds a new secret.

1. Identify whether the account needs repair.
2. If needed, use the local primary SRP as the source of truth and update the remote secret metadata.
3. Migrate any v1 secret metadata to v2.
4. Fetch the remote secret metadata again and verify that the primary SRP and migration are correct.
5. Mark the repair as complete only after verification. If a step fails, leave the repair safe to retry.

The local primary SRP is prioritized because the repair is performed from a wallet that has already been unlocked locally. The remote secret metadata is the state being repaired and may contain the result of an incomplete earlier operation.

## Detailed design



### 1. Identify affected accounts

At social-login unlock or before adding a new secret, read the local backup state and fetch the remote secret metadata. The local wallet state must be available so that the repair has a trusted primary SRP to use.

The cases handled by this design are different shapes of the same problem: the remote secret metadata does not identify the local primary SRP correctly. The shape determines how the issue is detected and repaired.

#### Common cause

During the failed initialisation flow, the primary SRP can be written under the first TOPRF key while the key shares fail to persist. A retry can then create and persist a second TOPRF key without writing the primary SRP again. Later imported secrets are written under the second key.

The different remote secret metadata shapes described below can result from this incomplete initialisation, especially when later migration or password-change operations process the data.

#### 1. All private keys

When the user recovers with the second key, the remote secret metadata contains only private keys and no primary SRP. This is the clearest case to detect: all returned secret items are `PrivateKeys` and the primary SRP is missing.

Confirm this case by checking that the local primary SRP is available. If it is not available, the account cannot be automatically repaired.

#### 2. v1 imported SRP and private keys

In v1, both the primary SRP and imported SRPs have the type `Mnemonic`. There is no field that says which mnemonic is the primary SRP.

This shape normally exists before v1 migration has completed. It can also remain after migration fails or only partially completes, or be created again by an older client that writes v1 secret metadata. Once migration completes successfully, the items should be v2; an incorrect primary classification then appears as the v2 shape described below.

The v1 logic uses the oldest client creation time to choose the primary SRP. If an imported SRP has an earlier timestamp—for example because of clock differences, timestamp collisions, or the order in which items were added—it can be treated as the primary SRP instead of the local primary SRP.

Another case occurs when the actual primary SRP was never stored remotely. After the user adds one or more imported SRPs, the remote v1 secret metadata may contain only imported SRPs. The imported SRP with the earliest timestamp can then be incorrectly treated as the primary SRP.

To detect this case, compare the local primary SRP with every remote v1 mnemonic using the secret value or its hash. Do not assume that the first v1 mnemonic is the primary SRP:

- If a remote mnemonic matches the local primary SRP, that item is the actual primary candidate.
- If no remote mnemonic matches the local primary SRP, the primary SRP is missing from the remote secret metadata.



#### 3. v2 incorrectly labels an item as `PrimarySrp`

The remote secret metadata contains only v2 items, but the item labelled `PrimarySrp` is not the local primary SRP. In this case, the local primary SRP remains in the local v1 representation while all remote items have been migrated to v2. The other remote items may be imported SRPs or private keys.

This shape can be created or preserved when:

- A v2 migration selected the wrong mnemonic and wrote `dataType: PrimarySrp` for it.
- An older password-change flow reordered legacy items before they were classified.
- A password change copied an already incorrect v2 `PrimarySrp` designation to the new secret metadata.

To detect this case, compare the remote v2 `PrimarySrp` with the local primary SRP using the secret value or its hash. If they differ, search the other remote mnemonic items for the local primary SRP. A matching item identifies the actual primary candidate; if no item matches, the local primary SRP is missing from the remote secret metadata.

### 2. Restore the primary SRP

Use the local primary SRP to repair the remote secret metadata:

- If the remote primary SRP is missing, add the local primary SRP as `PrimarySrp`.
- If the remote primary SRP differs, update the remote secret metadata to use the local primary SRP as `PrimarySrp`.

The repair must keep one primary SRP and must not create an additional primary record.

### 3. Migrate v1 secret metadata

After the primary SRP is restored, migrate the account's v1 secret metadata to v2. The migration must finish for all v1 items before the repair is reported as complete.

Before saving the migrated items, compare every remote mnemonic with the primary SRP from the local first HD keyring. Assign `PrimarySrp` only to the matching item, assign imported-SRP classification to the other mnemonics, and assign imported-private-key classification to private-key items. Then write the v2 metadata and verify the result.

The detailed rules for v1 and v2 secret metadata are defined in the version-aware repair section.

### 4. Verify the repair

Fetch the remote secret metadata again after the writes. Verify that:

- The primary SRP is present and matches the local primary SRP.
- Exactly one item has `dataType: PrimarySrp`.
- Exactly one item matches the local primary SRP value, and it is the item marked `PrimarySrp`.
- All expected secret metadata items are still present.
- All eligible v1 items have been migrated to v2.
- The final number of secret metadata items is at least the original remote count, plus one if the primary SRP was missing and had to be added.



### 5. Handle failures and retries

Only report a successful repair after every verification check passes. If any step fails, do not mark the repair as complete.

Running the repair again must inspect the current state and continue from there without creating duplicate records or repeating completed work.

## Version-aware repair

The repair supports both v1 and v2 remote secret metadata. The repair must use the rules for the format returned by the metadata service.

### v1 secret metadata

For v1 items, use the encrypted `type` and client creation time to identify mnemonics and private keys. Compare every v1 mnemonic with the local primary SRP instead of relying only on the oldest item.

If a v1 mnemonic matches the local primary SRP, assign `PrimarySrp` to that item and assign the imported SRP type to the other mnemonics. If no v1 mnemonic matches, add the local primary SRP as a new v2 `PrimarySrp` item and assign the imported SRP type to all existing mnemonics. Assign the imported private-key type to private-key items.

After classification, migrate every v1 item to v2.

### v2 secret metadata

For v2 items, use the explicit `dataType` field. The remote item marked `PrimarySrp` must still be compared with the local primary SRP.

If the v2 `PrimarySrp` is incorrect, mark the item that matches the local primary SRP as `PrimarySrp` and update the incorrect item to its imported type. If no remote item matches the local primary SRP, add it as a new v2 `PrimarySrp` item.

## Acceptance criteria

The repair is successful when:

- The local primary SRP is present in the remote secret metadata as `PrimarySrp`.
- The remote `PrimarySrp` matches the local primary SRP.
- The completed v2 secret metadata contains exactly one `PrimarySrp` item and exactly one item matching the local primary SRP value, and they are the same item.
- All original secret metadata items are still present.
- All eligible v1 items have been migrated to v2.
- The final number of secret metadata items is at least the original remote count, plus one when the primary SRP was missing.
- The repair can be run again without creating duplicates or changing a healthy account.
- A failed repair is not reported as successful.



## Risks and open questions

The repair is a sequence of reads and writes rather than one atomic operation. The questions below must be answered before implementation. Each question includes a placeholder for the design decision.

### Repair trigger and boundaries

**Risk:** The repair may run at the wrong point in the unlock or secret-add flow. A normal fetch or migration can fail before the repair gets a chance to inspect the remote secret metadata.

1. When exactly should the repair run: during social-login unlock, before adding a new secret, after a known fetch or migration failure, or at another point?
  We have two entry points for the repair
  - After normal wallet unlock, i.e. after `submitPassword`
  - When user adds new Secret data, clients should call to repair method before password outdated check
2. Does the repair run only on an existing device where the local wallet is already available? How should a new-device recovery attempt be handled when the remote primary SRP is missing?
  We can only do repair on the existing device which user still has the wallet access. For the new devices or locked devices, the recovery process will be via the Support team.



### Identifying the correct primary SRP

**Risk:** The repair could select the wrong local or remote mnemonic and overwrite valid remote metadata.

1. What is the exact source of the local primary SRP: the active wallet, the primary keyring, a keyring ID, or another controller state value?
  First HD Keyring. We can export the first HD Keyring and add to the remote secret metadata as Primary SRP.
2. Should the comparison use a hash of the raw SRP bytes?
  Raw bytes could be suffice, as at the time of comparison wallet is unlocked.
3. What should happen if the same local primary SRP appears in remote item?
  Do nothing. Users' state is not corrupted.
4. What should happen if no remote mnemonic matches the local primary SRP?
  Add the local PrimarySRP to the remote metadata as remote PrimarySRP.
5. If the remote primary SRP differs from the local one, should the repair always replace the remote classification, or are there conditions where it should stop for manual recovery?
  This should only occurs in the affected user/device. After repair, local one become the Primary SRP for both local and remote. The previous remote PrimarySRP is re-categorized as Imported SRP.



### Remote secret metadata shapes and versions

**Risk:** The repair may misidentify the remote shape and apply the wrong repair steps.

1. For the all-private-keys shape, how do we distinguish the known incomplete-initialisation case from a response fetched with the wrong TOPRF key or scope?
  As long as the local Primary SRP is not in the response, we can safely adds it to the secret metadata as Primary SRP. One thing we have to note is that metadata service do not write the secret metadata, it only stores.
2. If a v2 item is marked `PrimarySrp` but contains a different mnemonic, should the repair update only its `dataType`, or should it also update other metadata fields?
  The repair should **ONLY** updates the incorrectly labelled remote PrimarySRP, by chaning it's dataType to `ImportedSrp`. The local one will be added as v2 PrimarySRP.
3. Are there any v1 item types other than mnemonics and private keys that the repair must preserve or report as unsupported?
  There's an another item which isn't secret but a Password Change item (`PW_BACKUP`). However, the password change item is filtered by TOPRF SDK and never reach to the Controller.
4. Is `PW_BACKUP` always excluded from repair and item-count verification, even if it is returned by a lower-level metadata API?
  YES.



### Partial writes and stale state

**Risk:** A failure between operations can leave remote secret metadata partially repaired while local state still describes the previous state. A timeout can also leave the write result unknown.

1. What should happen if adding or updating `PrimarySrp` succeeds but v1 migration fails?
  The process is marked as **NOT COMPLETED** and will retry again.
2. What should happen if migration succeeds but the final verification fetch fails?
  The process is marked as **NOT COMPLETED** and will retry again. When retry we will get to know if the remote metadata is actually correct.
3. How should the repair distinguish a failed write from a write that succeeded but whose response was lost?
  The partial response lost isn't possible. The whole secret metadata includes in single response.
4. Do the metadata-service batch operations provide the atomicity needed for the repair, or must the client support partially applied batches?
  We can actually just single write the new PrimarySRP to metadata service. Under the same unlocked wallet, the new PrimarySRP will be written with the latest TORF key in the local which is same as the latest remote key.
5. Should the repair acquire one metadata lock for the complete read, plan, write, and verification sequence?
  Definitely YES. Even though, the affected user can only be active on **ONE DEVICE**, we should always have lock.
6. If the repair is interrupted after some items are migrated, how does the next attempt identify completed work and continue safely?
  Repair or Migration runs in the single operation, i.e. single network call. If network response is lost, we can verify by fetching the metadata again.
7. Where is the repair progress stored? Can the repair rely only on the remote metadata, or is a local repair state required?
  Repair progress will be stored under the persisted Controller state. Repair relies on both local and remote metadata.



### Client behavior

**Risk:** A repair failure can affect wallet unlock, wallet rehydration, or adding a new secret differently across clients.

1. If repair fails during an existing-wallet unlock, should the user still be allowed to unlock and use the wallet while repair remains pending?
  Even though we should never block user wallet access, the repair process here is very critical. We might want to block the user and retry it.
2. If repair fails before adding a new secret, should the add operation be blocked or should the secret be added and repair retried later?
  If repair failed, the next operation will be blocked.
3. Should repair run before normal migration so that `runMigrations` never sees the corrupted shape?
  Repair should run **before any TOPRF operations**.
4. When the local migration version says migration is complete but the remote secret metadata still contains v1 items, which state takes precedence?
  After successful repair, there should not be any v1 items left.
5. What user-visible state or telemetry indicates that repair is pending, failed, or complete?
  We will have the new controller state which is persisted and will be inclued in the debug snapshots or state exports.



### Security and operations

**Risk:** Repair has access to the local primary SRP and can change encrypted remote secret metadata. An incorrect trigger, account scope, or log could expose sensitive information or modify the wrong account.

1. How do we verify that the authenticated user, local wallet, TOPRF key, and remote secret metadata all belong to the same account before writing?
  During unlock, the users have to unlock both Keyring and Seedless vault (existing behavior). We can assume that user is the authenticated user providing their correct password.
2. Do we need a feature flag, kill switch, rollout percentage, or server-side rate limit for production repair?
  We don't need a feature flag. But we will have metrics and analytics to see how many users are affected. For ratelimit, we already applied relevant rate-limitting policies for every endpoint.
3. How will support and operations identify a repaired account without exposing secret values?
  Metrics and analytics.



### Testing and rollout

**Risk:** The repair may pass the known incident test but fail for another ordering, version, or interruption pattern.

1. Which tests must cover each of the three remote metadata shapes, including the case where the local primary SRP remains v1 while all remote items are v2?

All PrivateKey responses

- Assert that local state must be number of privatekeys + 1 (local Primary SRP)
- Assert that all Private Keys are v1 items (Just for the sanity check that migration did not run on the Private Keys items)
- After reconciling the Primary SRP, re-asserts that the updated secret metadata includes the Primary SRP as first item in the array
- Run the migration
- Refetch from the metadata service, to assert that the metadata is updated with correct primary SRP

  v1 Imported SRP and Private keys
    - Assert that local state must be number of secret items + 1 (local Primary SRP)
    - Assert that all items are v1.
    - Assert that local Primary SRP doesn't match any Mnemonic item in the metadata service response
    - After reconciling the Primary SRP, re-asserts that the updated secret metadata includes the Primary SRP as first item in the array
    - Run the migration
    - Verify the repair by asserting the latest metadata response has the local Primary SRP

  v2 incorrectly labels an item as `PrimarySrp`

- Assert that local state must be number of secret items + 1 (local Primary SRP)
- Assert that all remote items are v2.
- Compare the remote v2 PrimarySRP with the local Primary
- If different, local Primary should be migrated to v2 item as v2 PrimarySRP item
- The previous remote v2 Primary should be re-labelled as ImportedSrp
- Batch update the two items
- Verify the lastest metadata response

1. Which failures must be injected between every read, write, and verification step?
  *[TBD]*
2. How do we verify that healthy accounts are not changed?
  Assert that the remote data before and after repair, must be the same.
3. What is the rollout and monitoring plan for identifying affected production users and measuring repair success?
  As soon as the design is reviewed, we will priortize the developement, and will release to the PROD as soon as possible. With the relevant analytics and sentry reporting, we will identify the repair progress.
