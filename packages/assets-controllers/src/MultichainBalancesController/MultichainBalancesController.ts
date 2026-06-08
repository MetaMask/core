import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerAccountBalancesUpdatesEvent,
} from '@metamask/accounts-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type {
  Balance,
  CaipAssetType,
  AccountBalancesUpdatedEventPayload,
} from '@metamask/keyring-api';
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { Messenger } from '@metamask/messenger';
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { CaipChainId, Json, JsonRpcRequest } from '@metamask/utils';
import type { Draft } from 'immer';

import type {
  MultichainAssetsControllerGetStateAction,
  MultichainAssetsControllerAccountAssetListUpdatedEvent,
} from '../MultichainAssetsController';
import {
  fetchAccountAssetInfoFromSnap,
  filterAssetsForAccountAssetEnrichment,
  isAccountAssetInfoEnrichmentAvailable,
} from '../multichain/accountAssetEnrichment';
import type { AccountAssetInfoExtra } from '../multichain/accountAssetEnrichment';

const controllerName = 'MultichainBalancesController';

/** Per-asset balance row; `extra` carries chain-specific snap enrichment fields. */
export type MultichainAccountBalance = {
  amount: string;
  unit: string;
  extra?: AccountAssetInfoExtra;
};

/**
 * State used by the {@link MultichainBalancesController} to cache account balances.
 */
export type MultichainBalancesControllerState = {
  balances: {
    [account: string]: {
      [asset: string]: MultichainAccountBalance;
    };
  };
};

/**
 * Constructs the default {@link MultichainBalancesController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link MultichainBalancesController} state.
 */
export function getDefaultMultichainBalancesControllerState(): MultichainBalancesControllerState {
  return { balances: {} };
}

/**
 * Returns the state of the {@link MultichainBalancesController}.
 */
export type MultichainBalancesControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MultichainBalancesControllerState
  >;

/**
 * Event emitted when the state of the {@link MultichainBalancesController} changes.
 */
export type MultichainBalancesControllerStateChange =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainBalancesControllerState
  >;

/**
 * Actions exposed by the {@link MultichainBalancesController}.
 */
export type MultichainBalancesControllerActions =
  MultichainBalancesControllerGetStateAction;

/**
 * Events emitted by {@link MultichainBalancesController}.
 */
export type MultichainBalancesControllerEvents =
  MultichainBalancesControllerStateChange;

/**
 * Actions that this controller is allowed to call.
 */
type AllowedActions =
  | SnapControllerHandleRequestAction
  | AccountsControllerListMultichainAccountsAction
  | MultichainAssetsControllerGetStateAction
  | KeyringControllerGetStateAction;

/**
 * Events that this controller is allowed to subscribe.
 */
type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerAccountBalancesUpdatesEvent
  | MultichainAssetsControllerAccountAssetListUpdatedEvent;
/**
 * Messenger type for the MultichainBalancesController.
 */
export type MultichainBalancesControllerMessenger = Messenger<
  typeof controllerName,
  MultichainBalancesControllerActions | AllowedActions,
  MultichainBalancesControllerEvents | AllowedEvents
>;

/**
 * {@link MultichainBalancesController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const balancesControllerMetadata: StateMetadata<MultichainBalancesControllerState> =
  {
    balances: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
  };

/**
 * The MultichainBalancesController is responsible for fetching and caching account
 * balances.
 */
export class MultichainBalancesController extends BaseController<
  typeof controllerName,
  MultichainBalancesControllerState,
  MultichainBalancesControllerMessenger
