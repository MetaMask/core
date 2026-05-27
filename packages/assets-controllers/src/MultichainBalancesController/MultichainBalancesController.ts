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
  ControllerStateChangedEvent,
} from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type {
  Balance,
  AccountBalancesUpdatedEventPayload,
} from '@metamask/keyring-api';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerState,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { Messenger } from '@metamask/messenger';
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { CaipAssetType, Json, JsonRpcRequest } from '@metamask/utils';
import type { Draft } from 'immer';

import type {
  MultichainAssetsControllerGetStateAction,
  MultichainAssetsControllerAccountAssetListUpdatedEvent,
} from '../MultichainAssetsController';
import type { StellarAccountAssetInfoExtra } from '../multichain/stellarAccountAssetInfo';

const controllerName = 'MultichainBalancesController';

/** Per-asset balance row; `extra` carries chain-specific fields (e.g. Stellar trust line `limit`). */
export type MultichainAccountBalance = {
  amount: string;
  unit: string;
  extra?: StellarAccountAssetInfoExtra;
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
 * Merges trust-line (or other) `extra` fields onto existing balance rows.
 */
export type MultichainBalancesControllerMergeAccountBalanceExtrasAction = {
  type: `MultichainBalancesController:mergeAccountBalanceExtras`;
  handler: MultichainBalancesController['mergeAccountBalanceExtras'];
};

/**
 * Actions exposed by the {@link MultichainBalancesController}.
 */
export type MultichainBalancesControllerActions =
  | MultichainBalancesControllerGetStateAction
  | MultichainBalancesControllerMergeAccountBalanceExtrasAction;

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
  | MultichainAssetsControllerAccountAssetListUpdatedEvent
  | ControllerStateChangedEvent<'KeyringController', KeyringControllerState>;
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
      (balanceUpdate: AccountBalancesUpdatedEventPayload) =>
        this.#handleOnAccountBalancesUpdated(balanceUpdate),
    );

    this.messenger.subscribe(
      'MultichainAssetsController:accountAssetListUpdated',
      async ({ assets }) => {
        const newAccountAssets = Object.entries(assets).map(
          ([accountId, { added }]) => ({
            accountId,
            assets: [...added],
          }),
        );
        await this.#handleOnAccountAssetListUpdated(newAccountAssets);
      },
    );

    // When the keyring transitions from locked → unlocked, fetch balances for
    // any non-EVM account that had its balance fetch skipped while locked.
    // We cannot read KeyringController state in the constructor (restricted),
    // so the first `stateChanged` establishes the baseline; if the vault is
    // already unlocked on that first event, we refetch once (covers unlock as
    // the only keyring update after construction).
    let previousKeyringIsUnlocked: boolean | undefined;
    this.messenger.registerActionHandler(
      'MultichainBalancesController:mergeAccountBalanceExtras',
      this.mergeAccountBalanceExtras.bind(this),
    );

    this.messenger.subscribe(
      'KeyringController:stateChanged',
      (keyringState: KeyringControllerState) => {
        const { isUnlocked } = keyringState;
        if (previousKeyringIsUnlocked === undefined) {
          previousKeyringIsUnlocked = isUnlocked;
          if (isUnlocked) {
            this.#refetchBalancesForAccountsMissingFromState();
          }
          return;
        }
        const justUnlocked = isUnlocked && !previousKeyringIsUnlocked;
        previousKeyringIsUnlocked = isUnlocked;
        if (justUnlocked) {
          this.#refetchBalancesForAccountsMissingFromState();
        }
      },
    );
  }

  /**
   * Fetches balances for non-EVM accounts that have no cached balances yet.
   */
  #refetchBalancesForAccountsMissingFromState(): void {
    for (const account of this.#listAccounts()) {
      const hasBalance =
        this.state.balances[account.id] &&
        Object.keys(this.state.balances[account.id]).length > 0;
      if (!hasBalance) {
        // eslint-disable-next-line no-void
        void this.updateBalance(account.id);
      }
    }
  }

  /**
   * Updates the balances for the given accounts.
   *
   * @param accounts - The accounts to update the balances for.
   */
  async #handleOnAccountAssetListUpdated(
    accounts: {
      accountId: string;
      assets: CaipAssetType[];
    }[],
  ): Promise<void> {
    const { isUnlocked } = this.messenger.call('KeyringController:getState');

    if (!isUnlocked) {
      return;
    }
    const balancesToUpdate: MultichainBalancesControllerState['balances'] = {};

    for (const { accountId, assets } of accounts) {
      const account = this.#getAccount(accountId);
      if (account.metadata.snap) {
        const accountBalance = await this.#getBalances(
          account.id,
          account.metadata.snap.id,
          assets,
        );
        balancesToUpdate[accountId] = accountBalance;
      }
    }

    if (Object.keys(balancesToUpdate).length === 0) {
      return;
    }

    const accountsMap = new Map(accounts.map((acc) => [acc.accountId, acc]));

    this.update((state: Draft<MultichainBalancesControllerState>) => {
      for (const [accountId, accountBalances] of Object.entries(
        balancesToUpdate,
      )) {
        if (
          !state.balances[accountId] ||
          Object.keys(state.balances[accountId]).length === 0
        ) {
          state.balances[accountId] = accountBalances;
        } else {
          const acc = accountsMap.get(accountId);

          const assetsWithoutBalance = new Set(acc?.assets || []);

          for (const assetId of Object.keys(accountBalances)) {
            if (!state.balances[accountId][assetId]) {
              state.balances[accountId][assetId] = accountBalances[assetId];
            }
            assetsWithoutBalance.delete(assetId as CaipAssetType);
          }

          // Triggered when an asset is added to the accountAssets list manually
          for (const assetId of assetsWithoutBalance) {
            state.balances[accountId][assetId] = { amount: '0', unit: '' };
          }
        }
      }
    });
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
      for (const [accountId, assetBalances] of Object.entries(
        balanceUpdate.balances,
      )) {
        if (!state.balances[accountId]) {
          state.balances[accountId] = {};
        }
        for (const [assetId, incoming] of Object.entries(assetBalances)) {
          const existing = state.balances[accountId][assetId];
          state.balances[accountId][assetId] = {
            amount: incoming.amount,
            unit: incoming.unit,
            ...(existing?.extra === undefined
              ? {}
              : { extra: existing.extra }),
          };
        }
      }
    });
  }

  /**
   * Builds balance rows from a snap fetch while keeping prior `extra` fields.
   *
   * @param fetched - Balances returned by the snap keyring client.
   * @param previous - Prior cached balances for the account.
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
        ...(prevExtra !== undefined ? { extra: prevExtra } : {}),
      };
    }
    return merged;
  }

  mergeAccountBalanceExtras(
    accountId: string,
    extrasByAsset: Record<CaipAssetType, StellarAccountAssetInfoExtra | undefined>,
  ): void {
    this.update((state: Draft<MultichainBalancesControllerState>) => {
      const accountBalances = state.balances[accountId];
      if (!accountBalances) {
        return;
      }
      for (const [assetId, extra] of Object.entries(extrasByAsset)) {
        const row = accountBalances[assetId];
        if (!row) {
          continue;
        }
        if (extra === undefined) {
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
    if (
      Object.prototype.hasOwnProperty.call(this.state.balances, accountId)
    ) {
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
