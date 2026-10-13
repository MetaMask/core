import { KeyringAccount } from '@metamask/keyring-api';
import type { AccountId } from '@metamask/keyring-utils';
import { SnapId } from '@metamask/snaps-sdk';

import type { SnapAccountServiceMessenger } from './SnapAccountService.js';

// Re-define it here to avoid pulling dependency.
type InternalAccount = KeyringAccount & {
  metadata?: {
    snap?: {
      id?: string;
    };
  };
};

/**
 * Cache mapping each Snap-owned account ID to the ID of the Snap that owns
 * it, derived from `AccountsController` state.
 *
 * The cache is built lazily on first use and kept in sync incrementally via
 * `AccountsController:accountsAdded` / `AccountsController:accountsRemoved`
 * events. Calling {@link SnapAccountCache.invalidate} resets the initialized
 * flag so the next use triggers a full rebuild — used on wallet unlock, when
 * changes that occurred while locked are not reflected by those events.
 */
export class SnapAccountCache {
  readonly #messenger: SnapAccountServiceMessenger;

  #entries: Map<AccountId, SnapId> = new Map();

  #initialized = false;

  constructor(messenger: SnapAccountServiceMessenger) {
    this.#messenger = messenger;

    messenger.subscribe('AccountsController:accountsAdded', (accounts) =>
      this.#handleAccountsAdded(accounts),
    );
    messenger.subscribe('AccountsController:accountsRemoved', (accountIds) =>
      this.#handleAccountsRemoved(accountIds),
    );
  }

  /**
   * Invalidates the cache so the next {@link SnapAccountCache.getSnapId} call
   * triggers a full rebuild from `AccountsController` state.
   */
  invalidate(): void {
    this.#initialized = false;
  }

  /**
   * Returns the Snap ID that owns the given account, or `undefined` if the
   * account is not owned by any Snap. Lazily builds the cache on first call
   * after construction or invalidation.
   *
   * @param accountId - The account ID to look up.
   * @returns The Snap ID that owns the account, or `undefined`.
   */
  getSnapId(accountId: AccountId): SnapId | undefined {
    this.#ensureReady();
    return this.#entries.get(accountId);
  }

  /**
   * Builds the cache from `AccountsController` state if it is not already
   * initialized.
   */
  #ensureReady(): void {
    if (this.#initialized) {
      return;
    }
    const state = this.#messenger.call('AccountsController:getState');
    const cache = new Map<AccountId, SnapId>();
    for (const account of Object.values(state.internalAccounts.accounts)) {
      const snapId = account.metadata?.snap?.id;
      if (snapId) {
        cache.set(account.id, snapId as SnapId);
      }
    }
    this.#entries = cache;
    this.#initialized = true;
  }

  /**
   * Adds the given accounts to the cache. No-op when the cache is not yet
   * initialized — the next rebuild will read fresh state instead.
   *
   * @param accounts - The accounts that were added.
   */
  #handleAccountsAdded(accounts: InternalAccount[]): void {
    if (!this.#initialized) {
      return;
    }
    for (const account of accounts) {
      const snapId = account.metadata?.snap?.id;
      if (snapId) {
        this.#entries.set(account.id, snapId as SnapId);
      }
    }
  }

  /**
   * Removes the given account IDs from the cache. No-op when the cache is not
   * yet initialized — the next rebuild will read fresh state instead.
   *
   * @param accountIds - The IDs of the accounts that were removed.
   */
  #handleAccountsRemoved(accountIds: AccountId[]): void {
    if (!this.#initialized) {
      return;
    }
    for (const accountId of accountIds) {
      this.#entries.delete(accountId);
    }
  }
}
