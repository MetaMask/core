import { BaseController } from '@metamask/base-controller';
import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { TokenDisplayData } from './types';
import { formatIconUrlWithProxy } from '../assetsUtil';
import type { GetCurrencyRateState } from '../CurrencyRateController';
import type { AbstractTokenPricesService } from '../token-prices-service';
import {
  fetchTokenMetadata,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
} from '../token-service';
import type { TokenListToken } from '../TokenListController';

// === GENERAL ===

export const controllerName = 'TokenSearchDiscoveryDataController';

export const MAX_TOKEN_DISPLAY_DATA_LENGTH = 10;

// === STATE ===

export type TokenSearchDiscoveryDataControllerState = {
  tokenDisplayData: TokenDisplayData[];
};

const tokenSearchDiscoveryDataControllerMetadata: StateMetadata<TokenSearchDiscoveryDataControllerState> =
  {
    tokenDisplayData: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
  } as const;

// === MESSENGER ===

/**
 * The action which can be used to retrieve the state of the
 * {@link TokenSearchDiscoveryDataController}.
 */
export type TokenSearchDiscoveryDataControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    TokenSearchDiscoveryDataControllerState
  >;

/**
 * All actions that {@link TokenSearchDiscoveryDataController} registers, to be
 * called externally.
 */
export type TokenSearchDiscoveryDataControllerActions =
  TokenSearchDiscoveryDataControllerGetStateAction;

/**
 * All actions that {@link TokenSearchDiscoveryDataController} calls internally.
 */
export type AllowedActions = GetCurrencyRateState;

/**
 * The event that {@link TokenSearchDiscoveryDataController} publishes when updating
 * state.
 */
export type TokenSearchDiscoveryDataControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    TokenSearchDiscoveryDataControllerState
  >;

/**
 * All events that {@link TokenSearchDiscoveryDataController} publishes, to be
 * subscribed to externally.
 */
export type TokenSearchDiscoveryDataControllerEvents =
  TokenSearchDiscoveryDataControllerStateChangeEvent;

/**
 * All events that {@link TokenSearchDiscoveryDataController} subscribes to internally.
 */
export type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link TokenSearchDiscoveryDataController}.
 */
export type TokenSearchDiscoveryDataControllerMessenger = Messenger<
  typeof controllerName,
  TokenSearchDiscoveryDataControllerActions | AllowedActions,
  TokenSearchDiscoveryDataControllerEvents | AllowedEvents
>;

/**
 * Constructs the default {@link TokenSearchDiscoveryDataController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link TokenSearchDiscoveryDataController} state.
 */
export function getDefaultTokenSearchDiscoveryDataControllerState(): TokenSearchDiscoveryDataControllerState {
  return {
    tokenDisplayData: [],
  };
}

/**
 * The TokenSearchDiscoveryDataController manages the retrieval of token search results and token discovery.
 * It fetches token metadata from the Token API and token prices from the token prices service.
 */
export class TokenSearchDiscoveryDataController extends BaseController<
  typeof controllerName,
  TokenSearchDiscoveryDataControllerState,
  TokenSearchDiscoveryDataControllerMessenger
> {
  readonly #abortController: AbortController;

  readonly #tokenPricesService: AbstractTokenPricesService;

  constructor({
    state = {},
    messenger,
    tokenPricesService,
  }: {
    state?: Partial<TokenSearchDiscoveryDataControllerState>;
    messenger: TokenSearchDiscoveryDataControllerMessenger;
    tokenPricesService: AbstractTokenPricesService;
  }) {
    super({
      name: controllerName,
      metadata: tokenSearchDiscoveryDataControllerMetadata,
      messenger,
      state: {
        ...getDefaultTokenSearchDiscoveryDataControllerState(),
        ...state,
      },
    });

    this.#abortController = new AbortController();
    this.#tokenPricesService = tokenPricesService;
  }

  async #fetchPriceData(chainId: Hex, address: string) {
    const { currentCurrency } = this.messenger.call(
      'CurrencyRateController:getState',
    );

    try {
      const pricesData = await this.#tokenPricesService.fetchTokenPrices({
        assets: [{ chainId, tokenAddress: address as Hex }],
        currency: currentCurrency,
      });

      return pricesData[0] ?? null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async fetchTokenDisplayData(chainId: Hex, address: string): Promise<void> {
    let tokenMetadata: TokenListToken | undefined;
    try {
      tokenMetadata = await fetchTokenMetadata<TokenListToken>(
        chainId,
        address,
        this.#abortController.signal,
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes(TOKEN_METADATA_NO_SUPPORT_ERROR)
      ) {
        throw error;
      }
    }

    const { currentCurrency } = this.messenger.call(
      'CurrencyRateController:getState',
    );

    let tokenDisplayData: TokenDisplayData;
    if (!tokenMetadata) {
      tokenDisplayData = {
        found: false,
        address,
        chainId,
        currency: currentCurrency,
      };
    } else {
      const priceData = await this.#fetchPriceData(chainId, address);
      tokenDisplayData = {
        found: true,
        address,
        chainId,
        currency: currentCurrency,
        token: {
          ...tokenMetadata,
          isERC721: false,
          image: formatIconUrlWithProxy({
            chainId,
            tokenAddress: address,
          }),
        },
        price: priceData,
      };
    }

    this.update((state) => {
      state.tokenDisplayData = [
        tokenDisplayData,
        ...state.tokenDisplayData.filter(
          (token) =>
            token.address !== address ||
            token.chainId !== chainId ||
            token.currency !== currentCurrency,
        ),
      ].slice(0, MAX_TOKEN_DISPLAY_DATA_LENGTH);
    });
  }
}
