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

import { fetchPositions } from './fetch-positions';
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
    persist: true,
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
  // TODO: Confirm whether we can store the account address instead of the id
  // Storing the address means we don't need to query it in every event handler
  #selectedAccountId: string;

  /**
   * Tokens controller options
   *
   * @param options - Constructor options.
   * @param options.messenger - The controller messenger.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: DeFiPositionsControllerMessenger;
    state?: Partial<DeFiPositionsControllerState>;
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

    this.#selectedAccountId = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    ).id;

    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      async (selectedAccount) => {
        this.#selectedAccountId = selectedAccount.id;

        await this.#updateAccountPositions(selectedAccount.address);
      },
    );

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      async () => {
        const selectedAddress = this.messagingSystem.call(
          'AccountsController:getAccount',
          this.#selectedAccountId,
        );

        if (selectedAddress) {
          await this.#updateAccountPositions(selectedAddress.address);
        }
      },
    );
  }

  // TODO: If this becomes an action, accountAddress needs to be inferred from the id
  async #updateAccountPositions(accountAddress: string) {
    // TODO: This is done to give the UI a loading effect. Probably not the best way to do this
    this.update((state) => {
      state.allDeFiPositions[accountAddress] = null;
    });

    const defiPositionsResponse = await fetchPositions(accountAddress);

    const accountPositionsPerChain = groupPositions(defiPositionsResponse);

    this.update((state) => {
      state.allDeFiPositions[accountAddress] = accountPositionsPerChain;
    });
  }
}
