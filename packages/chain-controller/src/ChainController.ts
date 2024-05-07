import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { CaipAssetType, BalancesResult, Chain } from '@metamask/chain-api';
import type { InternalAccount } from '@metamask/keyring-api';
import type { HandleSnapRequest as SnapControllerHandleSnapRequestAction } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import { SnapChainProviderClient } from './SnapChainProviderClient';
import { SnapHandlerClient } from './SnapHandlerClient';

const controllerName = 'ChainController';

export type ChainControllerState = Record<string, never>;

export type ChainControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ChainControllerState
>;

export type AllowedActions = SnapControllerHandleSnapRequestAction;

export type ChainControllerActions = never;

export type ChainControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ChainControllerState
>;

export type AllowedEvents = ChainControllerEvents;

export type ChainControllerEvents = ChainControllerChangeEvent;

export type ChainControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  ChainControllerActions | AllowedActions,
  ChainControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

const defaultState: ChainControllerState = {};

/**
 * Controller that manages chain-agnostic providers throught the chain API.
 */
export class ChainController
  extends BaseController<
    typeof controllerName,
    ChainControllerState,
    ChainControllerMessenger
  >
  implements Chain
{
  #providers: Record<CaipChainId, SnapChainProviderClient>;

  #snapClient: SnapHandlerClient;

  /**
   * Constructor for ChainController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state = {},
  }: {
    messenger: ChainControllerMessenger;
    state?: ChainControllerState;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: {},
      state: {
        ...defaultState,
        ...state,
      },
    });

    this.#snapClient = new SnapHandlerClient({
      handler: (request) => {
        return this.messagingSystem.call(
          'SnapController:handleRequest',
          request,
        );
      },
    });

    this.#providers = {};

    this.#registerMessageHandlers();
  }

  #getProviderClient(scope: CaipChainId): SnapChainProviderClient {
    if (scope in this.#providers) {
      return this.#providers[scope];
    }

    const error = `No Chain provider found for scope: "${scope}"`;
    console.error(error, this.#providers);
    throw new Error(error);
  }

  getBalances = async (
    scope: CaipChainId,
    accounts: string[],
    assets: CaipAssetType[],
  ): Promise<BalancesResult> => {
    return await this.#getProviderClient(scope).getBalances(
      scope,
      accounts,
      assets,
    );
  };

  getBalancesFromAccount = async (
    scope: CaipChainId,
    account: InternalAccount,
    assets: CaipAssetType[],
  ): Promise<BalancesResult> => {
    return this.getBalances(scope, [account.address], assets);
  };

  hasProviderFor(scope: CaipChainId): boolean {
    return scope in this.#providers;
  }

  registerProvider(
    scope: CaipChainId,
    snapId: SnapId,
  ): SnapChainProviderClient {
    // TODO: Should this be idempotent?
    const client = this.#snapClient.withSnapId(snapId);
    const provider = new SnapChainProviderClient(client);

    if (this.hasProviderFor(scope)) {
      // For now, we avoid this to make sure no other provider can replace the existings ones!
      throw new Error(
        `Found an already existing provider for scope: "${scope}"`,
      );
    }
    this.#providers[scope] = provider;
    return provider;
  }

  /**
   * Registers message handlers for the ChainController.
   * @private
   */
  #registerMessageHandlers() {
    // TODO
  }
}
