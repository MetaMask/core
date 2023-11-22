import type { BaseConfig, BaseState } from '@metamask/base-controller';
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
  toHex,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import { PollingControllerV1 } from '@metamask/polling-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';

import { fetchExchangeRate as fetchNativeExchangeRate } from './crypto-compare';
import type { TokensState } from './TokensController';

/**
 * @type CoinGeckoResponse
 *
 * CoinGecko API response representation
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface CoinGeckoResponse {
  [address: string]: {
    [currency: string]: number;
  };
}
/**
 * @type CoinGeckoPlatform
 *
 * CoinGecko supported platform API representation
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface CoinGeckoPlatform {
  id: string;
  chain_identifier: null | number;
  name: string;
  shortname: string;
}

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

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface SupportedChainsCache {
  timestamp: number;
  data: CoinGeckoPlatform[] | null;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface SupportedVsCurrenciesCache {
  timestamp: number;
  data: string[];
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

const CoinGeckoApi = {
  BASE_URL: 'https://api.coingecko.com/api/v3',
  getTokenPriceURL(chainSlug: string, query: string) {
    return `${this.BASE_URL}/simple/token_price/${chainSlug}?${query}`;
  },
  getPlatformsURL() {
    return `${this.BASE_URL}/asset_platforms`;
  },
  getSupportedVsCurrencies() {
    return `${this.BASE_URL}/simple/supported_vs_currencies`;
  },
};

/**
 * Finds the chain slug in the data array given a chainId.
 *
 * @param chainId - The current chain ID.
 * @param data - A list platforms supported by the CoinGecko API.
 * @returns The CoinGecko slug for the given chain ID, or `null` if the slug was not found.
 */
function findChainSlug(
  chainId: Hex,
  data: CoinGeckoPlatform[] | null,
): string | null {
  if (!data) {
    return null;
  }
  const chain =
    data.find(
      ({ chain_identifier }) =>
        chain_identifier !== null && toHex(chain_identifier) === chainId,
    ) ?? null;
  return chain?.id || null;
}

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export class TokenRatesController extends PollingControllerV1<
  TokenRatesConfig,
  TokenRatesState
