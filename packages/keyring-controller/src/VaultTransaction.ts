import type { EthKeyring } from '@metamask/keyring-internal-api';

import type { KeyringEntry } from './KeyringController.js';

/**
 * The scope of a vault transaction: what it owns — and therefore what it
 * restores on failure. Everything outside the scope is untouched, even on
 * failure: instances, references, and all.
 */
export type TransactionScope =
  | {
      /**
       * The transaction owns the whole wallet: all keyrings, the
       * unsupported keyrings, and the encryption key.
       */
      type: 'wallet';
    }
  | {
      /**
       * The transaction owns a single keyring entry, selected or created
       * before the transaction began.
       */
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
 * The context of an in-flight vault transaction.
 *
 * Every mutation of the vault session runs inside a transaction, created
 * before the mutation begins. The transaction states what it owns — its
 * scope — and tracks what the mutation did to what it owns. On failure it
 * is the restore point for exactly that; everything outside its scope is
 * untouched.
 *
 * It is also the home of the data a transaction accumulates about itself,
 * which must not outlive it: the keyring instances it destroyed, including
 * partially destroyed ones — destruction releases resources that
 * `serialize()` does not capture (e.g. the bridge of a hardware keyring),
 * so a rollback must rebuild a destroyed instance even when its serialized
 * state still matches its snapshot.
 */
export class VaultTransaction {
  readonly #scope: TransactionScope;

  readonly #destroyedKeyrings = new WeakSet<EthKeyring>();

  /**
   * @param scope - What the transaction owns.
   */
  constructor(scope: TransactionScope) {
    this.#scope = scope;
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
}
