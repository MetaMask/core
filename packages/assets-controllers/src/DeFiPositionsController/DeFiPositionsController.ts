import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { NetworkControllerStateChangeEvent } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { DefiPositionResponse } from './fetch-positions';
import { buildPositionFetcher } from './fetch-positions';
import { groupPositions, type GroupedPositions } from './group-positions';

const controllerName = 'DeFiPositionsController';

export type DeFiPositionsControllerState = {
  /**
   * Object containing DeFi positions per account and network
   */
  allDeFiPositions: {
    [accountAddress: string]: { [chain: Hex]: GroupedPositions } | null;
  };
};

const controllerMetadata: StateMetadata<DeFiPositionsControllerState> = {
  allDeFiPositions: {
    persist: false,
    anonymous: false,
  },
};

export const getDefaultDefiPositionsControllerState =
  (): DeFiPositionsControllerState => {
    return {
      allDeFiPositions: {},
    };
  };

export type DeFiPositionsControllerActions =
  DeFiPositionsControllerGetStateAction;

export type DeFiPositionsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  DeFiPositionsControllerState
>;

export type DeFiPositionsControllerEvents =
  DeFiPositionsControllerStateChangeEvent;

export type DeFiPositionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    DeFiPositionsControllerState
  >;

/**
 * The external actions available to the {@link DeFiPositionsController}.
 */
export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction;

/**
 * The external events available to the {@link DeFiPositionsController}.
 */
export type AllowedEvents =
  | NetworkControllerStateChangeEvent
  | AccountsControllerSelectedAccountChangeEvent;

/**
 * The messenger of the {@link DeFiPositionsController}.
 */
export type DeFiPositionsControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  DeFiPositionsControllerActions | AllowedActions,
  DeFiPositionsControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that stores assets and exposes convenience methods
 */
export class DeFiPositionsController extends BaseController<
  typeof controllerName,
  DeFiPositionsControllerState,
  DeFiPositionsControllerMessenger
> {
  readonly #fetchPositions: (
    accountAddress: string,
  ) => Promise<DefiPositionResponse[]>;

  /**
   * Tokens controller options
   *
   * @param options - Constructor options.
   * @param options.messenger - The controller messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.apiUrl
   */
  constructor({
    messenger,
    state,
    apiUrl,
  }: {
    messenger: DeFiPositionsControllerMessenger;
    state?: Partial<DeFiPositionsControllerState>;
    apiUrl?: string;
  }) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      messenger,
      state: {
        ...getDefaultDefiPositionsControllerState(),
        ...state,
      },
    });

    this.#fetchPositions = buildPositionFetcher(apiUrl);

    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      async (selectedAccount) => {
        await this.#updateAccountPositions(selectedAccount.address);
      },
    );

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      async () => {
        const { address } = this.messagingSystem.call(
          'AccountsController:getSelectedAccount',
        );

        if (address) {
          await this.#updateAccountPositions(address);
        }
      },
    );
  }

  async #updateAccountPositions(accountAddress: string) {
    // TODO: This is done to give the UI a loading effect. Probably not the best way to do this
    this.update((state) => {
      state.allDeFiPositions[accountAddress] = null;
    });

    const defiPositionsResponse = await this.#fetchPositions(accountAddress);

    const accountPositionsPerChain = groupPositions(defiPositionsResponse);

    this.update((state) => {
      state.allDeFiPositions[accountAddress] = accountPositionsPerChain;
    });
  }
}
