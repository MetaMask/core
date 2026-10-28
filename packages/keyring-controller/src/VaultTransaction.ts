import type { EthKeyring } from '@metamask/keyring-internal-api';
import { cloneDeep } from 'lodash-es';

import type {
  CachedEncryptionKey,
  KeyringEntry,
  KeyringMetadata,
  SerializedKeyring,
} from './KeyringController.js';

/**
 * The scope of a vault transaction: what it owns — and therefore what it
 * restores on failure. Everything outside the scope is untouched, even on
 * failure: instances, references, and all.
 */
export type TransactionScope = WalletTransactionScope | KeyringTransactionScope;

/**
 * The wallet transaction scope: the transaction owns the whole wallet —
 * all keyrings, the unsupported keyrings, and the encryption key.
 */
export type WalletTransactionScope = {
  type: 'wallet';
  /**
   * Decides, when the transaction commits, whether the vault is written —
   * possibly preparing the write first (e.g. re-deriving the encryption
   * key). The session-change status is given as a lazy check, so that
   * policies that ignore it never pay for it.
   */
  persist: VaultPersistPolicy;
};

/**
 * The wallet-scope persist policy: answers, when the transaction commits,
 * whether the vault is written.
 *
 * The standard policy persists only when the session state changed since
 * `begin()`; other flows force the write, decline it, or gate it on their
 * own criterion.
 */
export type VaultPersistPolicy = (
  hasChanged: () => Promise<boolean>,
) => boolean | Promise<boolean>;

/**
 * The keyring transaction scope: the transaction owns a single keyring
 * entry, selected or created before the transaction began.
 */
export type KeyringTransactionScope = {
  type: 'keyring';
  /**
   * The operated keyring entry.
   */
  entry: KeyringEntry;
  /**
   * Whether the transaction created the operated keyring entry.
   */
  created: boolean;
};

/**
 * The live vault session state the transactions operate on: what the
 * transaction snapshots at `begin()`, mutates through, and restores on
 * `rollback()`. The controller owns the real state and implements this
 * interface; every member reads or rewrites the state it owns.
 */
export type VaultSession = {
  /**
   * The keyrings currently registered, as a fresh array: mutations go
   * through the other members.
   */
  getKeyrings(): KeyringEntry[];
  /**
   * Replace the registered keyrings wholesale.
   */
  replaceKeyrings(keyrings: KeyringEntry[]): void;
  /**
   * Remove the given entry from the registered keyrings, without touching
   * the others. A no-op for an entry that is not registered: a missing
   * entry must never fall back to another position.
   *
   * @returns Whether the entry was registered.
   */
  removeKeyring(entry: KeyringEntry): boolean;
  /**
   * Insert the given entry at the given position in the registered
   * keyrings.
   */
  insertKeyringAt(index: number, entry: KeyringEntry): void;
  /**
   * The unsupported keyrings currently parked, as a fresh array.
   */
  getUnsupportedKeyrings(): SerializedKeyring[];
  /**
   * Replace the unsupported keyrings wholesale.
   */
  setUnsupportedKeyrings(keyrings: SerializedKeyring[]): void;
  /**
   * Park the given serialized keyring in the unsupported keyrings.
   */
  parkUnsupportedKeyring(keyring: SerializedKeyring): void;
  /**
   * The cached encryption key, if any.
   */
  getEncryptionKey(): CachedEncryptionKey | undefined;
  /**
   * Set, or clear, the cached encryption key.
   */
  setEncryptionKey(key: CachedEncryptionKey | undefined): void;
};

/**
 * The controller-owned primitives the transactions drive: building new
 * keyring entries, and enforcing the no-duplicate-accounts invariant on an
 * explicit list of keyrings.
 */
export type VaultOperations = {
  /**
   * Build a keyring entry from its serialized parts, without registering
   * it.
   */
  createKeyring(
    type: string,
    data?: unknown,
    metadata?: KeyringMetadata,
  ): Promise<KeyringEntry>;
  /**
   * Assert that the given keyrings hold no duplicate account.
   *
   * @throws If the keyrings hold a duplicate account.
   */
  assertNoDuplicateAccounts(keyrings: EthKeyring[]): Promise<void>;
  /**
   * Update the vault with the current session state.
   */
  updateVault(): Promise<boolean>;
};

