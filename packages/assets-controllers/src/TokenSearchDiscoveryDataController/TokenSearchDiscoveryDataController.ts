import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import type { Hex } from '@metamask/utils';

import type { TokenDisplayData } from './types';
import { formatIconUrlWithProxy } from '../assetsUtil';
import type { GetCurrencyRateState } from '../CurrencyRateController';
import type { AbstractTokenPricesService } from '../token-prices-service';
import type { TokenPrice } from '../token-prices-service/abstract-token-prices-service';
import {
  fetchTokenMetadata,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
} from '../token-service';
import type { TokenListToken } from '../TokenListController';

// === GENERAL ===

const controllerName = 'TokenSearchDiscoveryDataController';

const MAX_TOKEN_DISPLAY_DATA_LENGTH = 10;

// === STATE ===

export type TokenSearchDiscoveryDataControllerState = {
  tokenDisplayData: TokenDisplayData[];
  swapsTokenAddressesByChainId: Record<
    Hex,
    { lastFetched: number; addresses: string[]; isFetching: boolean }
  >;
};

const tokenSearchDiscoveryDataControllerMetadata = {
  tokenDisplayData: { persist: true, anonymous: false },
  swapsTokenAddressesByChainId: { persist: true, anonymous: false },
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
type AllowedActions = GetCurrencyRateState;

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
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link TokenSearchDiscoveryDataController}.
 */
export type TokenSearchDiscoveryDataControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  TokenSearchDiscoveryDataControllerActions | AllowedActions,
  TokenSearchDiscoveryDataControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
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
    swapsTokenAddressesByChainId: {},
  };
}

/**
 * The TokenSearchDiscoveryDataController manages the retrieval of token search results and token discovery.
 * It fetches token search results and discovery data from the Portfolio API.
 */
export class TokenSearchDiscoveryDataController extends BaseController<
  typeof controllerName,
  TokenSearchDiscoveryDataControllerState,
  TokenSearchDiscoveryDataControllerMessenger
> {
  readonly #abortController: AbortController;

  readonly #tokenPricesService: AbstractTokenPricesService;

  readonly #swapsSupportedChainIds: Hex[];

  readonly #fetchTokens: (chainId: Hex) => Promise<{ address: string }[]>;

  readonly #fetchSwapsTokensThresholdMs: number;

  constructor({
    state = {},
    messenger,
    tokenPricesService,
    swapsSupportedChainIds,
    fetchTokens,
    fetchSwapsTokensThresholdMs,
  }: {
    state?: Partial<TokenSearchDiscoveryDataControllerState>;
    messenger: TokenSearchDiscoveryDataControllerMessenger;
    tokenPricesService: AbstractTokenPricesService;
    swapsSupportedChainIds: Hex[];
    fetchTokens: (chainId: Hex) => Promise<{ address: string }[]>;
    fetchSwapsTokensThresholdMs: number;
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
    this.#swapsSupportedChainIds = swapsSupportedChainIds;
    this.#fetchTokens = fetchTokens;
    this.#fetchSwapsTokensThresholdMs = fetchSwapsTokensThresholdMs;
  }

  async #fetchPriceData(
    chainId: Hex,
    address: string,
  ): Promise<TokenPrice<Hex, string> | null> {
    const { currentCurrency } = this.messagingSystem.call(
      'CurrencyRateController:getState',
    );

    try {
      const pricesData = await this.#tokenPricesService.fetchTokenPrices({
        chainId,
        tokenAddresses: [address as Hex],
        currency: currentCurrency,
      });

      return pricesData[address as Hex] ?? null;
    } catch (error) {
      return null;
    }
  }

  async fetchSwapsTokens(chainId: Hex): Promise<void> {
    if (!this.#swapsSupportedChainIds.includes(chainId)) {
      return;
    }

    const swapsTokens = this.state.swapsTokenAddressesByChainId[chainId];
    if (
      (!swapsTokens ||
        swapsTokens.lastFetched <
          Date.now() - this.#fetchSwapsTokensThresholdMs) &&
      !swapsTokens?.isFetching
    ) {
      try {
        this.update((state) => {
          if (!state.swapsTokenAddressesByChainId[chainId]) {
            state.swapsTokenAddressesByChainId[chainId] = {
              lastFetched: Date.now(),
              addresses: [],
              isFetching: true,
            };
          } else {
            state.swapsTokenAddressesByChainId[chainId].isFetching = true;
          }
        });
        const tokens = await this.#fetchTokens(chainId);
        this.update((state) => {
          state.swapsTokenAddressesByChainId[chainId] = {
            lastFetched: Date.now(),
            addresses: tokens.map((token) => token.address),
            isFetching: false,
          };
        });
      } catch (error) {
        console.error(error);
      }
    }
  }

  async fetchTokenDisplayData(chainId: Hex, address: string): Promise<void> {
    await this.fetchSwapsTokens(chainId);

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

    const { currentCurrency } = this.messagingSystem.call(
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
            token.address !== address &&
            token.chainId !== chainId &&
            token.currency !== currentCurrency,
        ),
      ].slice(0, MAX_TOKEN_DISPLAY_DATA_LENGTH);
    });
  }
}
