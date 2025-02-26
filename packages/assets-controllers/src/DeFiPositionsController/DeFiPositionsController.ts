import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedEvmAccountChangeEvent,
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
import {
  GroupedPositionsResponse,
  DefiPositionResponse,
  Underlying,
} from './types';
import { toHex } from '@metamask/controller-utils';

const controllerName = 'DeFiPositionsController';

export type DeFiPositionsControllerState = {
  /**
   * Object containing DeFi positions per account and network
   */
  allDeFiPositions: {
    [key: string]: { [key: Hex]: GroupedPositionsResponse[] } | null;
  };
  // /**
  //  * Object containing DeFi positions that already exist as tokens per account and network
  //  */
  // duplicateDeFiPositions: {
  //   [key: string]: {
  //     [key: Hex]: { address: string; tokenId?: string }[];
  //   };
  // };
};

const controllerMetadata: StateMetadata<DeFiPositionsControllerState> = {
  allDeFiPositions: {
    persist: true,
    anonymous: false,
  },
  // duplicateDeFiPositions: {
  //   persist: true,
  //   anonymous: false,
  // },
};

export const getDefaultDefiPositionsControllerState =
  (): DeFiPositionsControllerState => {
    return {
      allDeFiPositions: {},
      // duplicateDeFiPositions: {},
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
  | AccountsControllerSelectedEvmAccountChangeEvent;

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
      'AccountsController:selectedEvmAccountChange',
      async (selectedAccount) => {
        console.log(
          'EVENT AccountsController:selectedEvmAccountChange',
          selectedAccount,
        );

        this.#selectedAccountId = selectedAccount.id;

        await this.#updateAccountPositions(selectedAccount.address);
      },
    );

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      async () => {
        console.log('EVENT NetworkController:stateChange');

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
    console.log('DEFI POSITIONS UPDATE TRIGGERED', { accountAddress });

    // TODO: This is done to give the UI a loading effect. Probably not the best way to do this
    this.update((state) => {
      state.allDeFiPositions[accountAddress] = null;
    });

    const defiPositionsResponse =
      await this.#fetchPositionsFromApi(accountAddress);

    const accountPositionsPerChain = await this.#getGroupedPositions(
      defiPositionsResponse,
    );

    console.log('DEFI POSITIONS UPDATE FETCHED', {
      accountAddress,
      accountPositionsPerChain,
    });

    this.update((state) => {
      state.allDeFiPositions[accountAddress] = accountPositionsPerChain;
    });
  }

  // TODO: This is on its own method in case we want to add caching logic
  async #fetchPositionsFromApi(
    accountAddress: string,
  ): Promise<DefiPositionResponse[]> {
    const defiPositionsResponse = await fetch(
      `https://defi-services.metamask-institutional.io/defi-data/positions/${accountAddress}`,
    );

    if (defiPositionsResponse.status !== 200) {
      throw new Error(
        `Unable to fetch defi positions - HTTP ${defiPositionsResponse.status}`,
      );
    }

    return (await defiPositionsResponse.json()).data;
  }

  async #getGroupedPositions(
    defiPositionsResponse: DefiPositionResponse[],
  ): Promise<{ [key: Hex]: GroupedPositionsResponse[] }> {
    const groupedPositions: { [key: Hex]: GroupedPositionsResponse[] } = {};

    for (const position of defiPositionsResponse) {
      if (!position.success) {
        continue;
      }

      const chainId = toHex(position.chainId);
      if (!groupedPositions[chainId]) {
        groupedPositions[chainId] = [];
      }

      const chainPositions = groupedPositions[chainId];

      let chainProtocolPositions = chainPositions.find(
        (group) => group.protocolId === position.protocolId,
      );

      if (!chainProtocolPositions) {
        chainProtocolPositions = {
          protocolId: position.protocolId,
          positions: [],
          aggregatedValues: {},
        };

        chainPositions.push(chainProtocolPositions);
      }

      for (const token of position.tokens) {
        const marketValue = this.#extractTokenMarketValue(token);

        chainProtocolPositions.positions.push({
          protocolDetails: {
            chainId: position.chainId,
            protocolId: position.protocolId,
            productId: position.productId,
            name: position.name,
            description: position.description,
            iconUrl: position.iconUrl,
            siteUrl: position.siteUrl,
            positionType: position.positionType,
          },
          protocolPosition: token,
          marketValue,
        });

        chainProtocolPositions.aggregatedValues[position.positionType] =
          (chainProtocolPositions.aggregatedValues[position.positionType] ||
            0) + marketValue;
      }
    }

    return groupedPositions;
  }

  #extractTokenMarketValue(token: {
    balance: number;
    price?: number;
    tokens?: Underlying[];
  }): number {
    if (!token.tokens) {
      return token.balance * (token.price || 0);
    }

    return token.tokens.reduce(
      (acc, token) => acc + this.#extractTokenMarketValue(token),
      0,
    );
  }
}

export default DeFiPositionsController;