/**
 * A serialized keyring snapshot, with the keyring's position in the
 * keyrings array at the time the snapshot was taken, and the keyring entry
 * itself, resolving the snapshot back to its keyring by identity — never
 * by metadata id, which corrupted vaults may duplicate.
 */
type KeyringSnapshot = SerializedKeyring & {
  entry: KeyringEntry;
  index: number;
};

/**
 * The wallet-scope restore point: pre-transaction snapshots of all keyrings
 * plus the wholesale-captured session state. Unsupported keyrings hold no
 * keyring instances, so they are captured and restored wholesale.
 */
type WalletSnapshot = {
  keyrings: KeyringSnapshot[];
  unsupportedKeyrings: SerializedKeyring[];
  encryptionKey?: CachedEncryptionKey;
};

/**
 * The context of an in-flight vault transaction.
 *
 * Every mutation of the vault session runs inside a transaction, created
 * before the mutation begins. The transaction states what it owns — its
 * scope — and tracks what the mutation did to what it owns: `begin()`
 * takes the snapshot that defines the restore point, `rollback()` restores
 * exactly what the scope owns on failure, `hasChanged()` answers whether
 * the scope changed, and `commit()` persists what it owns when its scope
 * says so — the wallet scope's persist policy decides, the keyring scope
 * persists iff the operated keyring changed.
 *
 * ## Contract
 *
 * 1. Every mutation runs inside a transaction. The transaction snapshots
 *    exactly what it owns, before any mutation.
 * 2. On failure, the transaction restores exactly what it owns.
 *    Everything outside its scope is untouched — instances, references,
 *    and all.
 * 3. Mutations made outside a transaction (e.g. through instances handed
 *    out by deprecated direct-access getters) are undefined behavior — a
 *    bug in the caller, not an input the transaction defends against. The
 *    transaction does not reconcile them, and must not amplify them.
 * 4. On success, nothing is destroyed or rebuilt; instances survive in
 *    place and references remain valid.
 * 5. When a rebuild is necessary (failure path only), every instance that
 *    must make way for it is destroyed before the replacement is created,
 *    as it must release the resources shared with the replacement (e.g.
 *    the SDK singleton of hardware keyrings) before the replacement is
 *    initialized: the stale instance being replaced, and — on the
 *    wallet-scope rollback — every instance the failed transaction
 *    created, before any keyring is rebuilt.
 *
 * The transaction is also the home of the data it accumulates about
 * itself, which must not outlive it: the keyring instances it destroyed,
 * including partially destroyed ones — destruction releases resources
 * that `serialize()` does not capture (e.g. the bridge of a hardware
 * keyring), so a rollback must rebuild a destroyed instance even when its
 * serialized state still matches its snapshot.
 */
export class VaultTransaction {
  readonly #scope: TransactionScope;

  readonly #session: VaultSession;

  readonly #operations: VaultOperations;

  readonly #destroyedKeyrings = new WeakSet<EthKeyring>();

  #walletSnapshot?: WalletSnapshot;

  #keyringSnapshot?: KeyringSnapshot;

  /**
   * @param scope - What the transaction owns.
   * @param session - The vault session state the transaction operates on.
   * @param operations - The controller-owned primitives the transaction
   *   drives.
   */
  constructor(
    scope: TransactionScope,
    session: VaultSession,
    operations: VaultOperations,
  ) {
    this.#scope = scope;
    this.#session = session;
    this.#operations = operations;
  }

  /**
   * What the transaction owns — and therefore what it restores on failure.
   *
   * @returns The transaction scope.
   */
  get scope(): TransactionScope {
    return this.#scope;
  }

