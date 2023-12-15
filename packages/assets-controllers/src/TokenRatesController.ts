import type { BaseConfig, BaseState } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
} from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';

import deepEqual from 'fast-deep-equal';

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
 * @property chainId - Current network chainId
 * @property tokens - List of tokens to track exchange rates for
 * @property threshold - Threshold to invalidate the supportedChains
 */
export interface TokenRatesConfig extends BaseConfig {
  interval: number;
  nativeCurrency: string;
  chainId: Hex;
  selectedAddress: string;
  allTokens: { [chainId: Hex]: { [key: string]: Token[] } };
  allDetectedTokens: { [chainId: Hex]: { [key: string]: Token[] } };
  threshold: number;
}

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
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates
 * @property supportedChains - Cached chain data
 */
export interface TokenRatesState extends BaseState {
  contractExchangeRates: ContractExchangeRates;
}

const CURRENCY_PRICE_API_CURRENCIES_SUPPORTED = {
  btc: {
    name: 'Bitcoin',
    ticker: 'btc',
    currencyType: 'crypto',
  },
  eth: {
    name: 'Ether',
    ticker: 'eth',
    currencyType: 'crypto',
  },
  ltc: {
    name: 'Litecoin',
    ticker: 'ltc',
    currencyType: 'crypto',
  },
  bch: {
    name: 'Bitcoin Cash',
    ticker: 'bch',
    currencyType: 'crypto',
  },
  bnb: {
    name: 'Binance Coin',
    ticker: 'bnb',
    currencyType: 'crypto',
  },
  eos: {
    name: 'EOS',
    ticker: 'eos',
    currencyType: 'crypto',
  },
  xrp: {
    name: 'XRP',
    ticker: 'xrp',
    currencyType: 'crypto',
  },
  xlm: {
    name: 'Lumens',
    ticker: 'xlm',
    currencyType: 'crypto',
  },
  link: {
    name: 'Chainlink',
    ticker: 'link',
    currencyType: 'crypto',
  },
  dot: {
    name: 'Polkadot',
    ticker: 'dot',
    currencyType: 'crypto',
  },
  yfi: {
    name: 'Yearn.finance',
    ticker: 'yfi',
    currencyType: 'crypto',
  },
  usd: {
    name: 'US Dollar',
    ticker: 'usd',
    value: 1,
    currencyType: 'fiat',
  },
  aed: {
    name: 'United Arab Emirates Dirham',
    ticker: 'aed',
    currencyType: 'fiat',
  },
  ars: {
    name: 'Argentine Peso',
    ticker: 'ars',
    currencyType: 'fiat',
  },
  aud: {
    name: 'Australian Dollar',
    ticker: 'aud',
    currencyType: 'fiat',
  },
  bdt: {
    name: 'Bangladeshi Taka',
    ticker: 'bdt',
    currencyType: 'fiat',
  },
  bhd: {
    name: 'Bahraini Dinar',
    ticker: 'bhd',
    currencyType: 'fiat',
  },
  bmd: {
    name: 'Bermudian Dollar',
    ticker: 'bmd',
    currencyType: 'fiat',
  },
  brl: {
    name: 'Brazil Real',
    ticker: 'brl',
    currencyType: 'fiat',
  },
  cad: {
    name: 'Canadian Dollar',
    ticker: 'cad',
    currencyType: 'fiat',
  },
  chf: {
    name: 'Swiss Franc',
    ticker: 'chf',
    currencyType: 'fiat',
  },
  clp: {
    name: 'Chilean Peso',
    ticker: 'clp',
    currencyType: 'fiat',
  },
  cny: {
    name: 'Chinese Yuan',
    ticker: 'cny',
    currencyType: 'fiat',
  },
  czk: {
    name: 'Czech Koruna',
    ticker: 'czk',
    currencyType: 'fiat',
  },
  dkk: {
    name: 'Danish Krone',
    ticker: 'dkk',
    currencyType: 'fiat',
  },
  eur: {
    name: 'Euro',
    ticker: 'eur',
    currencyType: 'fiat',
  },
  gbp: {
    name: 'British Pound Sterling',
    ticker: 'gbp',
    currencyType: 'fiat',
  },
  hkd: {
    name: 'Hong Kong Dollar',
    ticker: 'hkd',
    currencyType: 'fiat',
  },
  huf: {
    name: 'Hungarian Forint',
    ticker: 'huf',
    currencyType: 'fiat',
  },
  idr: {
    name: 'Indonesian Rupiah',
    ticker: 'idr',
    currencyType: 'fiat',
  },
  ils: {
    name: 'Israeli New Shekel',
    ticker: 'ils',
    currencyType: 'fiat',
  },
  inr: {
    name: 'Indian Rupee',
    ticker: 'inr',
    currencyType: 'fiat',
  },
  jpy: {
    name: 'Japanese Yen',
    ticker: 'jpy',
    currencyType: 'fiat',
  },
  krw: {
    name: 'South Korean Won',
    ticker: 'krw',
    currencyType: 'fiat',
  },
  kwd: {
    name: 'Kuwaiti Dinar',
    ticker: 'kwd',
    currencyType: 'fiat',
  },
  lkr: {
    name: 'Sri Lankan Rupee',
    ticker: 'lkr',
    currencyType: 'fiat',
  },
  mmk: {
    name: 'Burmese Kyat',
    ticker: 'mmk',
    currencyType: 'fiat',
  },
  mxn: {
    name: 'Mexican Peso',
    ticker: 'mxn',
    currencyType: 'fiat',
  },
  myr: {
    name: 'Malaysian Ringgit',
    ticker: 'myr',
    currencyType: 'fiat',
  },
  ngn: {
    name: 'Nigerian Naira',
    ticker: 'ngn',
    currencyType: 'fiat',
  },
  nok: {
    name: 'Norwegian Krone',
    ticker: 'nok',
    currencyType: 'fiat',
  },
  nzd: {
    name: 'New Zealand Dollar',
    ticker: 'nzd',
    currencyType: 'fiat',
  },
  php: {
    name: 'Philippine Peso',
    ticker: 'php',
    currencyType: 'fiat',
  },
  pkr: {
    name: 'Pakistani Rupee',
    ticker: 'pkr',
    currencyType: 'fiat',
  },
  pln: {
    name: 'Polish Zloty',
    ticker: 'pln',
    currencyType: 'fiat',
  },
  rub: {
    name: 'Russian Ruble',
    ticker: 'rub',
    currencyType: 'fiat',
  },
  sar: {
    name: 'Saudi Riyal',
    ticker: 'sar',
    currencyType: 'fiat',
  },
  sek: {
    name: 'Swedish Krona',
    ticker: 'sek',
    currencyType: 'fiat',
  },
  sgd: {
    name: 'Singapore Dollar',
    ticker: 'sgd',
    currencyType: 'fiat',
  },
  thb: {
    name: 'Thai Baht',
    ticker: 'thb',
    currencyType: 'fiat',
  },
  try: {
    name: 'Turkish Lira',
    ticker: 'try',
    currencyType: 'fiat',
  },
  twd: {
    name: 'New Taiwan Dollar',
    ticker: 'twd',
    currencyType: 'fiat',
  },
  uah: {
    name: 'Ukrainian hryvnia',
    ticker: 'uah',
    currencyType: 'fiat',
  },
  vef: {
    name: 'Venezuelan bolívar fuerte',
    ticker: 'vef',
    currencyType: 'fiat',
  },
  vnd: {
    name: 'Vietnamese đồng',
    ticker: 'vnd',
    currencyType: 'fiat',
  },
  zar: {
    name: 'South African Rand',
    ticker: 'zar',
    currencyType: 'fiat',
  },
  xdr: {
    name: 'IMF Special Drawing Rights',
    ticker: 'xdr',
    currencyType: 'fiat',
  },
  xag: {
    name: 'Silver - Troy Ounce',
    ticker: 'xag',
    currencyType: 'commodity',
  },
  xau: {
    name: 'Gold - Troy Ounce',
    ticker: 'xau',
    currencyType: 'commodity',
  },
  bits: {
    name: 'Bits',
    ticker: 'bits',
    currencyType: 'crypto',
  },
  sats: {
    name: 'Satoshi',
    ticker: 'sats',
    currencyType: 'crypto',
  },
};

