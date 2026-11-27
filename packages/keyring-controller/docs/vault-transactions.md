# Vault transactions and atomic keyrings

This document explains the transaction, rollback, and locking model introduced by
the atomic-keyring PR stack. It describes the combined design, rather than each
intermediate refactor.

**Stack roadmap:** this document starts in [#11119](https://github.com/MetaMask/core/pull/11119),
which introduces `VaultTransaction`. The later PRs move rollback and commit logic
into it, then add atomic keyrings and diagnostics. Those parts describe the
intended combined design, not behavior already implemented in #11119.

## Why change the old model?

A keyring operation can wait on a hardware device, a Snap, or user interaction.
Holding the controller mutex for that entire operation blocks unrelated work.
Meanwhile, rebuilding every keyring after a failure invalidates unrelated
references and can disrupt shared hardware resources.

The design separates two responsibilities:

- **Legacy keyrings:** the controller owns operation isolation, snapshots,
  persistence, and rollback, scoped as narrowly as possible.
- **Atomic keyrings:** the keyring owns operation concurrency and state mutations;
  the controller provides serialized commit windows for writing the vault.

Here, "transaction" means an in-memory restore point and persistence policy, not
a database transaction or a way to undo remote side effects.

## Transaction scopes

[`VaultTransaction`](../src/VaultTransaction.ts) operates on a `VaultSession`
(the controller's live keyrings, unsupported keyrings, and cached encryption key)
through controller-owned `VaultOperations` (creation, validation, and vault writes).

| Scope     | Snapshot                                                      | Commit                                                       | Rollback                                                                   |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `keyring` | Only the selected legacy keyring; none if newly created       | Write the vault if that keyring changed or was added/removed | Rebuild the selected existing keyring, or destroy/drop a newly created one |
| `wallet`  | All keyrings, unsupported keyrings, and cached encryption key | Follow the operation's persistence policy                    | Reconcile the wallet against the snapshot                                  |
| `atomic`  | None                                                          | Persist only a newly created keyring's registration          | Restore nothing                                                            |

The scope limits snapshotting, change detection, and rollback, **not the encrypted
file format**: a vault write still validates and serializes the whole wallet.

For ordinary transactions, the controller holds its mutex while it:

```text
selects/creates and validates → begins transaction → runs operation → commits
                                                        on failure → rolls back
```

Setup and snapshot failures happen before the rollback boundary. In particular,
a failed selection, missing V2 adapter, or failed snapshot must not trigger
rollback of a pre-existing entry without a valid restore point.

Wallet operations use an explicit persistence policy: write when the session
changed, force a write, skip it, or use an operation-specific condition (for
example, an unlock/upgrade decision). `hasChanged` is lazy so policies that do
not need a diff do not pay for it.

## Legacy operations and rollback

`withKeyring` and `withKeyringV2` use the same single-keyring transaction path.
Their callbacks must mutate **only the keyring they receive**. Mutating other
keyrings through cached or deprecated direct-access references is outside this
contract; those mutations are not tracked or rolled back by the scoped transaction.

Snapshots deep-clone serialized data because `serialize()` can return aliases to
live state. Entries are tracked by object identity, not metadata ID: duplicate
IDs in a corrupted vault must not make rollback target the wrong instance.

On success, instances survive in place. A legacy keyring that transitions from
non-empty to empty is removed and destroyed unless it is the primary HD keyring.

On failure:

- **Single-keyring scope:** always rebuild the operated existing keyring, even
  if its serialized data is unchanged. This resets runtime-only state and
  detaches the failed operation's stale instance. Other instances are untouched.
- **Wallet scope:** retain unchanged instances, rebuild changed, removed, or
  destroyed entries, and remove entries created by the failed transaction.
  Restore the cached encryption key and unsupported-keyring snapshot too.

Resource cleanup order matters: destroy transaction-created leftovers before
recreating any wallet keyring, and destroy a stale instance before building its
replacement. Hardware keyrings may share SDK singletons that must be released
first. Even a partially failed destruction marks an instance as needing rebuild.

Recreated keyrings are checked for duplicate accounts: against all remaining
keyrings for a scoped rollback, or the reconciled-so-far list for wallet rollback.
A replacement that fails validation is destroyed. If recreation or validation
fails, its serialized snapshot is parked as unsupported. Already unsupported
keyrings are not retried during rollback. Cleanup/recreation errors are logged
rather than replacing the original operation error.

## Atomic keyring operations

A builder opts in with `atomic: true` and receives a `KeyringBuilderContext`
containing the controller's `update` callback. Its result must carry the SDK's
`AtomicKeyring` brand; the controller rejects a declared-atomic builder returning
a non-atomic instance. Legacy builders continue to receive zero arguments.

`withKeyring` and `withKeyringV2` inspect the **registered underlying keyring**,
not its V2 adapter, to choose the atomic path:

```text
Controller mutex: select/create + validate + persist new registration → release
Keyring operation: acquire own lock → remote/slow work → update → finish
Controller update:                         acquire controller mutex
                                          check registered identity
                                          snapshot wallet → action → commit
                                          release controller mutex
```

The operation runs outside the controller mutex so its `update` can acquire
that same non-reentrant mutex without deadlocking. With `createIfMissing`, the
new keyring is registered and persisted before the operation is dispatched.
Atomic dispatch does not run the legacy post-operation empty-keyring cleanup.

Each `update(keyring, action)` checks that the exact keyring instance is still
registered **after acquiring the mutex**. An update queued behind a wallet lock
or restore cannot commit on behalf of a detached/replaced instance. Adapters
must route updates using the controller-registered identity.

The commit window snapshots the wallet, runs the mutation action, and writes
the vault only if the session changed. It still includes wallet serialization,
validation, and encryption; it is not a constant-time or single-keyring write.
Keep slow work outside the action.

**Atomic does not mean controller-managed rollback.** If the operation fails
after a successful update, that commit remains. If the action throws, its
partial in-memory mutations are not restored and that update does not write
the vault. A vault-write failure likewise propagates without restoring the
mutation. The keyring must define its own consistency and recovery behavior.

Keyring implementations must synchronize their own operations and expose safe
committed-state reads for controller serialization. Do not make serialization
wait for a keyring lock held by an operation awaiting `update`: that reverses
the lock dependency and can deadlock. Unsafe read-only controller access bypasses
the transaction mutex and is not a substitute for a mutation/commit path.

## Lock diagnostics

Enable `DEBUG=metamask:keyring-controller*` to include both namespaces:

- `metamask:keyring-controller`: atomic operation start/finish and full
  `durationMs`, including remote work and internal keyring waits.
- `metamask:keyring-controller:locks`: controller/vault mutex request,
  acquisition, release, and completion, including `waitMs`, `holdMs`, and `totalMs`.
  `atomicUpdate` measures the controller-side commit window, not the full operation.

Events carry correlation IDs and, after selection, keyring type, metadata ID,
and access kind (`v1`, `v2`, or `commit`). V1/V2 describes access, not whether the
keyring is atomic. Logs omit arguments, results, and errors to avoid secrets.
Diagnostics arrive in [#11267](https://github.com/MetaMask/core/pull/11267),
which also adds the README's lock timing reference.

## PR map and implementation

| PR                                                    | Contribution                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| [#10407](https://github.com/MetaMask/core/pull/10407) | Granular rollback and single-keyring snapshot/diff scope       |
| [#11119](https://github.com/MetaMask/core/pull/11119) | Internal `VaultTransaction` abstraction                        |
| [#11127](https://github.com/MetaMask/core/pull/11127) | Rollback owned by `VaultTransaction`                           |
| [#11139](https://github.com/MetaMask/core/pull/11139) | Commit and persistence policies owned by `VaultTransaction`    |
| [#11164](https://github.com/MetaMask/core/pull/11164) | Destroy transaction-created leftovers before recreation        |
| [#11707](https://github.com/MetaMask/core/pull/11707) | Validate rollback replacements and clean up rejected instances |
| [#11241](https://github.com/MetaMask/core/pull/11241) | Atomic builders, unlocked dispatch, and `update` commits       |
| [#11267](https://github.com/MetaMask/core/pull/11267) | Mutex and atomic-operation timing logs                         |

Entry points in [`KeyringController.ts`](../src/KeyringController.ts):
`#withKeyringOrRollback`, `#withTransaction`, `#atomicUpdate`, and `#buildKeyring`.
Rollback and persistence policies live in
[`VaultTransaction.ts`](../src/VaultTransaction.ts); regression coverage lives in
[`VaultTransaction.test.ts`](../src/VaultTransaction.test.ts) and
[`KeyringController.test.ts`](../src/KeyringController.test.ts).