  /**
   * Take the pre-mutation snapshot that defines the restore point: every
   * keyring of the wallet for the wallet scope, the operated keyring for
   * the keyring scope (skipped when the transaction created it), plus the
   * wholesale-captured session state.
   *
   * Must be called once, before the transaction's first mutation; a
   * failure leaves the session untouched.
   */
  async begin(): Promise<void> {
    const { type } = this.#scope;

    if (type === 'wallet') {
      const keyrings = this.#session.getKeyrings();
      this.#walletSnapshot = {
        keyrings: await Promise.all(
          keyrings.map((entry) => this.#snapshotKeyring(entry, keyrings)),
        ),
        unsupportedKeyrings: cloneDeep(this.#session.getUnsupportedKeyrings()),
        encryptionKey: cloneDeep(this.#session.getEncryptionKey()),
      };
      return;
    }

    if (!this.#scope.created) {
      this.#keyringSnapshot = await this.#snapshotKeyring(
        this.#scope.entry,
        this.#session.getKeyrings(),
      );
    }
  }

  /**
   * Check whether what the scope owns has changed since `begin()`.
   *
   * For the keyring scope, the operated keyring is resolved by identity:
   * another keyring sharing its id must not affect the decision. For the
   * wallet scope, the whole session state — the serialized keyrings, the
   * unsupported keyrings, and the encryption key — is compared against the
   * state captured at `begin()`.
   *
   * @returns Whether the scope has changed.
   */
  async hasChanged(): Promise<boolean> {
    const scope = this.#scope;

    if (scope.type === 'wallet') {
      return this.#hasWalletChanged();
    }

    const { entry, created } = scope;
    const exists = this.#session.getKeyrings().includes(entry);

    // A keyring created by the transaction is a change — unless the
    // transaction drained it right away, leaving the session as it was
    // before the keyring existed.
    if (created) {
      return exists;
    }

    // The operated keyring was removed by the drained-keyring cleanup.
    if (!exists) {
      return true;
    }

    return !(await this.#isUnchanged(entry, this.#requireKeyringSnapshot()));
  }

  /**
   * Persist what the scope owns, iff it changed: the keyring scope
   * persists the vault when the operated keyring changed, and the wallet
   * scope when its persist policy says so.
   *
   * Must be called while the controller mutex is held, after `begin()` and
   * a successful operation.
   */
  async commit(): Promise<void> {
    const scope = this.#scope;

    if (scope.type === 'keyring') {
      if (await this.hasChanged()) {
        await this.#operations.updateVault();
      }
      return;
    }

    if (await scope.persist(() => this.hasChanged())) {
      await this.#operations.updateVault();
    }
  }

  /**
   * Restore what the scope owns from the snapshot taken at `begin()`:
   * every keyring of the wallet, plus the unsupported keyrings and the
   * encryption key, for the wallet scope; the single operated keyring for
   * the keyring scope. Everything outside the scope is untouched.
   *
   * Must be called while the controller mutex is held, and only after
   * `begin()`.
   */
  async rollback(): Promise<void> {
    const scope = this.#scope;

    if (scope.type === 'wallet') {
      await this.#rollbackWallet();
      return;
    }

    await this.#rollbackKeyring(scope);
  }

  /**
   * Destroy the given keyring entry's instances, marking the keyring as
   * destroyed by this transaction — even when the destruction fails
   * partway, as the rollback must rebuild it rather than keep it, whatever
   * resources it already released.
   *
   * @param entry - The keyring entry to destroy.
   * @param options - Destroy options.
   * @param options.ignoreErrors - Whether to log destruction errors
   *   instead of throwing them: a rollback must not let them mask the
   *   transaction's own error.
   */
  async destroy(
    entry: KeyringEntry,
    { ignoreErrors }: { ignoreErrors: boolean } = { ignoreErrors: false },
  ): Promise<void> {
    try {
      await entry.keyring.destroy?.();
      await entry.keyringV2?.destroy?.();
    } catch (error) {
      if (!ignoreErrors) {
        throw error;
      }
      console.error(error);
    } finally {
      this.#destroyedKeyrings.add(entry.keyring);
    }
  }

  /**
   * Check whether the given keyring entry's keyring was destroyed during
   * this transaction, including partially: such a keyring must be treated
   * as changed by the transaction, and rebuilt on rollback, even when its
   * serialized state still matches its snapshot.
   *
   * @param entry - The keyring entry to check.
   * @returns Whether the entry's keyring was destroyed.
   */
  isDestroyed(entry: KeyringEntry): boolean {
    return this.#destroyedKeyrings.has(entry.keyring);
  }

  /**
   * Remove the given keyring entry from the session keyrings, destroying
   * its instances. A no-op for an entry that is not registered: a missing
   * entry must never fall back to another position.
   *
   * @param entry - The keyring entry to remove.
   */
  async remove(entry: KeyringEntry): Promise<void> {
    if (this.#session.removeKeyring(entry)) {
      await this.destroy(entry);
    }
  }

  /**
   * Take a snapshot of the given keyring entry, to roll back to.
   *
   * @param entry - The keyring entry.
   * @param keyrings - The keyrings the entry is registered in, resolving
   *   the entry's position.
   * @returns The keyring snapshot.
   */
  async #snapshotKeyring(
    entry: KeyringEntry,
    keyrings: KeyringEntry[],
  ): Promise<KeyringSnapshot> {
    // Cloned, as keyrings may return aliased internal state from
    // `serialize()`.
    return {
      entry,
      index: keyrings.indexOf(entry),
      type: entry.keyring.type,
      data: cloneDeep(await entry.keyring.serialize()),
      metadata: { ...entry.metadata },
    };
  }

  /**
   * Reconcile the keyrings in memory with the pre-transaction snapshot,
   * touching only the keyrings that the failed transaction changed.
   *
   * The keyrings created by the failed transaction are destroyed first, as
   * they may hold the shared resources (e.g. the SDK singleton of hardware
   * keyrings) that the recreations below need to acquire. The snapshot is
   * then walked in order, preserving the keyring order: unchanged keyrings
   * keep their instances, mutated keyrings are rebuilt in place, and
   * removed keyrings are recreated at their snapshot position. A stale
   * instance is always destroyed before its replacement is created, as it
   * must release the resources shared with the replacement before the
   * replacement is initialized.
   */
  async #rollbackWallet(): Promise<void> {
    const snapshot = this.#requireWalletSnapshot();

    // Keyrings and encryption credentials are restored to their previous
    // state.
    this.#session.setEncryptionKey(snapshot.encryptionKey);

    // Restored wholesale before the walk: this undoes any parking
    // performed by the failed transaction, while keyrings the walk fails
    // to recreate are parked on top.
    this.#session.setUnsupportedKeyrings(snapshot.unsupportedKeyrings);

    // The keyrings live at the time of the rollback, before the walk
    // replaces them below.
    const oldKeyrings = this.#session.getKeyrings();

    // Whatever is not in the snapshots was created by the failed
    // transaction: destroyed before the walk, as the leftovers may hold
    // the shared resources (e.g. the SDK singleton of hardware keyrings)
    // that the recreations below need to acquire, and dropped by the
    // single keyrings assignment at the end of the walk. Destruction
    // failures must not mask the transaction's error.
    const snapshotEntries = new Set(
      snapshot.keyrings.map((keyringSnapshot) => keyringSnapshot.entry),
    );
    for (const leftover of oldKeyrings.filter(
      // Keyring entries that are not present in the snapshots, i.e.,
      // created by the failed transaction, so we need to destroy and drop
      // them.
      (old) => !snapshotEntries.has(old),
    )) {
      await this.destroy(leftover, { ignoreErrors: true });
    }

    // Built locally, and assigned once after the reconciliation: readers
    // never observe a partially reconciled list, while duplicate account
    // checks during recreation only consider already reconciled keyrings.
    const reconciled: KeyringEntry[] = [];

    for (const keyringSnapshot of snapshot.keyrings) {
      const old = keyringSnapshot.entry;

      if (!oldKeyrings.includes(old)) {
        // Removed and destroyed by the transaction: rebuilt from its
        // snapshot, at its original position.
        const entry = await this.#recreate(undefined, keyringSnapshot, {
          duplicateCheckBase: reconciled,
        });
        if (entry) {
          reconciled.push(entry);
        }
        continue;
      }

