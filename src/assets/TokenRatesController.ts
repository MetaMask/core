import { BaseController, BaseConfig, BaseState } from '../BaseController';
import { safelyExecute, handleFetch, toChecksumHexAddress } from '../util';

import type { NetworkState } from '../network/NetworkController';
import { FALL_BACK_VS_CURRENCY } from '../constants';
import { fetchExchangeRate as fetchNativeExchangeRate } from '../apis/crypto-compare';
import type { TokensState } from './TokensController';
import type { CurrencyRateState } from './CurrencyRateController';

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
  image?: string;
  balanceError?: unknown;
  isERC721?: boolean;
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
export interface TokenRatesConfig extends BaseConfig {
  interval: number;
  nativeCurrency: string;
  chainId: string;
  tokens: Token[];
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
 * Finds the chain slug in the data array given a chainId.
 *
 * @param chainId - The current chain ID.
 * @param data - A list platforms supported by the CoinGecko API.
 * @returns The CoinGecko slug for the given chain ID, or `null` if the slug was not found.
 */
function findChainSlug(
  chainId: string,
  data: CoinGeckoPlatform[] | null,
): string | null {
  if (!data) {
    return null;
  }
  const chain =
    data.find(
      ({ chain_identifier }) =>
        chain_identifier !== null && String(chain_identifier) === chainId,
    ) ?? null;
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
  #handle?: NodeJS.Timer;

  #tokenList: Token[] = [];

  #supportedChains: SupportedChainsCache = {
    timestamp: 0,
    data: null,
  };

  #supportedVsCurrencies: SupportedVsCurrenciesCache = {
    timestamp: 0,
    data: [],
  };

  /**
   * Name of this controller used during composition
   */
  override name = 'TokenRatesController';

  /**
   * Creates a TokenRatesController instance.
   *
   * @param options - The controller options.
   * @param options.onTokensStateChange - Allows subscribing to token controller state changes.
   * @param options.onCurrencyRateStateChange - Allows subscribing to currency rate controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network state changes.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onTokensStateChange,
      onCurrencyRateStateChange,
      onNetworkStateChange,
    }: {
      onTokensStateChange: (
        listener: (tokensState: TokensState) => void,
      ) => void;
      onCurrencyRateStateChange: (
        listener: (currencyRateState: CurrencyRateState) => void,
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
      disabled: true,
      interval: 3 * 60 * 1000,
      nativeCurrency: 'eth',
      chainId: '',
      tokens: [],
      threshold: 6 * 60 * 60 * 1000,
    };

    this.defaultState = {
      contractExchangeRates: {},
    };
    this.initialize();
    this.configure({ disabled: false }, false, false);
    onTokensStateChange((tokensState) => {
      this.configure({ tokens: tokensState.tokens });
    });

    onCurrencyRateStateChange((currencyRateState) => {
      this.configure({ nativeCurrency: currencyRateState.nativeCurrency });
    });

    onNetworkStateChange(({ provider }) => {
      const { chainId } = provider;
      this.update({ contractExchangeRates: {} });
      this.configure({ chainId });
    });
    this.poll();
  }

  /**
   * Sets a new polling interval.
   *
   * @param interval - Polling interval used to fetch new token rates.
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.#handle && clearTimeout(this.#handle);
    await safelyExecute(() => this.updateExchangeRates());
    this.#handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Sets a new chainId.
   *
   * TODO: Replace this with a method.
   *
   * @param _chainId - The current chain ID.
   */
  set chainId(_chainId: string) {
    !this.disabled && safelyExecute(() => this.updateExchangeRates());
  }

  get chainId() {
    throw new Error('Property only used for setting');
  }

  /**
   * Sets a new token list to track prices.
   *
   * TODO: Replace this with a method.
   *
   * @param tokens - List of tokens to track exchange rates for.
   */
  set tokens(tokens: Token[]) {
    this.#tokenList = tokens;
    !this.disabled && safelyExecute(() => this.updateExchangeRates());
  }

  get tokens() {
    throw new Error('Property only used for setting');
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
    const tokenPairs = this.#tokenList.map((token) => token.address).join(',');
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
  async #checkIsSupportedVsCurrency(nativeCurrency: string) {
    const { threshold } = this.config;
    const { timestamp, data } = this.#supportedVsCurrencies;

    const now = Date.now();

    if (now - timestamp > threshold) {
      const currencies = await handleFetch(
        CoinGeckoApi.getSupportedVsCurrencies(),
      );
      this.#supportedVsCurrencies = {
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
    const { threshold, chainId } = this.config;
    const { data, timestamp } = this.#supportedChains;

    const now = Date.now();

    if (now - timestamp > threshold) {
      const platforms = await handleFetch(CoinGeckoApi.getPlatformsURL());
      this.#supportedChains = {
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
    if (this.#tokenList.length === 0 || this.disabled) {
      return;
    }
    const slug = await this.getChainSlug();

    let newContractExchangeRates: ContractExchangeRates = {};
    if (!slug) {
      this.#tokenList.forEach((token) => {
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
    const nativeCurrencySupported = await this.#checkIsSupportedVsCurrency(
      nativeCurrency,
    );

    if (nativeCurrencySupported) {
      // If it is we can do a simple fetch against the CoinGecko API
      const prices = await this.fetchExchangeRate(slug, nativeCurrency);
      this.#tokenList.forEach((token) => {
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
