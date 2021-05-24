import { toChecksumAddress } from 'ethereumjs-util';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { safelyExecute, handleFetch } from '../util';

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
 * @property tokens - List of tokens to track exchange rates for
 */
export interface TokenRatesConfig extends BaseConfig {
  interval: number;
  nativeCurrency: string;
  chainId: string;
  tokens: Token[];
}

interface ContractExchangeRates {
  [address: string]: number | undefined;
}

/**
 * @type TokenRatesState
 *
 * Token rates controller state
 *
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates
 */
export interface TokenRatesState extends BaseState {
  contractExchangeRates: ContractExchangeRates;
  chainSlugIdentifier: string;
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

  private getPricingURL(chainSlugIdentifier: string, query: string) {
    return `https://api.coingecko.com/api/v3/simple/token_price/${chainSlugIdentifier}?${query}`;
  }

  private async updateChainSlugIdentifier(chainId: string) {
    const platforms: [
      { id: string; chain_identifier: number },
    ] = await handleFetch('https://api.coingecko.com/api/v3/asset_platforms');
    const chain = platforms.find(
      ({ chain_identifier }) =>
        chain_identifier !== null && String(chain_identifier) === chainId,
    );
    if (chain?.id) {
      this.update({ chainSlugIdentifier: chain.id });
    } else {
      this.update({ chainSlugIdentifier: '' });
    }
    !this.disabled && safelyExecute(() => this.updateExchangeRates());
  }

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
      chainId: '',
      tokens: [],
    };
    this.defaultState = { contractExchangeRates: {}, chainSlugIdentifier: '' };
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
      this.updateChainSlugIdentifier(chainId);
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

  /**
   * Fetches a pairs of token address and native currency
   *
   * @param chainSlugIdentifier - Chain string identifier
   * @param query - Query according to tokens in tokenList and native currency
   * @returns - Promise resolving to exchange rates for given pairs
   */
  async fetchExchangeRate(
    chainSlugIdentifier: string,
    query: string,
  ): Promise<CoinGeckoResponse> {
    return handleFetch(this.getPricingURL(chainSlugIdentifier, query));
  }

  /**
   * Updates exchange rates for all tokens
   *
   * @returns Promise resolving when this operation completes
   */
  async updateExchangeRates() {
    if (this.tokenList.length === 0) {
      return;
    }
    const { nativeCurrency } = this.config;
    const { chainSlugIdentifier } = this.state;

    const newContractExchangeRates: ContractExchangeRates = {};
    if (!chainSlugIdentifier) {
      this.tokenList.forEach((token) => {
        const address = toChecksumAddress(token.address);
        newContractExchangeRates[address] = undefined;
      });
    } else {
      const pairs = this.tokenList.map((token) => token.address).join(',');
      const query = `contract_addresses=${pairs}&vs_currencies=${nativeCurrency.toLowerCase()}`;
      const prices = await this.fetchExchangeRate(chainSlugIdentifier, query);
      this.tokenList.forEach((token) => {
        const address = toChecksumAddress(token.address);
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