      if (await this.#isUnchanged(old, keyringSnapshot)) {
        // The transaction did not change the keyring: keep the old
        // instance.
        reconciled.push(old);
        continue;
      }

      // The transaction mutated the keyring: rebuilt from its snapshot,
      // the stale instance destroyed by the recreation itself.
      const entry = await this.#recreate(old, keyringSnapshot, {
        duplicateCheckBase: reconciled,
      });
      if (entry) {
        reconciled.push(entry);
      }
    }

    // Assigned once, after the reconciliation: everything outside
    // observed a complete list — the pre-rollback one until now, the
    // reconciled one from here on.
    this.#session.replaceKeyrings(reconciled);
  }

  /**
   * Restore the keyring entry operated on by a failed keyring-scoped
   * transaction from its snapshot, touching no other keyring: a keyring
   * created by the transaction is destroyed and dropped, and an existing
   * keyring is always rebuilt from its snapshot — whether or not the
   * transaction changed or removed it — so that state `serialize()` does
   * not capture is reset too, and the stale instance is detached from any
   * of the operation's mutations still landing on it.
   *
   * @param scope - The keyring scope of the failed transaction, holding
   *   the operated entry and whether the transaction created it.
   */
  async #rollbackKeyring(scope: KeyringTransactionScope): Promise<void> {
    const { entry, created } = scope;

    if (created) {
      // The failed transaction created the keyring: destroy it and drop
      // it.
      this.#session.removeKeyring(entry);
      await this.destroy(entry, { ignoreErrors: true });
      return;
    }

    const snapshot = this.#requireKeyringSnapshot();

    // `-1` when the transaction already removed the entry from the
    // keyrings (e.g. the drained-keyring cleanup).
    const keyrings = this.#session.getKeyrings();
    const index = keyrings.indexOf(entry);

    if (index === -1) {
      // The transaction removed the keyring: rebuild it at its original
      // position.
      const newEntry = await this.#recreate(undefined, snapshot);
      if (newEntry) {
        this.#session.insertKeyringAt(snapshot.index, newEntry);
      }
      return;
    }

    // The keyring is always rebuilt on failure, even when its serialized
    // state matches the snapshot: state that `serialize()` does not
    // capture (e.g. the runtime-only state of hardware keyrings) is
    // reset too, and the stale instance is detached from any of the
    // operation's mutations still landing on it. The old entry is removed
    // first, then destroyed by the recreation itself, before its
    // replacement takes back its position.
    this.#session.removeKeyring(entry);
    const newEntry = await this.#recreate(entry, snapshot);
    if (newEntry) {
      this.#session.insertKeyringAt(index, newEntry);
    }
  }

  /**
   * Build a new keyring entry from a keyring snapshot, without updating
   * the session keyrings. The old keyring entry, if any, is destroyed
   * before the replacement is created, as it must release the resources
   * shared with the replacement (e.g. the SDK singleton of hardware
   * keyrings) before the replacement is initialized. On failure, mirrors
   * the controller's keyring restoration: the error is logged and the
   * serialized keyring is parked in the unsupported keyrings.
   *
   * @param old - The old keyring entry replaced by the recreated keyring,
   *   or `undefined` if the transaction already destroyed it.
   * @param snapshot - The keyring snapshot to recreate.
   * @param options - Recreation options.
   * @param options.duplicateCheckBase - The already reconciled keyrings
   *   the recreated keyring is checked against for duplicate accounts;
   *   when omitted, the check is skipped: the wallet-scope rollback checks
   *   against the reconciled-so-far keyrings, while the keyring-scope
   *   rollback owns the only keyring that changed, so a duplicate would
   *   come from a mutation made outside a transaction.
   * @returns The new keyring entry, or `undefined` if it could not be
   *   recreated.
   */
  async #recreate(
    old: KeyringEntry | undefined,
    snapshot: KeyringSnapshot,
    { duplicateCheckBase }: { duplicateCheckBase?: KeyringEntry[] } = {},
  ): Promise<KeyringEntry | undefined> {
    try {
      if (old) {
        await this.destroy(old, { ignoreErrors: true });
      }

      const entry = await this.#operations.createKeyring(
        snapshot.type,
        snapshot.data,
        snapshot.metadata,
      );

      if (duplicateCheckBase) {
        await this.#operations.assertNoDuplicateAccounts([
          ...duplicateCheckBase.map(({ keyring }) => keyring),
          entry.keyring,
        ]);
      }

      return entry;
    } catch (error) {
      console.error(error);
      // Only the serialized keyring is parked: the snapshot position must
      // not leak into the vault.
      this.#session.parkUnsupportedKeyring({
        type: snapshot.type,
        data: snapshot.data,
        metadata: snapshot.metadata,
      });
      return undefined;
    }
  }

  /**
   * Check whether the given keyring entry's serialized state is unchanged
   * relative to the given snapshot. A keyring destroyed during this
   * transaction — even one whose destruction failed partway — and a
   * keyring that cannot be serialized anymore are treated as changed:
   * destruction releases resources that `serialize()` does not capture.
   *
   * @param entry - The keyring entry to check.
   * @param snapshot - The keyring snapshot to check against.
   * @returns Whether the keyring is unchanged.
   */
  async #isUnchanged(
    entry: KeyringEntry,
    snapshot: KeyringSnapshot,
  ): Promise<boolean> {
    if (this.isDestroyed(entry)) {
      return false;
    }

    try {
      return (
        JSON.stringify(await entry.keyring.serialize()) ===
        JSON.stringify(snapshot.data)
      );
    } catch {
      return false;
    }
  }

  /**
   * Check whether the wallet session state changed since the snapshot
   * taken at `begin()`: the serialized keyrings, the unsupported keyrings,
   * and the encryption key are compared, as a whole, against the state
   * captured at `begin()`.
   *
   * @returns Whether the session state changed.
   */
  async #hasWalletChanged(): Promise<boolean> {
    const snapshot = this.#requireWalletSnapshot();

    // The session state at `begin()`, reconstructed from the snapshot.
    const oldState = JSON.stringify(
      this.#sessionStateOf(
        snapshot.keyrings.map(({ type, data, metadata }) => ({
          type,
          data,
          metadata,
        })),
        snapshot.unsupportedKeyrings,
        snapshot.encryptionKey,
      ),
    );

    // The session state now, serialized live.
    const keyrings = this.#session.getKeyrings();
    const serializedKeyrings = await Promise.all(
      keyrings.map(async ({ keyring, metadata }) => ({
        type: keyring.type,
        data: await keyring.serialize(),
        metadata,
      })),
    );

    const newState = JSON.stringify(
      this.#sessionStateOf(
        serializedKeyrings,
        this.#session.getUnsupportedKeyrings(),
        this.#session.getEncryptionKey(),
      ),
    );

    return oldState !== newState;
  }

  /**
   * Assemble the session state from its parts, so that the two sides of a
   * change comparison always take the same shape.
   *
   * @param keyrings - The serialized keyrings.
   * @param unsupportedKeyrings - The unsupported keyrings.
   * @param encryptionKey - The cached encryption key, if any.
   * @returns The session state.
   */
  #sessionStateOf(
    keyrings: SerializedKeyring[],
    unsupportedKeyrings: SerializedKeyring[],
    encryptionKey: CachedEncryptionKey | undefined,
  ): { keyrings: SerializedKeyring[]; encryptionKey?: CachedEncryptionKey } {
    return {
      keyrings: [...keyrings, ...unsupportedKeyrings],
      encryptionKey,
    };
  }

  /**
   * The snapshot of the wallet session, taken at `begin()`.
   *
   * @returns The wallet snapshot.
   */
  #requireWalletSnapshot(): WalletSnapshot {
    if (!this.#walletSnapshot) {
      throw new Error('The wallet transaction was not begun');
    }
    return this.#walletSnapshot;
  }

  /**
   * The snapshot of the operated keyring, taken at `begin()`.
   *
   * @returns The keyring snapshot.
   */
  #requireKeyringSnapshot(): KeyringSnapshot {
    if (!this.#keyringSnapshot) {
      throw new Error('The keyring transaction was not begun');
    }
    return this.#keyringSnapshot;
  }
}