const CHAIN_ID_PRICE_API_SUPPORTED = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  25: 'cronos',
  56: 'binance-smart-chain',
  57: 'syscoin',
  66: 'okex-chain',
  70: 'hoo-smart-chain',
  82: 'meter',
  88: 'tomochain',
  100: 'xdai',
  106: 'velas',
  122: 'fuse',
  128: 'huobi-token',
  137: 'polygon-pos',
  250: 'fantom',
  288: 'boba',
  321: 'kucoin-community-chain',
  324: 'zksync',
  361: 'theta',
  1088: 'metis-andromeda',
  1284: 'moonbeam',
  1285: 'moonriver',
  8453: 'base',
  336: 'shiden network',
  10000: 'smartbch',
  42161: 'arbitrum-one',
  42220: 'celo',
  42262: 'oasis',
  43114: 'avalanche',
  59144: 'linea',
  333999: 'polis-chain',
  1313161554: 'aurora',
  1666600000: 'harmony-shard-0',
};

const PriceApi = {
  BASE_URL: 'https://price.api.cx.metamask.io',
  getTokenPriceURL(chainId: string, query: string) {
    return `${this.BASE_URL}/v2/chains/${chainId}/spot-prices?${query}`;
  },
};

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export class TokenRatesController extends BaseController<
  TokenRatesConfig,
  TokenRatesState
