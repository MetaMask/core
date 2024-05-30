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
import { createDeferredPromise, type Hex } from '@metamask/utils';
import { isEqual } from 'lodash';

import { reduceInBatchesSerially, TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import { fetchExchangeRate as fetchNativeCurrencyExchangeRate } from './crypto-compare-service';
import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import { ZERO_ADDRESS } from './token-prices-service/codefi-v2';
import type { TokensControllerState } from './TokensController';

/**
 * @type Token
 *
 * Token representation
 * @property address - Hex address of the token contract
 * @property decimals - Number of decimals the token uses
 * @property symbol - Symbol of the token
 * @property image - Image of the token, url or bit32 image
 */

export type Token = {
  address: string;
  decimals: number;
  symbol: string;
  aggregators?: string[];
  image?: string;
  hasBalanceError?: boolean;
  isERC721?: boolean;
  name?: string;
};

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
export interface ContractExchangeRates {
  [address: string]: number | undefined;
}

type MarketDataDetails = {
  tokenAddress: `0x${string}`;
  value: number;
  currency: string;
  allTimeHigh: number;
  allTimeLow: number;
  circulatingSupply: number;
  dilutedMarketCap: number;
  high1d: number;
  low1d: number;
  marketCap: number;
  marketCapPercentChange1d: number;
  price: number;
  priceChange1d: number;
  pricePercentChange1d: number;
  pricePercentChange1h: number;
  pricePercentChange1y: number;
  pricePercentChange7d: number;
  pricePercentChange14d: number;
  pricePercentChange30d: number;
  pricePercentChange200d: number;
  totalVolume: number;
};

export type ContractMarketData = Record<Hex, MarketDataDetails>;

enum PollState {
  Active = 'Active',
  Inactive = 'Inactive',
}

/**
 * @type TokenRatesState
 *
 * Token rates controller state
 * @property marketData - Market data for tokens, keyed by chain ID and then token contract address.
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TokenRatesState extends BaseState {
  marketData: Record<Hex, Record<Hex, MarketDataDetails>>;
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
  override name = 'TokenRatesController' as const;

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
        listener: (tokensState: TokensControllerState) => void,
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
      marketData: {},
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
        !isEqual(previousTokenAddresses, newTokenAddresses) &&
        this.#pollState === PollState.Active
      ) {
        await this.updateExchangeRates();
      }
    });

    onNetworkStateChange(async ({ selectedNetworkClientId }) => {
      const selectedNetworkClient = getNetworkClientById(
        selectedNetworkClientId,
      );
      const { chainId, ticker } = selectedNetworkClient.configuration;

      if (
        this.config.chainId !== chainId ||
        this.config.nativeCurrency !== ticker
      ) {
        this.update({ ...this.defaultState });
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

    const tokenAddresses = this.#getTokenAddresses(chainId);

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
      const contractInformations = await this.#fetchAndMapExchangeRates({
        tokenAddresses,
        chainId,
        nativeCurrency,
      });

      const marketData = {
        [chainId]: {
          ...(contractInformations ?? {}),
        },
      };

      this.update({
        marketData,
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
  }): Promise<ContractMarketData> {
    if (!this.#tokenPricesService.validateChainIdSupported(chainId)) {
      return tokenAddresses.reduce((obj, tokenAddress) => {
        obj = {
          ...obj,
          [tokenAddress]: undefined,
        };

        return obj;
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
  }): Promise<ContractMarketData> {
    let contractNativeInformations;
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
    contractNativeInformations = tokenPricesByTokenAddress;

    // fetch for native token
    if (tokenAddresses.length === 0) {
      const contractNativeInformationsNative =
        await this.#tokenPricesService.fetchTokenPrices({
          tokenAddresses: [],
          chainId,
          currency: nativeCurrency,
        });

      contractNativeInformations = {
        [ZERO_ADDRESS]: {
          currency: nativeCurrency,
          ...contractNativeInformationsNative[ZERO_ADDRESS],
        },
      };
    }
    return Object.entries(contractNativeInformations).reduce(
      (obj, [tokenAddress, token]) => {
        obj = {
          ...obj,
          [tokenAddress.toLowerCase()]: { ...token },
        };

        return obj;
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
  }): Promise<ContractMarketData> {
    const [
      contractExchangeInformations,
      fallbackCurrencyToNativeCurrencyConversionRate,
    ] = await Promise.all([
      this.#fetchAndMapExchangeRatesForSupportedNativeCurrency({
        tokenAddresses,
        chainId: this.config.chainId,
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

    const updatedContractExchangeRates = Object.entries(
      contractExchangeInformations,
    ).reduce((acc, [tokenAddress, token]) => {
      acc = {
        ...acc,
        [tokenAddress]: {
          ...token,
          value: token.value
            ? token.value * fallbackCurrencyToNativeCurrencyConversionRate
            : undefined,
        },
      };
      return acc;
    }, {});

    return updatedContractExchangeRates;
  }
}

export default TokenRatesController;
