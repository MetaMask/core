import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  safelyExecute,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
  toHex,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  PreferencesControllerGetStateAction,
  PreferencesControllerStateChangeEvent,
} from '@metamask/preferences-controller';
import { createDeferredPromise, type Hex } from '@metamask/utils';
import { isEqual } from 'lodash';

import { reduceInBatchesSerially, TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import { fetchExchangeRate as fetchNativeCurrencyExchangeRate } from './crypto-compare-service';
import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import type {
  TokensControllerGetStateAction,
  TokensControllerStateChangeEvent,
  TokensState,
} from './TokensController';

/**
 * @type Token
 *
 * Token representation
 * @property address - Hex address of the token contract
 * @property decimals - Number of decimals the token uses
 * @property symbol - Symbol of the token
 * @property image - Image of the token, url or bit32 image
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface Token {
  address: string;
  decimals: number;
  symbol: string;
  aggregators?: string[];
  image?: string;
  balanceError?: unknown;
  isERC721?: boolean;
  name?: string;
}

const DEFAULT_INTERVAL = 180000;

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface ContractExchangeRates {
  [address: string]: number;
}

enum PollState {
  Active = 'Active',
  Inactive = 'Inactive',
}

/**
 * The external actions available to the {@link TokenRatesController}.
 */
export type AllowedActions =
  | TokensControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction
  | PreferencesControllerGetStateAction;
/**
 * The external events available to the {@link TokenRatesController}.
 */
export type AllowedEvents =
  | PreferencesControllerStateChangeEvent
  | TokensControllerStateChangeEvent
  | NetworkControllerStateChangeEvent;

export const controllerName = 'TokenRatesController';

/**
 * @type TokenRatesState
 *
 * Token rates controller state
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates (single globally selected chain, will be deprecated soon)
 * @property contractExchangeRatesByChainId - Hash of token contract addresses to exchange rates keyed by chain ID and native currency (ticker)
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type TokenRatesControllerState = {
  contractExchangeRates: ContractExchangeRates;
  contractExchangeRatesByChainId: Record<
    Hex,
    Record<string, ContractExchangeRates>
  >;
};

export type TokenRatesControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenRatesControllerState
>;

export type TokenRatesControllerActions = TokenRatesControllerGetStateAction;

export type TokenRatesControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenRatesControllerActions | AllowedActions,
  TokenRatesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type TokenRatesControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  TokenRatesControllerState
>;

export type TokenRatesControllerEvents = TokenRatesControllerStateChangeEvent;

/**
 * Uses the CryptoCompare API to fetch the exchange rate between one currency
 * and another, i.e., the multiplier to apply the amount of one currency in
 * order to convert it to another.
 *
 * @param args - The arguments to this function.
 * @param args.from - The currency to convert from.
 * @param args.to - The currency to convert to.
 * @returns The exchange rate between `fromCurrency` to `toCurrency` if one
 * exists, or null if one does not.
 */
async function getCurrencyConversionRate({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const includeUSDRate = false;
  try {
    const result = await fetchNativeCurrencyExchangeRate(
      to,
      from,
      includeUSDRate,
    );
    return result.conversionRate;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('market does not exist for this coin pair')
    ) {
      return null;
    }
    throw error;
  }
}

const metadata = {
  contractExchangeRates: { persist: true, anonymous: false },
  contractExchangeRatesByChainId: { persist: true, anonymous: false },
};

export const getDefaultTokenRatesControllerState =
  (): TokenRatesControllerState => {
    return {
      contractExchangeRates: {},
      contractExchangeRatesByChainId: {},
    };
  };

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export class TokenRatesController extends StaticIntervalPollingController<
  typeof controllerName,
  TokenRatesControllerState,
  TokenRatesControllerMessenger
> {
  private handle?: ReturnType<typeof setTimeout>;

  #pollState = PollState.Inactive;

  #tokenPricesService: AbstractTokenPricesService;

  #inProcessExchangeRateUpdates: Record<`${Hex}:${string}`, Promise<void>> = {};

  #selectedAddress: string;

  #disabled: boolean;

  #chainId: Hex;

  #ticker: string;

  #interval: number;

  #allTokens: TokensState['allTokens'];

  #allDetectedTokens: TokensState['allDetectedTokens'];

  /**
   * Creates a TokenRatesController instance.
   *
   * @param options - The controller options.
   * @param options.interval - The polling interval in ms
   * @param options.currentChainId - The chain ID of the current network.
   * @param options.currentTicker - The ticker for the current network.
   * @param options.currentAddress - The current selected address.
   * @param options.disabled - Boolean to track if network requests are blocked
   * @param options.tokenPricesService - An object in charge of retrieving token price
   * @param options.messenger - The controller messaging system
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    currentChainId,
    currentTicker,
    currentAddress,
    disabled = false,
    tokenPricesService,
    messenger,
    state,
  }: {
    interval?: number;
    currentChainId: Hex;
    currentTicker: string;
    currentAddress: string;
    disabled?: boolean;
    tokenPricesService: AbstractTokenPricesService;
    messenger: TokenRatesControllerMessenger;
    state?: Partial<TokenRatesControllerState>;
  }) {
    super({
      name: controllerName,
      messenger,
      state: { ...getDefaultTokenRatesControllerState(), ...state },
      metadata,
    });

    this.setIntervalLength(interval);
    this.#tokenPricesService = tokenPricesService;
    this.#disabled = disabled;
    this.#interval = interval;
    this.#chainId = currentChainId;
    this.#ticker = currentTicker;
    this.#selectedAddress = currentAddress;
    this.#allTokens = {};
    this.#allDetectedTokens = {};

    this.#subscribeToPreferencesStateChange();

    this.#subscribeToTokensStateChange();

    this.#subscribeToNetworkStateChange();
  }

  #subscribeToPreferencesStateChange() {
    this.messagingSystem.subscribe(
      'PreferencesController:stateChange',
      async (selectedAddress: string) => {
        if (this.#selectedAddress !== selectedAddress) {
          this.#selectedAddress = selectedAddress;
          if (this.#pollState === PollState.Active) {
            await this.updateExchangeRates();
          }
        }
      },
      ({ selectedAddress }) => {
        return selectedAddress;
      },
    );
  }

  #subscribeToTokensStateChange() {
    this.messagingSystem.subscribe(
      'TokensController:stateChange',
      async ({ allTokens, allDetectedTokens }) => {
        const previousTokenAddresses = this.#getTokenAddresses(this.#chainId);
        this.#allTokens = allTokens;
        this.#allDetectedTokens = allDetectedTokens;

        const newTokenAddresses = this.#getTokenAddresses(this.#chainId);
        if (
          !isEqual(previousTokenAddresses, newTokenAddresses) &&
          this.#pollState === PollState.Active
        ) {
          await this.updateExchangeRates();
        }
      },
      ({ allTokens, allDetectedTokens }) => {
        return { allTokens, allDetectedTokens };
      },
    );
  }

  #subscribeToNetworkStateChange() {
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      async ({ providerConfig }) => {
        const { chainId, ticker } = providerConfig;
        if (this.#chainId !== chainId || this.#ticker !== ticker) {
          this.update((state) => {
            state.contractExchangeRates = {};
          });
          this.#chainId = chainId;
          this.#ticker = ticker;
          if (this.#pollState === PollState.Active) {
            await this.updateExchangeRates();
          }
        }
      },
    );
  }

  /**
   * Get the user's tokens for the given chain.
   *
   * @param chainId - The chain ID.
   * @returns The list of tokens addresses for the current chain
   */
  #getTokenAddresses(chainId: Hex): Hex[] {
    const tokens = this.#allTokens[chainId]?.[this.#selectedAddress] || [];
    const detectedTokens =
      this.#allDetectedTokens[chainId]?.[this.#selectedAddress] || [];

    return [
      ...new Set(
        [...tokens, ...detectedTokens].map((token) =>
          toHex(toChecksumHexAddress(token.address)),
        ),
      ),
    ].sort();
  }

  /**
   * Allows controller to make active and passive polling requests
   */
  enable(): void {
    this.#disabled = false;
  }

  /**
   * Blocks controller from making network calls
   */
  disable(): void {
    this.#disabled = true;
  }

  /**
   * Start (or restart) polling.
   */
  async start() {
    this.#stopPoll();
    this.#pollState = PollState.Active;
    await this.#poll();
  }

  /**
   * Stop polling.
   */
  stop() {
    this.#stopPoll();
    this.#pollState = PollState.Inactive;
  }

  /**
   * Clear the active polling timer, if present.
   */
  #stopPoll() {
    if (this.handle) {
      clearTimeout(this.handle);
    }
  }

  /**
   * Poll for exchange rate updates.
   */
  async #poll() {
    await safelyExecute(() => this.updateExchangeRates());

    // Poll using recursive `setTimeout` instead of `setInterval` so that
    // requests don't stack if they take longer than the polling interval
    this.handle = setTimeout(() => {
      this.#poll();
    }, this.#interval);
  }

  /**
   * Updates exchange rates for all tokens.
   */
  async updateExchangeRates() {
    await this.updateExchangeRatesByChainId({
      chainId: this.#chainId,
      nativeCurrency: this.#ticker,
    });
  }

  /**
   * Updates exchange rates for all tokens.
   *
   * @param options - The options to fetch exchange rates.
   * @param options.chainId - The chain ID.
   * @param options.nativeCurrency - The ticker for the chain.
   */
  async updateExchangeRatesByChainId({
    chainId,
    nativeCurrency,
  }: {
    chainId: Hex;
    nativeCurrency: string;
  }) {
    if (this.#disabled) {
      return;
    }

    const tokenAddresses = this.#getTokenAddresses(chainId);
    if (tokenAddresses.length === 0) {
      return;
    }

    const updateKey: `${Hex}:${string}` = `${chainId}:${nativeCurrency}`;
    if (updateKey in this.#inProcessExchangeRateUpdates) {
      // This prevents redundant updates
      // This promise is resolved after the in-progress update has finished,
      // and state has been updated.
      await this.#inProcessExchangeRateUpdates[updateKey];
      return;
    }

    const {
      promise: inProgressUpdate,
      resolve: updateSucceeded,
      reject: updateFailed,
    } = createDeferredPromise({ suppressUnhandledRejection: true });
    this.#inProcessExchangeRateUpdates[updateKey] = inProgressUpdate;

    try {
      const newContractExchangeRates = await this.#fetchAndMapExchangeRates({
        tokenAddresses,
        chainId,
        nativeCurrency,
      });

      const existingContractExchangeRates = this.state.contractExchangeRates;
      const updatedContractExchangeRates =
        chainId === this.#chainId && nativeCurrency === this.#ticker
          ? newContractExchangeRates
          : existingContractExchangeRates;

      const existingContractExchangeRatesForChainId =
        this.state.contractExchangeRatesByChainId[chainId] ?? {};
      const updatedContractExchangeRatesForChainId = {
        ...this.state.contractExchangeRatesByChainId,
        [chainId]: {
          ...existingContractExchangeRatesForChainId,
          [nativeCurrency]: {
            ...existingContractExchangeRatesForChainId[nativeCurrency],
            ...newContractExchangeRates,
          },
        },
      };

      this.update((state) => {
        state.contractExchangeRates = updatedContractExchangeRates;
        state.contractExchangeRatesByChainId =
          updatedContractExchangeRatesForChainId;
      });
      updateSucceeded();
    } catch (error: unknown) {
      updateFailed(error);
      throw error;
    } finally {
      delete this.#inProcessExchangeRateUpdates[updateKey];
    }
  }

  /**
   * Uses the token prices service to retrieve exchange rates for tokens in a
   * particular currency.
   *
   * If the price API does not support the given chain ID, returns an empty
   * object.
   *
   * If the price API does not support the given currency, retrieves exchange
   * rates in a known currency instead, then converts those rates using the
   * exchange rate between the known currency and desired currency.
   *
   * @param args - The arguments to this function.
   * @param args.tokenAddresses - Addresses for tokens.
   * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
   * @param args.nativeCurrency - The native currency in which to request
   * exchange rates.
   * @returns A map from token address to its exchange rate in the native
   * currency, or an empty map if no exchange rates can be obtained for the
   * chain ID.
   */
  async #fetchAndMapExchangeRates({
    tokenAddresses,
    chainId,
    nativeCurrency,
  }: {
    tokenAddresses: Hex[];
    chainId: Hex;
    nativeCurrency: string;
  }): Promise<ContractExchangeRates> {
    if (!this.#tokenPricesService.validateChainIdSupported(chainId)) {
      return tokenAddresses.reduce((obj, tokenAddress) => {
        return {
          ...obj,
          [tokenAddress]: undefined,
        };
      }, {});
    }

    if (this.#tokenPricesService.validateCurrencySupported(nativeCurrency)) {
      return await this.#fetchAndMapExchangeRatesForSupportedNativeCurrency({
        tokenAddresses,
        chainId,
        nativeCurrency,
      });
    }

    return await this.#fetchAndMapExchangeRatesForUnsupportedNativeCurrency({
      tokenAddresses,
      nativeCurrency,
    });
  }

  /**
   * Updates token rates for the given networkClientId
   *
   * @param networkClientId - The network client ID used to get a ticker value.
   * @returns The controller state.
   */
  async _executePoll(networkClientId: NetworkClientId): Promise<void> {
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    await this.updateExchangeRatesByChainId({
      chainId: networkClient.configuration.chainId,
      nativeCurrency: networkClient.configuration.ticker,
    });
  }

  /**
   * Retrieves prices in the given currency for the given tokens on the given
   * chain. Ensures that token addresses are checksum addresses.
   *
   * @param args - The arguments to this function.
   * @param args.tokenAddresses - Addresses for tokens.
   * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
   * @param args.nativeCurrency - The native currency in which to request
   * prices.
   * @returns A map of the token addresses (as checksums) to their prices in the
   * native currency.
   */
  async #fetchAndMapExchangeRatesForSupportedNativeCurrency({
    tokenAddresses,
    chainId,
    nativeCurrency,
  }: {
    tokenAddresses: Hex[];
    chainId: Hex;
    nativeCurrency: string;
  }): Promise<ContractExchangeRates> {
    const tokenPricesByTokenAddress = await reduceInBatchesSerially<
      Hex,
      Awaited<ReturnType<AbstractTokenPricesService['fetchTokenPrices']>>
    >({
      values: [...tokenAddresses].sort(),
      batchSize: TOKEN_PRICES_BATCH_SIZE,
      eachBatch: async (allTokenPricesByTokenAddress, batch) => {
        const tokenPricesByTokenAddressForBatch =
          await this.#tokenPricesService.fetchTokenPrices({
            tokenAddresses: batch,
            chainId,
            currency: nativeCurrency,
          });

        return {
          ...allTokenPricesByTokenAddress,
          ...tokenPricesByTokenAddressForBatch,
        };
      },
      initialResult: {},
    });

    return Object.entries(tokenPricesByTokenAddress).reduce(
      (obj, [tokenAddress, tokenPrice]) => {
        return {
          ...obj,
          [tokenAddress]: tokenPrice?.value,
        };
      },
      {},
    );
  }

  /**
   * If the price API does not support a given native currency, then we need to
   * convert it to a fallback currency and feed that currency into the price
   * API, then convert the prices to our desired native currency.
   *
   * @param args - The arguments to this function.
   * @param args.tokenAddresses - Addresses for tokens.
   * @param args.nativeCurrency - The native currency in which to request
   * prices.
   * @returns A map of the token addresses (as checksums) to their prices in the
   * native currency.
   */
  async #fetchAndMapExchangeRatesForUnsupportedNativeCurrency({
    tokenAddresses,
    nativeCurrency,
  }: {
    tokenAddresses: Hex[];
    nativeCurrency: string;
  }): Promise<ContractExchangeRates> {
    const [
      contractExchangeRates,
      fallbackCurrencyToNativeCurrencyConversionRate,
    ] = await Promise.all([
      this.#fetchAndMapExchangeRatesForSupportedNativeCurrency({
        tokenAddresses,
        chainId: this.#chainId,
        nativeCurrency: FALL_BACK_VS_CURRENCY,
      }),
      getCurrencyConversionRate({
        from: FALL_BACK_VS_CURRENCY,
        to: nativeCurrency,
      }),
    ]);

    if (fallbackCurrencyToNativeCurrencyConversionRate === null) {
      return {};
    }

    return Object.entries(contractExchangeRates).reduce(
      (obj, [tokenAddress, tokenValue]) => {
        return {
          ...obj,
          [tokenAddress]: tokenValue
            ? tokenValue * fallbackCurrencyToNativeCurrencyConversionRate
            : undefined,
        };
      },
      {},
    );
  }
}

export default TokenRatesController;