> {
  private handle?: ReturnType<typeof setTimeout>;

  private tokenList: string[] = [];

  #pollState = PollState.Inactive;

  /**
   * Name of this controller used during composition
   */
  override name = 'TokenRatesController';

  /**
   * Creates a TokenRatesController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.ticker - The ticker for the current network.
   * @param options.selectedAddress - The current selected address.
   * @param options.coinGeckoHeader - Ccoingecko identifier.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onTokensStateChange - Allows subscribing to token controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network state changes.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      chainId: initialChainId,
      ticker: initialTicker,
      selectedAddress: initialSelectedAddress,
      onPreferencesStateChange,
      onTokensStateChange,
      onNetworkStateChange,
    }: {
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
      disabled: false,
      interval: 30 * 60 * 1000,
      nativeCurrency: initialTicker,
      chainId: initialChainId,
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
        const isEqual = this.#updateTokenList();
        if (this.#pollState === PollState.Active && !isEqual) {
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
        const isEqual = this.#updateTokenList();
        if (this.#pollState === PollState.Active && !isEqual) {
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
        this.configure({ chainId, nativeCurrency: ticker || 'ETH' });
        const isEqual = this.#updateTokenList();
        if (this.#pollState === PollState.Active && !isEqual) {
          await this.updateExchangeRates();
        }
      }
    });
  }

  #updateTokenList() {
    const { allTokens, allDetectedTokens } = this.config;
    const oldTokenList = this.tokenList;
    const tokens =
      allTokens[this.config.chainId]?.[this.config.selectedAddress] || [];
    const detectedTokens =
      allDetectedTokens[this.config.chainId]?.[this.config.selectedAddress] ||
      [];
    const newTokenList = [...tokens, ...detectedTokens].map(
      (token) => token.address,
    );
    this.tokenList = newTokenList;
    return deepEqual(oldTokenList, newTokenList);
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
  async fetchExchangeRate(vsCurrency: string): Promise<CoinGeckoResponse[]> {
    const { chainId } = this.config;
    const tokenPairs = this.tokenList;
    const tokenPairsChunks = (chunkSize: number) =>
      tokenPairs.reduce((resultArray: any[], item: string, index: number) => {
        const chunkIndex = Math.floor(index / chunkSize);
        if (!resultArray[chunkIndex]) {
          resultArray[chunkIndex] = [];
        }

        resultArray[chunkIndex].push(item);

        return resultArray;
      }, []);

    const tokensPairsChunks = tokenPairsChunks(100);

    const results: CoinGeckoResponse[] = [];
    for (const tokenPairsChunk of tokensPairsChunks) {
      const query = `tokenAddresses=${tokenPairsChunk.join(
        ',',
      )}&vsCurrency=${vsCurrency.toLowerCase()}`;
      const result = await handleFetch(
        PriceApi.getTokenPriceURL(chainId, query),
      );
      results.push(result);
    }
    return results;
  }

  /**
   * Updates exchange rates for all tokens.
   */
  async updateExchangeRates() {
    if (this.tokenList.length === 0 || this.disabled) {
      return;
    }
    const { chainId } = this.config;

    let newContractExchangeRates: ContractExchangeRates = {};
    if (
      !Object.prototype.hasOwnProperty.call(
        CHAIN_ID_PRICE_API_SUPPORTED,
        chainId,
      )
    ) {
      this.tokenList.forEach((tokenAddress) => {
        const address = toChecksumHexAddress(tokenAddress);
        newContractExchangeRates[address] = undefined;
      });
    } else {
      const { nativeCurrency } = this.config;
      newContractExchangeRates = await this.fetchAndMapExchangeRates(
        nativeCurrency,
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
  ): Promise<ContractExchangeRates> {
    const contractExchangeRates: ContractExchangeRates = {};
    if (this.tokenList.length === 0) {
      return contractExchangeRates;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        CURRENCY_PRICE_API_CURRENCIES_SUPPORTED,
        nativeCurrency.toLowerCase(),
      )
    ) {
      const res = await this.fetchExchangeRate(nativeCurrency);
      const prices = Object.assign({}, ...res);
      this.tokenList.forEach((tokenAddress) => {
        const price = prices[tokenAddress.toLowerCase()];
        contractExchangeRates[toChecksumHexAddress(tokenAddress)] = price
          ? price[nativeCurrency.toLowerCase()]
          : 0;
      });
    } else {
      // if native currency is not supported we need to use a fallback vsCurrency, get the exchange rates
      // in token/fallback-currency format and convert them to expected token/nativeCurrency format.
      let tokenExchangeRatesResponse;
      let vsCurrencyToNativeCurrencyConversionRate = 0;
      try {
        [
          tokenExchangeRatesResponse,
          { conversionRate: vsCurrencyToNativeCurrencyConversionRate },
        ] = await Promise.all([
          this.fetchExchangeRate(FALL_BACK_VS_CURRENCY),
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
      const tokenExchangeRates = Object.assign(
        {},
        ...tokenExchangeRatesResponse,
      );
      for (const [tokenAddress, conversion] of Object.entries(
        tokenExchangeRates,
      )) {
        const conversionTyped = conversion as { [key: string]: number };

        const tokenToVsCurrencyConversionRate =
          conversionTyped[FALL_BACK_VS_CURRENCY.toLowerCase()];
        contractExchangeRates[toChecksumHexAddress(tokenAddress)] =
          tokenToVsCurrencyConversionRate *
          vsCurrencyToNativeCurrencyConversionRate;
      }
    }

    return contractExchangeRates;
  }
}

export default TokenRatesController;
