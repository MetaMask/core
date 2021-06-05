import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { safelyExecute, handleFetch, toChecksumHexAddress } from '../util';

import type { NetworkState } from '../network/NetworkController';
import type { AssetsState } from './AssetsController';
import type { CurrencyRateState } from './CurrencyRateController';

/**
 * @type CoinGeckoResponse
 *
 * CoinGecko API response representation
 *
 */
export interface CoinGeckoResponse {
  [address: string]: {
    [currency: string]: number;
  };
}

/**
 * @type Token
 *
 * Token representation
 *
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
  balanceError?: Error | null;
}

/**
 * @type TokenRatesConfig
 *
 * Token rates controller configuration
 *
 * @property interval - Polling interval used to fetch new token rates
 * @property nativeCurrency - Current native currency selected to use base of rates
 * @property chainId - Current network chainId
 * @property tokens - List of tokens to track exchange rates for
 * @property threshold - Threshold to invalidate a ChainCache
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

interface ChainCache {
  slug: string | null;
  timestamp: number;
}

interface ChainCaches {
  [chainId: string]: ChainCache;
}

/**
 * @type TokenRatesState
 *
 * Token rates controller state
 *
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates
 * @property supportedChains - Cached chain data
 */
export interface TokenRatesState extends BaseState {
  contractExchangeRates: ContractExchangeRates;
  supportedChains: ChainCaches;
}

const COINGECKO_API = {
  BASE_URL: 'https://api.coingecko.com/api/v3',
  getTokenPriceURL(chainSlug: string, query: string) {
    return `${this.BASE_URL}/simple/token_price/${chainSlug}?${query}`;
  },
  getPlatformsURL() {
    return `${this.BASE_URL}/asset_platforms`;
  },
};

function getUpdatedSupportedChains(
  supportedChains: ChainCaches,
  chainId: string,
  chainCache?: ChainCache,
): ChainCaches {
  const chainCacheData: ChainCache = chainCache || { slug: null, timestamp: 0 };

  return {
    ...supportedChains,
    [chainId]: { ...supportedChains?.[chainId], ...chainCacheData },
  };
}

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the AssetsController
 */
export class TokenRatesController extends BaseController<
  TokenRatesConfig,
  TokenRatesState
> {
  private handle?: NodeJS.Timer;

  private tokenList: Token[] = [];

  /**
   * Name of this controller used during composition
   */
  name = 'TokenRatesController';

  /**
   * Creates a TokenRatesController instance
   *
   * @param options
   * @param options.onAssetsStateChange - Allows subscribing to assets controller state changes
   * @param options.onCurrencyRateStateChange - Allows subscribing to currency rate controller state changes
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
   */
  constructor(
    {
      onAssetsStateChange,
      onCurrencyRateStateChange,
      onNetworkStateChange,
    }: {
      onAssetsStateChange: (
        listener: (assetState: AssetsState) => void,
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
      interval: 180000,
      nativeCurrency: 'eth',
      chainId: '1',
      tokens: [],
      threshold: 1 * 60 * 1000,
    };
    this.defaultState = {
      contractExchangeRates: {},
      supportedChains: {
        '1': { slug: 'ethereum', timestamp: 0 },
      },
    };
    this.initialize();
    this.configure({ disabled: false }, false, false);
    onAssetsStateChange((assetsState) => {
      this.configure({ tokens: assetsState.tokens });
    });
    onCurrencyRateStateChange((currencyRateState) => {
      this.configure({ nativeCurrency: currencyRateState.nativeCurrency });
    });
    onNetworkStateChange(({ provider }) => {
      const { chainId } = provider;
      this.configure({ chainId });
    });
    this.poll();
  }

  /**
   * Sets a new polling interval
   *
   * @param interval - Polling interval used to fetch new token rates
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await safelyExecute(() => this.updateExchangeRates());
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  set chainId(chainId: string) {
    if (!this.state.supportedChains[chainId]) {
      this.update({
        supportedChains: getUpdatedSupportedChains(
          this.state.supportedChains,
          chainId,
        ),
      });
    }
    !this.disabled && safelyExecute(() => this.updateExchangeRates());
  }

  get chainId() {
    throw new Error('Property only used for setting');
  }

  /**
   * Sets a new token list to track prices
   *
   * TODO: Replace this wth a method
   *
   * @param tokens - List of tokens to track exchange rates for
   */
  set tokens(tokens: Token[]) {
    this.tokenList = tokens;
    !this.disabled && safelyExecute(() => this.updateExchangeRates());
  }

  get tokens() {
    throw new Error('Property only used for setting');
  }

  private async fetchChainSlug(chainId: string): Promise<string | null> {
    const platforms: [
      { id: string; chain_identifier: number | null },
    ] = await handleFetch(COINGECKO_API.getPlatformsURL());
    const chain = platforms.find(
      ({ chain_identifier }) =>
        chain_identifier !== null && String(chain_identifier) === chainId,
    );
    return chain?.id || null;
  }

  /**
   * Fetches a pairs of token address and native currency
   *
   * @param chainSlug - Chain string identifier
   * @param query - Query according to tokens in tokenList and native currency
   * @returns - Promise resolving to exchange rates for given pairs
   */
  async fetchExchangeRate(
    chainSlug: string,
    query: string,
  ): Promise<CoinGeckoResponse> {
    return handleFetch(COINGECKO_API.getTokenPriceURL(chainSlug, query));
  }

  async getChainSlug(): Promise<string | null> {
    const { threshold, chainId } = this.config;
    const { supportedChains } = this.state;

    const chainCache = supportedChains[chainId];
    // supportedChain has not been created, we skip this execution
    if (!chainCache) {
      return null;
    }

    const { slug, timestamp } = chainCache;
    const currentTime = Date.now();

    if (currentTime - timestamp <= threshold) {
      return slug;
    }

    try {
      const updatedSlug = await this.fetchChainSlug(chainId);
      this.update({
        supportedChains: getUpdatedSupportedChains(
          this.state.supportedChains,
          chainId,
          { slug: updatedSlug, timestamp: Date.now() },
        ),
      });
      return updatedSlug;
    } catch {
      this.update({
        supportedChains: getUpdatedSupportedChains(
          this.state.supportedChains,
          chainId,
          { slug, timestamp: 0 },
        ),
      });
      return slug;
    }
  }

  /**
   * Updates exchange rates for all tokens
   *
   * @returns Promise resolving when this operation completes
   */
  async updateExchangeRates() {
    if (this.tokenList.length === 0 || this.disabled) {
      return;
    }
    const { nativeCurrency } = this.config;

    const slug = await this.getChainSlug();

    const newContractExchangeRates: ContractExchangeRates = {};
    if (!slug) {
      this.tokenList.forEach((token) => {
        const address = toChecksumHexAddress(token.address);
        newContractExchangeRates[address] = undefined;
      });
    } else {
      const pairs = this.tokenList.map((token) => token.address).join(',');
      const query = `contract_addresses=${pairs}&vs_currencies=${nativeCurrency.toLowerCase()}`;
      const prices = await this.fetchExchangeRate(slug, query);
      this.tokenList.forEach((token) => {
        const address = toChecksumHexAddress(token.address);
        const price = prices[token.address.toLowerCase()];
        newContractExchangeRates[address] = price
          ? price[nativeCurrency.toLowerCase()]
          : 0;
      });
    }
    this.update({ contractExchangeRates: newContractExchangeRates });
  }
}

export default TokenRatesController;