> {
  constructor({
    messenger,
    state = {},
  }: {
    messenger: MultichainBalancesControllerMessenger;
    state?: Partial<MultichainBalancesControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: balancesControllerMetadata,
      state: {
        ...getDefaultMultichainBalancesControllerState(),
        ...state,
      },
    });

    // Fetch initial balances for all non-EVM accounts
    for (const account of this.#listAccounts()) {
      // Fetching the balance is asynchronous and we cannot use `await` here.
      // eslint-disable-next-line no-void
      void this.updateBalance(account.id);
    }

    this.messenger.subscribe(
      'AccountsController:accountRemoved',
      (account: string) => this.#handleOnAccountRemoved(account),
    );
    this.messenger.subscribe(
      'AccountsController:accountBalancesUpdated',
      (balanceUpdate: AccountBalancesUpdatedEventPayload) => {
        this.#handleOnAccountBalancesUpdated(balanceUpdate);
        // eslint-disable-next-line no-void
        void this.#enrichBalancesAfterAccountBalancesUpdated(balanceUpdate);
      },
    );

    this.messenger.subscribe(
      'MultichainAssetsController:accountAssetListUpdated',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ assets }) => {
        const updatedAccountAssets = Object.entries(assets).map(
          ([accountId, { added, removed }]) => ({
            accountId,
            added: [...added],
            removed: [...removed],
          }),
        );

        await this.#handleOnAccountAssetListUpdated(updatedAccountAssets);
      },
    );
  }

  /**
   * Reconciles cached balances after a multichain asset-list update event.
   *
   * The event payload is treated as a delta:
   * - balances for `removed` assets are deleted so stale entries cannot remain
   * - balances for `added` assets are fetched from the snap and merged in
   * - if an added asset is not returned by the snap, a zero placeholder is stored
   *   so the asset can still be represented in state
   *
   * @param accounts - The per-account asset deltas from the asset-list update event.
   */
  async #handleOnAccountAssetListUpdated(
    accounts: {
      accountId: string;
      added: CaipAssetType[];
      removed: CaipAssetType[];
    }[],
  ): Promise<void> {
    const { isUnlocked } = this.messenger.call('KeyringController:getState');

    if (!isUnlocked) {
      return;
    }
    const balancesToAdd: MultichainBalancesControllerState['balances'] = {};

    for (const { accountId, added } of accounts) {
      if (added.length === 0) {
        continue;
      }

      const account = this.#getAccount(accountId);
      if (account.metadata.snap) {
        const accountBalance = await this.#getBalances(
          account.id,
          account.metadata.snap.id,
          added,
        );

        balancesToAdd[accountId] = accountBalance;
      }
    }

    this.update((state: Draft<MultichainBalancesControllerState>) => {
      for (const { accountId, added, removed } of accounts) {
        const accountBalances = state.balances[accountId] ?? {};
        const addedBalances = balancesToAdd[accountId] ?? {};

        state.balances[accountId] = accountBalances;

        // Remove balances for assets that disappeared from the account asset list
        // so stale entries cannot remain in state.
        for (const assetId of removed) {
          delete state.balances[accountId][assetId];
        }

        // Merge the balances returned by the snap for the newly added assets.
        for (const [assetId, balance] of Object.entries(addedBalances)) {
          state.balances[accountId][assetId] = balance;
        }

        // If the asset list was updated but the snap did not return a balance for
        // one of the added assets, keep the asset visible with an explicit zero.
        for (const assetId of added) {
          if (!state.balances[accountId][assetId]) {
            state.balances[accountId][assetId] = { amount: '0', unit: '' };
          }
        }
      }
    });

    for (const { accountId, added } of accounts) {
      if (added.length === 0) {
        continue;
      }
      try {
        const account = this.#getAccount(accountId);
        const chainId = account.scopes[0];
        if (!chainId) {
          continue;
        }
        await this.#enrichAccountAssetInfo(accountId, chainId, added);
      } catch {
        // Account may not exist yet; skip enrichment for this entry.
      }
    }
  }

  /**
   * Updates the balances of one account. This method doesn't return
   * anything, but it updates the state of the controller.
   *
   * @param accountId - The account ID.
   * @param assets - The list of asset types for this account to upadte.
   */
  async #updateBalance(
    accountId: string,
    assets: CaipAssetType[],
  ): Promise<void> {
    const { isUnlocked } = this.messenger.call('KeyringController:getState');

    if (!isUnlocked) {
      return;
    }

    try {
      const account = this.#getAccount(accountId);

      if (account.metadata.snap) {
        const accountBalance = await this.#getBalances(
          account.id,
          account.metadata.snap.id,
          assets,
        );

        this.update((state: Draft<MultichainBalancesControllerState>) => {
          const previous = state.balances[accountId];
          state.balances[accountId] = this.#withPreservedBalanceExtras(
            accountBalance,
            previous,
          );
        });
      }
    } catch (error) {
      // FIXME: Maybe we shouldn't catch all errors here since this method is also being
      // used in the public methods. This means if something else uses `updateBalance` it
      // won't be able to catch and gets the error itself...
      console.error(
        `Failed to fetch balances for account ${accountId}:`,
        error,
      );
    }
  }

  /**
   * Updates the balances of one account. This method doesn't return
   * anything, but it updates the state of the controller.
   *
   * @param accountId - The account ID.
   */
  async updateBalance(accountId: string): Promise<void> {
    await this.#updateBalance(accountId, this.#listAccountAssets(accountId));
  }

  /**
   * Lists the multichain accounts coming from the `AccountsController`.
   *
   * @returns A list of multichain accounts.
   */
  #listMultichainAccounts(): InternalAccount[] {
    return this.messenger.call('AccountsController:listMultichainAccounts');
  }

  /**
   * Lists the accounts that we should get balances for.
   *
   * @returns A list of accounts that we should get balances for.
   */
  #listAccounts(): InternalAccount[] {
    const accounts = this.#listMultichainAccounts();
    return accounts.filter((account) => this.#isNonEvmAccount(account));
  }

  /**
   * Lists the accounts assets.
   *
   * @param accountId - The account ID.
   * @returns The list of assets for this account, returns an empty list if none.
   */
  #listAccountAssets(accountId: string): CaipAssetType[] {
    // TODO: Add an action `MultichainAssetsController:getAccountAssets` maybe?
    const assetsState = this.messenger.call(
      'MultichainAssetsController:getState',
    );

    return assetsState.accountsAssets[accountId] ?? [];
  }

  /**
   * Get a non-EVM account from its ID.
   *
   * @param accountId - The account ID.
   * @returns The non-EVM account.
   */
  #getAccount(accountId: string): InternalAccount {
    const account: InternalAccount | undefined = this.#listAccounts().find(
      (multichainAccount) => multichainAccount.id === accountId,
    );

    if (!account) {
      throw new Error(`Unknown account: ${accountId}`);
    }

    return account;
  }

  /**
   * Checks for non-EVM accounts.
   *
   * @param account - The new account to be checked.
   * @returns True if the account is a non-EVM account, false otherwise.
   */
  #isNonEvmAccount(account: InternalAccount): boolean {
    return (
      !isEvmAccountType(account.type) &&
      // Non-EVM accounts are backed by a Snap for now
      account.metadata.snap !== undefined
    );
  }

  /**
   * Handles balance updates received from the AccountsController.
   *
   * @param balanceUpdate - The balance update event containing new balances.
   */
  #handleOnAccountBalancesUpdated(
    balanceUpdate: AccountBalancesUpdatedEventPayload,
  ): void {
    this.update((state: Draft<MultichainBalancesControllerState>) => {
      Object.entries(balanceUpdate.balances).forEach(
        ([accountId, assetBalances]) => {
          if (accountId in state.balances) {
            Object.entries(assetBalances).forEach(([assetId, incoming]) => {
              const existing = state.balances[accountId][assetId];
              state.balances[accountId][assetId] = {
                amount: incoming.amount,
                unit: incoming.unit,
                ...(existing?.extra === undefined
                  ? {}
                  : { extra: existing.extra }),
              };
            });
          }
        },
      );
    });
  }

  /**
   * Enriches balance rows from the snap when the account chain supports it.
   *
   * @param balanceUpdate - The balance update event containing new balances.
   */
  async #enrichBalancesAfterAccountBalancesUpdated(
    balanceUpdate: AccountBalancesUpdatedEventPayload,
  ): Promise<void> {
    for (const accountId of Object.keys(balanceUpdate.balances)) {
      const assetBalances = balanceUpdate.balances[accountId];
      if (!assetBalances) {
        continue;
      }

      let account: InternalAccount;
      try {
        account = this.#getAccount(accountId);
      } catch {
        continue;
      }

      const chainId = account.scopes[0];
      if (!chainId || !account.metadata.snap?.id) {
        continue;
      }

      await this.#enrichAccountAssetInfo(
        accountId,
        chainId,
        Object.keys(assetBalances) as CaipAssetType[],
      );
    }
  }

  /**
   * Fetches snap account-asset enrichment and merges `extra` into balance rows.
   *
   * @param accountId - Account id.
   * @param chainId - CAIP-2 chain id for enrichment.
   * @param assetIds - Assets to enrich.
   */
  async #enrichAccountAssetInfo(
    accountId: string,
    chainId: CaipChainId,
    assetIds: CaipAssetType[],
  ): Promise<void> {
    if (!isAccountAssetInfoEnrichmentAvailable(chainId)) {
      return;
    }

    const enrichmentAssets = filterAssetsForAccountAssetEnrichment(
      assetIds,
      chainId,
    );
    if (enrichmentAssets.length === 0) {
      return;
    }

    const account = this.#getAccount(accountId);
    const snapId = account.metadata.snap?.id;
    if (!snapId) {
      return;
    }

    const info = await fetchAccountAssetInfoFromSnap(
      (params) => this.messenger.call('SnapController:handleRequest', params),
      {
        accountId,
        snapId: snapId as SnapId,
        chainId,
        assets: enrichmentAssets,
      },
    );
    if (!info) {
      return;
    }

    this.#mergeAccountBalanceExtras(accountId, info);
  }

  /**
   * Builds balance rows from a snap fetch while keeping prior `extra` fields.
   *
   * @param fetched - Balances returned by the snap keyring client.
   * @param previous - Prior cached balances for the account.
   * @returns Merged balance rows with preserved enrichment extras.
   */
  #withPreservedBalanceExtras(
    fetched: Record<CaipAssetType, Balance>,
    previous?: MultichainBalancesControllerState['balances'][string],
  ): MultichainBalancesControllerState['balances'][string] {
    const merged: MultichainBalancesControllerState['balances'][string] = {};
    for (const assetId of Object.keys(fetched)) {
      const row = fetched[assetId as CaipAssetType];
      const prevExtra = previous?.[assetId]?.extra;
      merged[assetId] = {
        amount: row.amount,
        unit: row.unit,
        ...(prevExtra === undefined ? {} : { extra: prevExtra }),
      };
    }
    return merged;
  }

  /**
   * Merges snap enrichment `extra` fields onto existing balance rows.
   *
   * @param accountId - Account id.
   * @param extrasByAsset - Per-asset enrichment fields from the snap.
   */
  #mergeAccountBalanceExtras(
    accountId: string,
    extrasByAsset: Record<CaipAssetType, AccountAssetInfoExtra>,
  ): void {
    this.update((state: Draft<MultichainBalancesControllerState>) => {
      const accountBalances = state.balances[accountId];
      if (!accountBalances) {
        return;
      }
      for (const [assetId, extra] of Object.entries(extrasByAsset)) {
        const row = accountBalances[assetId];
        if (!row || extra === undefined) {
          continue;
        }
        row.extra = extra;
      }
    });
  }

  /**
   * Handles changes when a new account has been removed.
   *
   * @param accountId - The account ID being removed.
   */
  async #handleOnAccountRemoved(accountId: string): Promise<void> {
    if (accountId in this.state.balances) {
      this.update((state: Draft<MultichainBalancesControllerState>) => {
        delete state.balances[accountId];
      });
    }
  }

  /**
   * Get the balances for an account.
   *
   * @param accountId - ID of the account to get balances for.
   * @param snapId - ID of the Snap which manages the account.
   * @param assetTypes - Array of asset types to get balances for.
   * @returns A map of asset types to balances.
   */
  async #getBalances(
    accountId: string,
    snapId: string,
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    return await this.#getClient(snapId).getAccountBalances(
      accountId,
      assetTypes,
    );
  }

  /**
   * Gets a `KeyringClient` for a Snap.
   *
   * @param snapId - ID of the Snap to get the client for.
   * @returns A `KeyringClient` for the Snap.
   */
  #getClient(snapId: string): KeyringClient {
    return new KeyringClient({
      send: async (request: JsonRpcRequest) =>
        (await this.messenger.call('SnapController:handleRequest', {
          snapId: snapId as SnapId,
          origin: 'metamask',
          handler: HandlerType.OnKeyringRequest,
          request,
        })) as Promise<Json>,
    });
  }
}
