import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { CaipAssetType, BalancesResult, Chain } from '@metamask/chain-api';
import type { InternalAccount } from '@metamask/keyring-api';
import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import { SnapChainProviderClient } from './SnapChainProviderClient';
import { SnapControllerClient } from './SnapControllerClient';

const controllerName = 'ChainController';

export type ChainControllerState = {
  dummy: string;
};

export type ChainControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ChainControllerState
>;

export type AllowedActions = never;

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

const defaultState: ChainControllerState = {
  dummy: '',
};

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

  #snapClient: SnapControllerClient;

  /**
   * Constructor for ChainController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   * @param options.getSnapController - Snaps controller.
   */
  constructor({
    messenger,
    state,
    getSnapController,
  }: {
    messenger: ChainControllerMessenger;
    state: ChainControllerState;
    getSnapController: () => SnapController;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: {
        dummy: {
          persist: false,
          anonymous: false,
        },
      },
      state: {
        ...defaultState,
        ...state,
      },
    });

    this.#snapClient = new SnapControllerClient({
      controller: getSnapController(),
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
    const client = this.#snapClient.withSnapId(snapId as SnapId);
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