> {
  private handle?: ReturnType<typeof setTimeout>;

  private tokenList: Token[] = [];

  private supportedChains: SupportedChainsCache = {
    timestamp: 0,
    data: null,
  };

  private supportedVsCurrencies: SupportedVsCurrenciesCache = {
    timestamp: 0,
    data: [],
  };

  #pollState = PollState.Inactive;

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

    if (config?.disabled) {
      this.configure({ disabled: true }, false, false);
    }
    this.#updateTokenList();

    onPreferencesStateChange(async ({ selectedAddress }) => {
      if (this.config.selectedAddress !== selectedAddress) {
        this.configure({ selectedAddress });
        this.#updateTokenList();
        if (this.#pollState === PollState.Active) {
          await this.updateExchangeRates();
        }
      }
    });

    onTokensStateChange(async ({ allTokens, allDetectedTokens }) => {
      // These two state properties are assumed to be immutable
      if (
        this.config.allTokens !== allTokens ||
        this.config.allDetectedTokens !== allDetectedTokens
      ) {
        this.configure({ allTokens, allDetectedTokens });
        this.#updateTokenList();
        if (this.#pollState === PollState.Active) {
          await this.updateExchangeRates();
        }
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
        this.#updateTokenList();
        if (this.#pollState === PollState.Active) {
          await this.updateExchangeRates();
        }
      }
    });
  }

  #updateTokenList() {
    const { allTokens, allDetectedTokens } = this.config;
    const tokens =
      allTokens[this.config.chainId]?.[this.config.selectedAddress] || [];
    const detectedTokens =
      allDetectedTokens[this.config.chainId]?.[this.config.selectedAddress] ||
      [];
    this.tokenList = [...tokens, ...detectedTokens];
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
   * Fetches a pairs of token address and native currency.
   *
   * @param chainSlug - The chain string identifier.
   * @param vsCurrency - The currency used to generate pairs against the tokens.
   * @param tokenAddresses - The addresses for the token contracts.
   * @returns The exchange rates for the given pairs.
   */
  async fetchExchangeRate(
    chainSlug: string,
    vsCurrency: string,
    tokenAddresses: string[] = this.tokenList.map((token) => token.address),
  ): Promise<CoinGeckoResponse> {
    const tokenPairs = tokenAddresses.join(',');
    const query = `contract_addresses=${tokenPairs}&vs_currencies=${vsCurrency.toLowerCase()}`;
    return handleFetch(CoinGeckoApi.getTokenPriceURL(chainSlug, query));
  }

  /**
   * Checks if the current native currency is a supported vs currency to use
   * to query for token exchange rates.
   *
   * @param nativeCurrency - The native currency to check.
   * @returns A boolean indicating whether it's a supported vsCurrency.
   */
  private async checkIsSupportedVsCurrency(nativeCurrency: string) {
    const { threshold } = this.config;
    const { timestamp, data } = this.supportedVsCurrencies;

    const now = Date.now();

    if (now - timestamp > threshold) {
      const currencies = await handleFetch(
        CoinGeckoApi.getSupportedVsCurrencies(),
      );
      this.supportedVsCurrencies = {
        data: currencies,
        timestamp: Date.now(),
      };
      return currencies.includes(nativeCurrency.toLowerCase());
    }

    return data.includes(nativeCurrency.toLowerCase());
  }

  /**
   * Gets the slug from cached supported platforms CoinGecko API response for the chain ID.
   * If cached supported platforms response is stale, fetches and updates it.
   *
   * @param chainId - The chain ID.
   * @returns The CoinGecko slug for the chain ID.
   */
  async getChainSlug(
    chainId: Hex = this.config.chainId,
  ): Promise<string | null> {
    const { threshold } = this.config;
    const { data, timestamp } = this.supportedChains;

    const now = Date.now();

    if (now - timestamp > threshold) {
      const platforms = await handleFetch(CoinGeckoApi.getPlatformsURL());
      this.supportedChains = {
        data: platforms,
        timestamp: Date.now(),
      };
      return findChainSlug(chainId, platforms);
    }

    return findChainSlug(chainId, data);
  }

  /**
   * Updates exchange rates for all tokens.
   */
  async updateExchangeRates() {
    if (this.tokenList.length === 0 || this.disabled) {
      return;
    }

    const { chainId, nativeCurrency } = this.config;
    const tokenAddresses = this.tokenList.map((token) => token.address);
    await this.updateExchangeRatesByChainId({
      chainId,
      nativeCurrency,
      tokenAddresses,
    });

    this.update({
      contractExchangeRates:
        this.state.contractExchangeRatesByChainId[chainId][nativeCurrency],
    });
  }

  /**
   * Updates exchange rates for all tokens.
   *
   * @param options - The options to fetch exchange rates.
   * @param options.chainId - The chain ID.
   * @param options.nativeCurrency - The ticker for the chain.
   * @param options.tokenAddresses - The addresses for the token contracts.
   */
  async updateExchangeRatesByChainId({
    chainId,
    nativeCurrency,
    tokenAddresses,
  }: {
    chainId: Hex;
    nativeCurrency: string;
    tokenAddresses: string[];
  }) {
    if (!tokenAddresses.length) {
      return;
    }
    const chainSlug = await this.getChainSlug(chainId);

    let newContractExchangeRates: ContractExchangeRates = {};
    if (!chainSlug) {
      tokenAddresses.forEach((tokenAddress) => {
        const address = toChecksumHexAddress(tokenAddress);
        newContractExchangeRates[address] = undefined;
      });
    } else {
      newContractExchangeRates = await this.fetchAndMapExchangeRates(
        nativeCurrency,
        chainSlug,
        tokenAddresses,
      );
    }

    const existingContractExchangeRatesForChainId =
      this.state.contractExchangeRatesByChainId[chainId] ?? {};
    this.update({
      contractExchangeRatesByChainId: {
        ...this.state.contractExchangeRatesByChainId,
        [chainId]: {
          ...existingContractExchangeRatesForChainId,
          [nativeCurrency]: {
            ...(existingContractExchangeRatesForChainId[nativeCurrency] ?? {}),
            ...newContractExchangeRates,
          },
        },
      },
    });
  }

  /**
   * Checks if the active network's native currency is supported by the coingecko API.
   * If supported, it fetches and maps contractExchange rates to a format to be consumed by the UI.
   * If not supported, it fetches contractExchange rates and maps them from token/fallback-currency
   * to token/nativeCurrency.
   *
   * @param nativeCurrency - The native currency ticker against which to fetch exchange rates
   * @param chainSlug - The unique slug used to id the chain by the coingecko api
   * should be used to query token exchange rates.
   * @param tokenAddresses - The addresses for the token contracts against which to fetch exchange rates.
   * @returns An object with conversion rates for each token
   * related to the network's native currency.
   */
  async fetchAndMapExchangeRates(
    nativeCurrency: string,
    chainSlug: string,
    tokenAddresses: string[] = this.tokenList.map((token) => token.address),
  ): Promise<ContractExchangeRates> {
    const contractExchangeRates: ContractExchangeRates = {};

    // check if native currency is supported as a vs_currency by the API
    const nativeCurrencySupported = await this.checkIsSupportedVsCurrency(
      nativeCurrency,
    );

    if (nativeCurrencySupported) {
      // If it is we can do a simple fetch against the CoinGecko API
      const prices = await this.fetchExchangeRate(
        chainSlug,
        nativeCurrency,
        tokenAddresses,
      );
      tokenAddresses.forEach((tokenAddress) => {
        const price = prices[tokenAddress.toLowerCase()];
        contractExchangeRates[toChecksumHexAddress(tokenAddress)] = price
          ? price[nativeCurrency.toLowerCase()]
          : 0;
      });
    } else {
      // if native currency is not supported we need to use a fallback vsCurrency, get the exchange rates
      // in token/fallback-currency format and convert them to expected token/nativeCurrency format.
      let tokenExchangeRates;
      let vsCurrencyToNativeCurrencyConversionRate = 0;
      try {
        [
          tokenExchangeRates,
          { conversionRate: vsCurrencyToNativeCurrencyConversionRate },
        ] = await Promise.all([
          this.fetchExchangeRate(
            chainSlug,
            FALL_BACK_VS_CURRENCY,
            tokenAddresses,
          ),
          fetchNativeExchangeRate(nativeCurrency, FALL_BACK_VS_CURRENCY, false),
        ]);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('market does not exist for this coin pair')
        ) {
          return {};
        }
        throw error;
      }

      for (const [tokenAddress, conversion] of Object.entries(
        tokenExchangeRates,
      )) {
        const tokenToVsCurrencyConversionRate =
          conversion[FALL_BACK_VS_CURRENCY.toLowerCase()];
        contractExchangeRates[toChecksumHexAddress(tokenAddress)] =
          tokenToVsCurrencyConversionRate *
          vsCurrencyToNativeCurrencyConversionRate;
      }
    }

    return contractExchangeRates;
  }

  /**
   * Updates token rates for the given networkClientId and contract addresses
   *
   * @param networkClientId - The network client ID used to get a ticker value.
   * @param options - The polling options.
   * @param options.tokenAddresses - The addresses for the token contracts.
   * @returns The controller state.
   */
  async _executePoll(
    networkClientId: NetworkClientId,
    options: { tokenAddresses: string[] },
  ): Promise<void> {
    const networkClient = this.getNetworkClientById(networkClientId);
    await this.updateExchangeRatesByChainId({
      chainId: networkClient.configuration.chainId,
      nativeCurrency: networkClient.configuration.ticker,
      tokenAddresses: options.tokenAddresses,
    });
  }
}

export default TokenRatesController;
