import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerAccountBalancesUpdatesEvent,
} from '@metamask/accounts-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
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
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import type { Draft } from 'immer';

import type {
  MultichainAssetsControllerGetStateAction,
  MultichainAssetsControllerAccountAssetListUpdatedEvent,
} from '../MultichainAssetsController';

const controllerName = 'MultichainBalancesController';

/**
 * State used by the {@link MultichainBalancesController} to cache account balances.
 */
export type MultichainBalancesControllerState = {
  balances: {
    [account: string]: {
      [asset: string]: {
        amount: string;
        unit: string;
      };
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
  | HandleSnapRequest
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
export type MultichainBalancesControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  MultichainBalancesControllerActions | AllowedActions,
  MultichainBalancesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * {@link MultichainBalancesController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const balancesControllerMetadata = {
  balances: {
    persist: true,
    anonymous: false,
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

    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      (account: string) => this.#handleOnAccountRemoved(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountBalancesUpdated',
      (balanceUpdate: AccountBalancesUpdatedEventPayload) =>
        this.#handleOnAccountBalancesUpdated(balanceUpdate),
    );

    this.messagingSystem.subscribe(
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
  }

  /**
   * Initialize the controller by fetching initial balances for all non-EVM accounts.
   * This method should be called after the controller is constructed.
   */
  async initialize(): Promise<void> {
    for (const account of this.#listAccounts()) {
      this.updateBalance(account.id).catch((error) => {
        console.error(
          `Failed to fetch initial balances for account ${account.id}:`,
          error,
        );
      });
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
    const { isUnlocked } = this.messagingSystem.call(
      'KeyringController:getState',
    );

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
          for (const assetId in accountBalances) {
            if (!state.balances[accountId][assetId]) {
              state.balances[accountId][assetId] = accountBalances[assetId];
            }
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
    const { isUnlocked } = this.messagingSystem.call(
      'KeyringController:getState',
    );

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
          state.balances[accountId] = accountBalance;
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
    return this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    );
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
    const assetsState = this.messagingSystem.call(
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
            Object.assign(state.balances[accountId], assetBalances);
          }
        },
      );
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
        (await this.messagingSystem.call('SnapController:handleRequest', {
          snapId: snapId as SnapId,
          origin: 'metamask',
          handler: HandlerType.OnKeyringRequest,
          request,
        })) as Promise<Json>,
    });
  }
}
