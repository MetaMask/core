import type { BaseConfig, BaseState } from '@metamask/base-controller';
import {
  safelyExecute,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
  toHex,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import { StaticIntervalPollingControllerV1 } from '@metamask/polling-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { isDeepStrictEqual } from 'util';

import { fetchExchangeRate as fetchNativeCurrencyExchangeRate } from './crypto-compare';
import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import type { TokensState } from './TokensController';

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

/**
 * @type TokenRatesConfig
 *
 * Token rates controller configuration
 * @property interval - Polling interval used to fetch new token rates
 * @property nativeCurrency - Current native currency selected to use base of rates
 * @property chainId - Current network chainId
 * @property tokens - List of tokens to track exchange rates for
 * @property threshold - Threshold to invalidate the supportedChains
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TokenRatesConfig extends BaseConfig {
  interval: number;
  nativeCurrency: string;
  chainId: Hex;
  selectedAddress: string;
  allTokens: { [chainId: Hex]: { [key: string]: Token[] } };
  allDetectedTokens: { [chainId: Hex]: { [key: string]: Token[] } };
  threshold: number;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface ContractExchangeRates {
  [address: string]: number | undefined;
}

enum PollState {
  Active = 'Active',
  Inactive = 'Inactive',
}

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
export interface TokenRatesState extends BaseState {
  contractExchangeRates: ContractExchangeRates;
  contractExchangeRatesByChainId: Record<
    Hex,
    Record<string, ContractExchangeRates>
  >;
}

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

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export class TokenRatesController extends StaticIntervalPollingControllerV1<
  TokenRatesConfig,
  TokenRatesState
> {
  private handle?: ReturnType<typeof setTimeout>;

  #pollState = PollState.Inactive;

  #tokenPricesService: AbstractTokenPricesService;

  #inProcessExchangeRateUpdates: Record<`${Hex}:${string}`, Promise<void>> = {};

  /**
   * Name of this controller used during composition
   */
  override name = 'TokenRatesController';

  private readonly getNetworkClientById: NetworkController['getNetworkClientById'];

  /**
   * Creates a TokenRatesController instance.
   *
   * @param options - The controller options.
   * @param options.interval - The polling interval in ms
   * @param options.threshold - The duration in ms before metadata fetched from CoinGecko is considered stale
   * @param options.getNetworkClientById - Gets the network client with the given id from the NetworkController.
   * @param options.chainId - The chain ID of the current network.
   * @param options.ticker - The ticker for the current network.
   * @param options.selectedAddress - The current selected address.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onTokensStateChange - Allows subscribing to token controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network state changes.
   * @param options.tokenPricesService - An object in charge of retrieving token prices.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      interval = 3 * 60 * 1000,
      threshold = 6 * 60 * 60 * 1000,
      getNetworkClientById,
      chainId: initialChainId,
      ticker: initialTicker,
      selectedAddress: initialSelectedAddress,
      onPreferencesStateChange,
      onTokensStateChange,
      onNetworkStateChange,
      tokenPricesService,
    }: {
      interval?: number;
      threshold?: number;
      getNetworkClientById: NetworkController['getNetworkClientById'];
      chainId: Hex;
      ticker: string;
      selectedAddress: string;
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      onTokensStateChange: (
        listener: (tokensState: TokensState) => void,
      ) => void;
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      tokenPricesService: AbstractTokenPricesService;
    },
    config?: Partial<TokenRatesConfig>,
    state?: Partial<TokenRatesState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval,
      threshold,
      disabled: false,
      nativeCurrency: initialTicker,
      chainId: initialChainId,
      selectedAddress: initialSelectedAddress,
      allTokens: {}, // TODO: initialize these correctly, maybe as part of BaseControllerV2 migration
      allDetectedTokens: {},
    };

    this.defaultState = {
      contractExchangeRates: {},
      contractExchangeRatesByChainId: {},
    };
    this.initialize();
    this.setIntervalLength(interval);
    this.getNetworkClientById = getNetworkClientById;
    this.#tokenPricesService = tokenPricesService;

    if (config?.disabled) {
      this.configure({ disabled: true }, false, false);
    }

    onPreferencesStateChange(async ({ selectedAddress }) => {
      if (this.config.selectedAddress !== selectedAddress) {
        this.configure({ selectedAddress });
        if (this.#pollState === PollState.Active) {
          await this.updateExchangeRates();
        }
      }
    });

    onTokensStateChange(async ({ allTokens, allDetectedTokens }) => {
      const previousTokenAddresses = this.#getTokenAddresses(
        this.config.chainId,
      );
      this.configure({ allTokens, allDetectedTokens });
      const newTokenAddresses = this.#getTokenAddresses(this.config.chainId);
      if (
        !isDeepStrictEqual(previousTokenAddresses, newTokenAddresses) &&
        this.#pollState === PollState.Active
      ) {
        await this.updateExchangeRates();
      }
    });

    onNetworkStateChange(async ({ providerConfig }) => {
      const { chainId, ticker } = providerConfig;
      if (
        this.config.chainId !== chainId ||
        this.config.nativeCurrency !== ticker
      ) {
        this.update({ contractExchangeRates: {} });
        this.configure({ chainId, nativeCurrency: ticker });
        if (this.#pollState === PollState.Active) {
          await this.updateExchangeRates();
        }
      }
    });
  }

  /**
   * Get the user's tokens for the given chain.
   *
   * @param chainId - The chain ID.
   * @returns The list of tokens addresses for the current chain
   */
  #getTokenAddresses(chainId: Hex): Hex[] {
    const { allTokens, allDetectedTokens } = this.config;
    const tokens = allTokens[chainId]?.[this.config.selectedAddress] || [];
    const detectedTokens =
      allDetectedTokens[chainId]?.[this.config.selectedAddress] || [];

    return [
      ...new Set(
        [...tokens, ...detectedTokens].map((token) =>
          toHex(toChecksumHexAddress(token.address)),
        ),
      ),
    ].sort();
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
    }, this.config.interval);
  }

  /**
   * Updates exchange rates for all tokens.
   */
  async updateExchangeRates() {
    const { chainId, nativeCurrency } = this.config;
    await this.updateExchangeRatesByChainId({
      chainId,
      nativeCurrency,
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
    if (this.disabled) {
      return;
    }

    const tokenContractAddresses = this.#getTokenAddresses(chainId);
    if (tokenContractAddresses.length === 0) {
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
        tokenContractAddresses,
        chainId,
        nativeCurrency,
      });

      const existingContractExchangeRates = this.state.contractExchangeRates;
      const updatedContractExchangeRates =
        chainId === this.config.chainId &&
        nativeCurrency === this.config.nativeCurrency
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

      this.update({
        contractExchangeRates: updatedContractExchangeRates,
        contractExchangeRatesByChainId: updatedContractExchangeRatesForChainId,
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
   * @param args.tokenContractAddresses - Contract addresses for tokens.
   * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
   * @param args.nativeCurrency - The native currency in which to request
   * exchange rates.
   * @returns A map from token contract address to its exchange rate in the
   * native currency, or an empty map if no exchange rates can be obtained for
   * the chain ID.
   */
  async #fetchAndMapExchangeRates({
    tokenContractAddresses,
    chainId,
    nativeCurrency,
  }: {
    tokenContractAddresses: Hex[];
    chainId: Hex;
    nativeCurrency: string;
  }): Promise<ContractExchangeRates> {
    if (!this.#tokenPricesService.validateChainIdSupported(chainId)) {
      return tokenContractAddresses.reduce((obj, tokenContractAddress) => {
        return {
          ...obj,
          [tokenContractAddress]: undefined,
        };
      }, {});
    }

    if (this.#tokenPricesService.validateCurrencySupported(nativeCurrency)) {
      return await this.#fetchAndMapExchangeRatesForSupportedNativeCurrency({
        tokenContractAddresses,
        chainId,
        nativeCurrency,
      });
    }

    return await this.#fetchAndMapExchangeRatesForUnsupportedNativeCurrency({
      tokenContractAddresses,
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
    const networkClient = this.getNetworkClientById(networkClientId);
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
   * @param args.tokenContractAddresses - Contract addresses for tokens.
   * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
   * @param args.nativeCurrency - The native currency in which to request
   * prices.
   * @returns A map of the token addresses (as checksums) to their prices in the
   * native currency.
   */
  async #fetchAndMapExchangeRatesForSupportedNativeCurrency({
    tokenContractAddresses,
    chainId,
    nativeCurrency,
  }: {
    tokenContractAddresses: Hex[];
    chainId: Hex;
    nativeCurrency: string;
  }): Promise<ContractExchangeRates> {
    const tokenPricesByTokenContractAddress =
      await this.#tokenPricesService.fetchTokenPrices({
        tokenContractAddresses,
        chainId,
        currency: nativeCurrency,
      });

    return Object.entries(tokenPricesByTokenContractAddress).reduce(
      (obj, [tokenContractAddress, tokenPrice]) => {
        return {
          ...obj,
          [tokenContractAddress]: tokenPrice.value,
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
   * @param args.tokenContractAddresses - The contract addresses for the tokens you
   * want to retrieve prices for.
   * @param args.nativeCurrency - The currency you want the prices to be in.
   * @returns A map of the token addresses (as checksums) to their prices in the
   * native currency.
   */
  async #fetchAndMapExchangeRatesForUnsupportedNativeCurrency({
    tokenContractAddresses,
    nativeCurrency,
  }: {
    tokenContractAddresses: Hex[];
    nativeCurrency: string;
  }): Promise<ContractExchangeRates> {
    const [
      tokenPricesByTokenContractAddress,
      fallbackCurrencyToNativeCurrencyConversionRate,
    ] = await Promise.all([
      this.#tokenPricesService.fetchTokenPrices({
        tokenContractAddresses,
        currency: FALL_BACK_VS_CURRENCY,
        chainId: this.config.chainId,
      }),
      getCurrencyConversionRate({
        from: FALL_BACK_VS_CURRENCY,
        to: nativeCurrency,
      }),
    ]);

    if (fallbackCurrencyToNativeCurrencyConversionRate === null) {
      return {};
    }

    return Object.entries(tokenPricesByTokenContractAddress).reduce(
      (obj, [tokenContractAddress, tokenPrice]) => {
        return {
          ...obj,
          [tokenContractAddress]:
            tokenPrice.value * fallbackCurrencyToNativeCurrencyConversionRate,
        };
      },
      {},
    );
  }
}

