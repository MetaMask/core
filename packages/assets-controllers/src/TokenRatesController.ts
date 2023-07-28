import type { BaseConfig, BaseState } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
  getEthChainIdIntFromCaipChainId,
} from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { CaipChainId } from '@metamask/utils';

import { fetchExchangeRate as fetchNativeExchangeRate } from './crypto-compare';
import type { TokensState } from './TokensController';

/**
 * @type CoinGeckoResponse
 *
 * CoinGecko API response representation
 */
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
 * @property caipChainId - Current network caipChainId
 * @property tokens - List of tokens to track exchange rates for
 * @property threshold - Threshold to invalidate the supportedChains
 */
export interface TokenRatesConfig extends BaseConfig {
  interval: number;
  nativeCurrency: string;
  caipChainId: CaipChainId;
  selectedAddress: string;
  allTokens: { [caipChainId: CaipChainId]: { [key: string]: Token[] } };
  allDetectedTokens: { [caipChainId: CaipChainId]: { [key: string]: Token[] } };
  threshold: number;
}

interface ContractExchangeRates {
  [address: string]: number | undefined;
}

interface SupportedChainsCache {
  timestamp: number;
  data: CoinGeckoPlatform[] | null;
}

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
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates
 * @property supportedChains - Cached chain data
 */
export interface TokenRatesState extends BaseState {
  contractExchangeRates: ContractExchangeRates;
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
 * Finds the chain slug in the data array given a caipChainId.
 *
 * @param caipChainId - The current caip chain ID.
 * @param data - A list platforms supported by the CoinGecko API.
 * @returns The CoinGecko slug for the given chain ID, or `null` if the slug was not found.
 */
function findChainSlug(
  caipChainId: CaipChainId,
  data: CoinGeckoPlatform[] | null,
): string | null {
  if (!data) {
    return null;
  }
  const chainId = getEthChainIdIntFromCaipChainId(caipChainId);
  const chain =
    data.find(({ chain_identifier }) => chain_identifier === chainId) ?? null;
  return chain?.id || null;
}

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export class TokenRatesController extends BaseController<
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

  /**
   * Creates a TokenRatesController instance.
   *
   * @param options - The controller options.
   * @param options.caipChainId - The caip chain ID of the current network.
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
      caipChainId: initialCaipChainId,
      ticker: initialTicker,
      selectedAddress: initialSelectedAddress,
      onPreferencesStateChange,
      onTokensStateChange,
      onNetworkStateChange,
    }: {
      caipChainId: CaipChainId;
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
      disabled: false,
      interval: 3 * 60 * 1000,
      nativeCurrency: initialTicker,
      caipChainId: initialCaipChainId,
      selectedAddress: initialSelectedAddress,
      allTokens: {}, // TODO: initialize these correctly, maybe as part of BaseControllerV2 migration
      allDetectedTokens: {},
      threshold: 6 * 60 * 60 * 1000,
    };

    this.defaultState = {
      contractExchangeRates: {},
    };
    this.initialize();
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
      const { caipChainId, ticker } = providerConfig;
      if (
        this.config.caipChainId !== caipChainId ||
        this.config.nativeCurrency !== ticker
      ) {
        this.update({ contractExchangeRates: {} });
        this.configure({ caipChainId, nativeCurrency: ticker });
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
      allTokens[this.config.caipChainId]?.[this.config.selectedAddress] || [];
    const detectedTokens =
      allDetectedTokens[this.config.caipChainId]?.[
        this.config.selectedAddress
      ] || [];
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
   * @param chainSlug - Chain string identifier.
   * @param vsCurrency - Query according to tokens in tokenList and native currency.
   * @returns The exchange rates for the given pairs.
   */
  async fetchExchangeRate(
    chainSlug: string,
    vsCurrency: string,
  ): Promise<CoinGeckoResponse> {
    const tokenPairs = this.tokenList.map((token) => token.address).join(',');
    const query = `contract_addresses=${tokenPairs}&vs_currencies=${vsCurrency.toLowerCase()}`;
    return handleFetch(CoinGeckoApi.getTokenPriceURL(chainSlug, query));
  }

  /**
   * Checks if the current native currency is a supported vs currency to use
   * to query for token exchange rates.
   *
   * @param nativeCurrency - The native currency of the currently active network.
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
   * Gets current chain ID slug from cached supported platforms CoinGecko API response.
   * If cached supported platforms response is stale, fetches and updates it.
   *
   * @returns The CoinGecko slug for the current chain ID.
   */
  async getChainSlug(): Promise<string | null> {
    const { threshold, caipChainId } = this.config;
    const { data, timestamp } = this.supportedChains;

    const now = Date.now();

    if (now - timestamp > threshold) {
      const platforms = await handleFetch(CoinGeckoApi.getPlatformsURL());
      this.supportedChains = {
        data: platforms,
        timestamp: Date.now(),
      };
      return findChainSlug(caipChainId, platforms);
    }

    return findChainSlug(caipChainId, data);
  }

  /**
   * Updates exchange rates for all tokens.
   */
  async updateExchangeRates() {
    if (this.tokenList.length === 0 || this.disabled) {
      return;
    }
    const slug = await this.getChainSlug();

    let newContractExchangeRates: ContractExchangeRates = {};
    if (!slug) {
      this.tokenList.forEach((token) => {
        const address = toChecksumHexAddress(token.address);
        newContractExchangeRates[address] = undefined;
      });
    } else {
      const { nativeCurrency } = this.config;
      newContractExchangeRates = await this.fetchAndMapExchangeRates(
        nativeCurrency,
        slug,
      );
    }
    this.update({ contractExchangeRates: newContractExchangeRates });
  }

  /**
   * Checks if the active network's native currency is supported by the coingecko API.
   * If supported, it fetches and maps contractExchange rates to a format to be consumed by the UI.
   * If not supported, it fetches contractExchange rates and maps them from token/fallback-currency
   * to token/nativeCurrency.
   *
   * @param nativeCurrency - The native currency of the currently active network.
   * @param slug - The unique slug used to id the chain by the coingecko api
   * should be used to query token exchange rates.
   * @returns An object with conversion rates for each token
   * related to the network's native currency.
   */
  async fetchAndMapExchangeRates(
    nativeCurrency: string,
    slug: string,
  ): Promise<ContractExchangeRates> {
    const contractExchangeRates: ContractExchangeRates = {};

    // check if native currency is supported as a vs_currency by the API
    const nativeCurrencySupported = await this.checkIsSupportedVsCurrency(
      nativeCurrency,
    );

    if (nativeCurrencySupported) {
      // If it is we can do a simple fetch against the CoinGecko API
      const prices = await this.fetchExchangeRate(slug, nativeCurrency);
      this.tokenList.forEach((token) => {
        const price = prices[token.address.toLowerCase()];
        contractExchangeRates[toChecksumHexAddress(token.address)] = price
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
          this.fetchExchangeRate(slug, FALL_BACK_VS_CURRENCY),
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
}

export default TokenRatesController;
