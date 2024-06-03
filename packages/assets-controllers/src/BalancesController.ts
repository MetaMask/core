import { type AccountsControllerGetAccountAction } from '@metamask/accounts-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  KeyringRpcMethod,
  type Balance,
  type CaipAssetType,
} from '@metamask/keyring-api';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Draft } from 'immer';
import { v4 as uuid } from 'uuid';

const controllerName = 'BalancesController';

/**
 * State used by the {@link BalancesController} to cache account balances.
 */
export type BalancesControllerState = {
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
 * Default state of the {@link BalancesController}.
 */
const defaultState: BalancesControllerState = { balances: {} };

/**
 * Returns the state of the {@link BalancesController}.
 */
export type GetBalancesControllerState = ControllerGetStateAction<
  typeof controllerName,
  BalancesControllerState
>;

/**
 * Returns the balances of an account.
 */
export type GetBalances = {
  type: `${typeof controllerName}:getBalances`;
  handler: BalancesController['getBalances'];
};

/**
 * Event emitted when the state of the {@link BalancesController} changes.
 */
export type BalancesControllerStateChange = ControllerStateChangeEvent<
  typeof controllerName,
  BalancesControllerState
>;

/**
 * Actions exposed by the {@link BalancesController}.
 */
export type BalancesControllerActions =
  | GetBalancesControllerState
  | GetBalances;

/**
 * Events emitted by {@link BalancesController}.
 */
export type BalancesControllerEvents = BalancesControllerStateChange;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | HandleSnapRequest
  | AccountsControllerGetAccountAction;

/**
 * Messenger type for the BalancesController.
 */
export type BalancesControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  BalancesControllerActions | AllowedActions,
  BalancesControllerEvents,
  AllowedActions['type'],
  never
>;

/**
 * {@link BalancesController}'s metadata.
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
 * The BalancesController is responsible for fetching and caching account
 * balances.
 */
export class BalancesController extends BaseController<
  typeof controllerName,
  BalancesControllerState,
  BalancesControllerMessenger
> {
  constructor({
    messenger,
    state,
  }: {
    messenger: BalancesControllerMessenger;
    state: BalancesControllerState;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: balancesControllerMetadata,
      state: {
        ...defaultState,
        ...state,
      },
    });
  }

  /**
   * Get the balances for an account.
   *
   * @param accountId - ID of the account to get balances for.
   * @param assetTypes - Array of asset types to get balances for.
   * @returns A map of asset types to balances.
   */
  async getBalances(
    accountId: string,
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    console.log('!!! Getting balances for account', accountId);
    console.log('!!! Assets:', assetTypes);

    const account = this.messagingSystem.call(
      'AccountsController:getAccount',
      accountId,
    );
    if (!account) {
      return {};
    }

    const snapId = account.metadata.snap?.id;
    if (!snapId) {
      return {};
    }

    const balances = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      {
        snapId: snapId as SnapId,
        origin: 'metamask',
        handler: HandlerType.OnRpcRequest,
        request: {
          jsonrpc: '2.0',
          id: uuid(),
          method: KeyringRpcMethod.GetAccountBalances,
          params: {
            id: account.id,
            assets: assetTypes,
          },
        },
      },
    )) as Record<CaipAssetType, Balance>;

    this.update((state: Draft<BalancesControllerState>) => {
      state.balances[accountId] = balances;
    });

    return balances;
  }
}