/**
 * A deferred Promise.
 *
 * A deferred Promise is one that can be resolved or rejected independently of
 * the Promise construction.
 */
type DeferredPromise = {
  /**
   * The Promise that has been deferred.
   */
  promise: Promise<void>;
  /**
   * A function that resolves the Promise.
   */
  resolve: () => void;
  /**
   * A function that rejects the Promise.
   */
  reject: (error: unknown) => void;
};

/**
 * Create a defered Promise.
 *
 * TODO: Migrate this to utils
 *
 * @param args - The arguments.
 * @param args.suppressUnhandledRejection - This option adds an empty error handler
 * to the Promise to suppress the UnhandledPromiseRejection error. This can be
 * useful if the deferred Promise is sometimes intentionally not used.
 * @returns A deferred Promise.
 */
function createDeferredPromise({
  suppressUnhandledRejection = false,
}: {
  suppressUnhandledRejection: boolean;
}): DeferredPromise {
  let resolve: DeferredPromise['resolve'];
  let reject: DeferredPromise['reject'];
  const promise = new Promise<void>(
    (innerResolve: () => void, innerReject: () => void) => {
      resolve = innerResolve;
      reject = innerReject;
    },
  );

  if (suppressUnhandledRejection) {
    promise.catch((_error) => {
      // This handler is used to suppress the UnhandledPromiseRejection error
    });
  }

  // @ts-expect-error We know that these are assigned, but TypeScript doesn't
  return { promise, resolve, reject };
}

export default TokenRatesController;
