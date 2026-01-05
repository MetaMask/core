/**
 * Price API Service for MetaMask
 *
 * Provides SDK methods for interacting with the Price API (v1, v2, v3).
 * Supports token prices, exchange rates, and historical price data.
 *
 * This is a plain service class. For Messenger integration, use BackendApiClient.
 *
 * @see https://price.api.cx.metamask.io/docs-json
 */

import { HttpClient } from './HttpClient';
import type {
  BaseApiServiceOptions,
  GetTokenPricesOptions,
  GetTokenPricesResponse,
  GetHistoricalPricesOptions,
  GetHistoricalPricesResponse,
  MarketDataDetails,
  SupportedCurrency,
} from './types';

/**
 * Default Price API base URL
 */
const DEFAULT_BASE_URL = 'https://price.api.cx.metamask.io';

/**
 * Price API Service Options
 */
export type PriceApiServiceOptions = BaseApiServiceOptions;

/**
 * V3 Spot Prices Response - keyed by CAIP asset ID
 */
export type GetV3SpotPricesResponse = {
  [assetId: string]: MarketDataDetails;
};

/**
 * Exchange rate with metadata
 */
export type ExchangeRateInfo = {
  name: string;
  ticker: string;
  value: number;
  currencyType: 'crypto' | 'fiat';
};

/**
 * Exchange rates response with metadata
 */
export type GetExchangeRatesWithInfoResponse = {
  [currency: string]: ExchangeRateInfo;
};

/**
 * Supported networks response (v1)
 */
export type GetPriceSupportedNetworksV1Response = {
  fullSupport: string[];
  partialSupport: string[];
};

/**
 * Supported networks response (v2) - CAIP format
 */
export type GetPriceSupportedNetworksV2Response = {
  fullSupport: string[];
  partialSupport: string[];
};

/**
 * Spot price by CoinGecko ID response
 */
export type CoinGeckoSpotPrice = {
  id: string;
  price: number;
  marketCap?: number;
  allTimeHigh?: number;
  allTimeLow?: number;
  totalVolume?: number;
  high1d?: number;
  low1d?: number;
  circulatingSupply?: number;
  dilutedMarketCap?: number;
  marketCapPercentChange1d?: number;
  priceChange1d?: number;
  pricePercentChange1h?: number;
  pricePercentChange1d?: number;
  pricePercentChange7d?: number;
  pricePercentChange14d?: number;
  pricePercentChange30d?: number;
  pricePercentChange200d?: number;
  pricePercentChange1y?: number;
};

/**
 * Historical prices response (v3) with arrays of [timestamp, value] tuples
 */
export type GetV3HistoricalPricesResponse = {
  prices: [number, number][];
  marketCaps?: [number, number][];
  totalVolumes?: [number, number][];
};

/**
 * Price API Service
 *
 * SDK for interacting with MetaMask's Price API endpoints.
 * Provides methods for fetching token prices, exchange rates, and historical data.
 *
 * Supports three API versions:
 * - V1: Chain-specific token prices and CoinGecko ID based prices
 * - V2: Chain-specific spot prices with enhanced market data
 * - V3: Multi-chain spot prices using CAIP asset IDs
 */
/**
 * Method names exposed via BackendApiClient messenger
 */
export const PRICE_API_METHODS = [
  // Supported Networks
  'getV1SupportedNetworks',
  'getV2SupportedNetworks',
  // Exchange Rates
  'getV1ExchangeRates',
  'getV1FiatExchangeRates',
  'getV1CryptoExchangeRates',
  // V1 Spot Prices - CoinGecko ID based
  'getV1SpotPricesByCoinIds',
  'getV1SpotPriceByCoinId',
  // V1 Spot Prices - Token Address based
  'getV1TokenPrices',
  'getV1TokenPrice',
  // V2 Spot Prices
  'getV2SpotPrices',
  // V3 Spot Prices
  'getV3SpotPrices',
  // V1 Historical Prices
  'getV1HistoricalPricesByCoinId',
  'getV1HistoricalPricesByTokenAddresses',
  'getV1HistoricalPrices',
  // V3 Historical Prices
  'getV3HistoricalPrices',
  // V1 Historical Price Graph
  'getV1HistoricalPriceGraphByCoinId',
  'getV1HistoricalPriceGraphByTokenAddress',
] as const;

export class PriceApiService {
  readonly #client: HttpClient;

  constructor(options: PriceApiServiceOptions = {}) {
    this.#client = new HttpClient(options.baseUrl ?? DEFAULT_BASE_URL, options);
  }

  // ===========================================================================
  // Health & Utility Methods
  // ===========================================================================

  /**
   * Get service metadata
   *
   * @param signal - Optional abort signal
   * @returns Service metadata including product, service name, and version
   */
  async getServiceMetadata(
    signal?: AbortSignal,
  ): Promise<{ product: string; service: string; version: string }> {
    return this.#client.get('/', { signal });
  }

  /**
   * Get service health status
   *
   * @param signal - Optional abort signal
   * @returns Health status
   */
  async getHealth(signal?: AbortSignal): Promise<{ status: string }> {
    return this.#client.get('/health', { signal });
  }

  /**
   * Get service readiness status
   *
   * @param signal - Optional abort signal
   * @returns Readiness status
   */
  async getReadiness(signal?: AbortSignal): Promise<{ status: string }> {
    return this.#client.get('/health/readiness', { signal });
  }

  // ===========================================================================
  // Supported Networks Methods
  // ===========================================================================

  /**
   * Get supported networks (v1 endpoint)
   *
   * @param signal - Optional abort signal
   * @returns Supported networks with fullSupport and partialSupport arrays
   */
  async getV1SupportedNetworks(
    signal?: AbortSignal,
  ): Promise<GetPriceSupportedNetworksV1Response> {
    return this.#client.get('/v1/supportedNetworks', { signal });
  }

  /**
   * Get supported networks in CAIP format (v2 endpoint)
   *
   * @param signal - Optional abort signal
   * @returns Supported networks as CAIP-19 identifiers
   */
  async getV2SupportedNetworks(
    signal?: AbortSignal,
  ): Promise<GetPriceSupportedNetworksV2Response> {
    return this.#client.get('/v2/supportedNetworks', { signal });
  }

  // ===========================================================================
  // V1 Exchange Rate Methods
  // ===========================================================================

  /**
   * Get all exchange rates for a base currency (v1 endpoint)
   *
   * @param baseCurrency - Base currency code (e.g., 'eth', 'btc', 'usd')
   * @param signal - Optional abort signal
   * @returns Exchange rates with metadata
   */
  async getV1ExchangeRates(
    baseCurrency: string,
    signal?: AbortSignal,
  ): Promise<GetExchangeRatesWithInfoResponse> {
    return this.#client.get(`/v1/exchange-rates?baseCurrency=${baseCurrency}`, {
      signal,
    });
  }

  /**
   * Get fiat exchange rates (v1 endpoint)
   *
   * @param signal - Optional abort signal
   * @returns Fiat currency exchange rates
   */
  async getV1FiatExchangeRates(
    signal?: AbortSignal,
  ): Promise<GetExchangeRatesWithInfoResponse> {
    return this.#client.get('/v1/exchange-rates/fiat', { signal });
  }

  /**
   * Get crypto exchange rates (v1 endpoint)
   *
   * @param signal - Optional abort signal
   * @returns Crypto currency exchange rates
   */
  async getV1CryptoExchangeRates(
    signal?: AbortSignal,
  ): Promise<GetExchangeRatesWithInfoResponse> {
    return this.#client.get('/v1/exchange-rates/crypto', { signal });
  }

  // ===========================================================================
  // V1 Spot Price Methods - CoinGecko ID based
  // ===========================================================================

  /**
   * Get spot prices by CoinGecko coin IDs (v1 endpoint)
   *
   * @param coinIds - Comma-separated CoinGecko IDs (e.g., 'ethereum,bitcoin')
   * @param signal - Optional abort signal
   * @returns Spot prices keyed by coin ID
   */
  async getV1SpotPricesByCoinIds(
    coinIds: string[],
    signal?: AbortSignal,
  ): Promise<Record<string, CoinGeckoSpotPrice>> {
    if (coinIds.length === 0) {
      return {};
    }
    return this.#client.get(`/v1/spot-prices?coinIds=${coinIds.join(',')}`, {
      signal,
    });
  }

  /**
   * Get spot price for a single CoinGecko coin ID (v1 endpoint)
   *
   * @param coinId - CoinGecko coin ID (e.g., 'ethereum', 'bitcoin')
   * @param currency - Target currency (default: 'usd')
   * @param signal - Optional abort signal
   * @returns Spot price with market data
   */
  async getV1SpotPriceByCoinId(
    coinId: string,
    currency: SupportedCurrency = 'usd',
    signal?: AbortSignal,
  ): Promise<CoinGeckoSpotPrice> {
    return this.#client.get(
      `/v1/spot-prices/${coinId}?vsCurrency=${currency}`,
      { signal },
    );
  }

  // ===========================================================================
  // V1 Spot Price Methods - Token Address based
  // ===========================================================================

  /**
   * Get spot prices for tokens on a chain (v1 endpoint)
   *
   * @param options - Token prices request options
   * @param signal - Optional abort signal
   * @returns Token prices response
   */
  async getV1TokenPrices(
    options: GetTokenPricesOptions,
    signal?: AbortSignal,
  ): Promise<GetTokenPricesResponse> {
    const {
      chainId,
      tokenAddresses,
      currency = 'usd',
      includeMarketData = false,
    } = options;

    if (tokenAddresses.length === 0) {
      return {};
    }

    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();
    params.append('tokenAddresses', tokenAddresses.join(','));
    params.append('vsCurrency', currency);
    if (includeMarketData) {
      params.append('includeMarketData', 'true');
    }

    return this.#client.get(
      `/v1/chains/${chainIdDecimal}/spot-prices?${params.toString()}`,
      { signal },
    );
  }

  /**
   * Get spot price for a single token (v1 endpoint)
   *
   * @param chainId - Chain ID in hex format
   * @param tokenAddress - Token contract address
   * @param currency - Target currency (default: 'usd')
   * @param signal - Optional abort signal
   * @returns Token price data
   */
  async getV1TokenPrice(
    chainId: string,
    tokenAddress: string,
    currency: SupportedCurrency = 'usd',
    signal?: AbortSignal,
  ): Promise<MarketDataDetails | undefined> {
    const chainIdDecimal = parseInt(chainId, 16);
    try {
      return await this.#client.get(
        `/v1/chains/${chainIdDecimal}/spot-prices/${tokenAddress}?vsCurrency=${currency}`,
        { signal },
      );
    } catch {
      return undefined;
    }
  }

  // ===========================================================================
  // V2 Spot Price Methods
  // ===========================================================================

  /**
   * Get spot prices for tokens on a chain with market data (v2 endpoint)
   *
   * @param chainId - Chain ID in hex format
   * @param tokenAddresses - Array of token contract addresses
   * @param currency - Target currency (default: 'usd')
   * @param includeMarketData - Include market data (default: true)
   * @param signal - Optional abort signal
   * @returns Token prices with market data
   */
  async getV2SpotPrices(
    chainId: string,
    tokenAddresses: string[],
    currency: SupportedCurrency = 'usd',
    includeMarketData: boolean = true,
    signal?: AbortSignal,
  ): Promise<Record<string, MarketDataDetails>> {
    if (tokenAddresses.length === 0) {
      return {};
    }

    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();
    params.append('tokenAddresses', tokenAddresses.join(','));
    params.append('vsCurrency', currency);
    params.append('includeMarketData', String(includeMarketData));

    return this.#client.get(
      `/v2/chains/${chainIdDecimal}/spot-prices?${params.toString()}`,
      { signal },
    );
  }

  // ===========================================================================
  // V3 Spot Price Methods - CAIP-19 based
  // ===========================================================================

  /**
   * Get spot prices by CAIP-19 asset IDs (v3 endpoint)
   *
   * This is the most efficient method for fetching prices across multiple chains.
   *
   * @param assetIds - Array of CAIP-19 asset IDs
   * @param currency - Target currency (default: 'usd')
   * @param includeMarketData - Include market data (default: true)
   * @param cacheOnly - Only return cached prices (default: false)
   * @param signal - Optional abort signal
   * @returns Spot prices keyed by asset ID
   *
   * @example
   * ```typescript
   * const prices = await priceApi.getV3SpotPrices([
   *   'eip155:1/slip44:60',           // Native ETH
   *   'eip155:1/erc20:0xa0b86991...', // USDC on Ethereum
   *   'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5...', // USDC on Solana
   * ]);
   * ```
   */
  async getV3SpotPrices(
    assetIds: string[],
    currency: SupportedCurrency = 'usd',
    includeMarketData: boolean = true,
    cacheOnly: boolean = false,
    signal?: AbortSignal,
  ): Promise<GetV3SpotPricesResponse> {
    if (assetIds.length === 0) {
      return {};
    }

    const params = new URLSearchParams();
    params.append('assetIds', assetIds.join(','));
    params.append('vsCurrency', currency.toUpperCase());
    params.append('includeMarketData', String(includeMarketData));
    params.append('cacheOnly', String(cacheOnly));

    return this.#client.get(`/v3/spot-prices?${params.toString()}`, { signal });
  }

  // ===========================================================================
  // V1 Historical Price Methods - CoinGecko ID based
  // ===========================================================================

  /**
   * Get historical prices by CoinGecko coin ID (v1 endpoint)
   *
   * @param coinId - CoinGecko coin ID
   * @param options - Query options
   * @param options.currency - Currency for prices
   * @param options.timePeriod - Time period for historical data
   * @param options.from - Start timestamp
   * @param options.to - End timestamp
   * @param signal - Optional abort signal
   * @returns Historical price data
   */
  async getV1HistoricalPricesByCoinId(
    coinId: string,
    options?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    signal?: AbortSignal,
  ): Promise<GetHistoricalPricesResponse> {
    const params = new URLSearchParams();
    if (options?.currency) {
      params.append('vsCurrency', options.currency);
    }
    if (options?.timePeriod) {
      params.append('timePeriod', options.timePeriod);
    }
    if (options?.from) {
      params.append('from', String(options.from));
    }
    if (options?.to) {
      params.append('to', String(options.to));
    }

    const queryString = params.toString();
    return this.#client.get(
      `/v1/historical-prices/${coinId}${queryString ? `?${queryString}` : ''}`,
      { signal },
    );
  }

  // ===========================================================================
  // V1 Historical Price Methods - Token Address based
  // ===========================================================================

  /**
   * Get historical prices for tokens on a chain (v1 endpoint)
   *
   * @param chainId - Chain ID in hex format
   * @param tokenAddresses - Array of token addresses
   * @param options - Query options
   * @param options.currency - Currency for prices
   * @param options.timePeriod - Time period for historical data
   * @param options.from - Start timestamp
   * @param options.to - End timestamp
   * @param signal - Optional abort signal
   * @returns Historical price data
   */
  async getV1HistoricalPricesByTokenAddresses(
    chainId: string,
    tokenAddresses: string[],
    options?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    signal?: AbortSignal,
  ): Promise<GetHistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();
    params.append('tokenAddresses', tokenAddresses.join(','));
    if (options?.currency) {
      params.append('vsCurrency', options.currency);
    }
    if (options?.timePeriod) {
      params.append('timePeriod', options.timePeriod);
    }
    if (options?.from) {
      params.append('from', String(options.from));
    }
    if (options?.to) {
      params.append('to', String(options.to));
    }

    return this.#client.get(
      `/v1/chains/${chainIdDecimal}/historical-prices?${params.toString()}`,
      { signal },
    );
  }

  /**
   * Get historical prices for a single token (v1 endpoint)
   *
   * @param options - Historical prices request options
   * @param signal - Optional abort signal
   * @returns Historical price data
   */
  async getV1HistoricalPrices(
    options: GetHistoricalPricesOptions,
    signal?: AbortSignal,
  ): Promise<GetHistoricalPricesResponse> {
    const {
      chainId,
      tokenAddress,
      currency = 'usd',
      timeRange = '7d',
    } = options;

    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();
    params.append('vsCurrency', currency);
    params.append('timePeriod', timeRange);

    return this.#client.get(
      `/v1/chains/${chainIdDecimal}/historical-prices/${tokenAddress}?${params.toString()}`,
      { signal },
    );
  }

  // ===========================================================================
  // V3 Historical Price Methods - CAIP-19 based
  // ===========================================================================

  /**
   * Get historical prices by CAIP-19 asset ID (v3 endpoint)
   *
   * Returns price data optimized for chart rendering with [timestamp, value] tuples.
   *
   * @param chainId - CAIP-2 chain ID (e.g., 'eip155:1')
   * @param assetType - Asset type (e.g., 'erc20:0x...', 'slip44:60')
   * @param options - Query options
   * @param options.currency - Currency for prices
   * @param options.timePeriod - Time period for historical data
   * @param options.from - Start timestamp
   * @param options.to - End timestamp
   * @param options.interval - Data point interval (5m, hourly, daily)
   * @param signal - Optional abort signal
   * @returns Historical prices with optional market caps and volumes
   *
   * @example
   * ```typescript
   * const history = await priceApi.getV3HistoricalPrices(
   *   'eip155:1',
   *   'slip44:60',
   *   { timePeriod: '30d', interval: 'daily' }
   * );
   * ```
   */
  async getV3HistoricalPrices(
    chainId: string,
    assetType: string,
    options?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
      interval?: '5m' | 'hourly' | 'daily';
    },
    signal?: AbortSignal,
  ): Promise<GetV3HistoricalPricesResponse> {
    const params = new URLSearchParams();
    if (options?.currency) {
      params.append('vsCurrency', options.currency);
    }
    if (options?.timePeriod) {
      params.append('timePeriod', options.timePeriod);
    }
    if (options?.from) {
      params.append('from', String(options.from));
    }
    if (options?.to) {
      params.append('to', String(options.to));
    }
    if (options?.interval) {
      params.append('interval', options.interval);
    }

    const queryString = params.toString();
    return this.#client.get(
      `/v3/historical-prices/${chainId}/${assetType}${queryString ? `?${queryString}` : ''}`,
      { signal },
    );
  }

  // ===========================================================================
  // V1 Historical Price Graph Methods
  // ===========================================================================

  /**
   * Get historical price graph data by CoinGecko coin ID (v1 endpoint)
   *
   * Returns data optimized for chart rendering.
   *
   * @param coinId - CoinGecko coin ID
   * @param currency - Target currency (default: 'usd')
   * @param includeOHLC - Include OHLC data (default: false)
   * @param signal - Optional abort signal
   * @returns Price graph data
   */
  async getV1HistoricalPriceGraphByCoinId(
    coinId: string,
    currency: SupportedCurrency = 'usd',
    includeOHLC: boolean = false,
    signal?: AbortSignal,
  ): Promise<GetV3HistoricalPricesResponse> {
    const params = new URLSearchParams();
    params.append('vsCurrency', currency);
    params.append('includeOHLC', String(includeOHLC));

    return this.#client.get(
      `/v1/historical-prices-graph/${coinId}?${params.toString()}`,
      { signal },
    );
  }

  /**
   * Get historical price graph data by token address (v1 endpoint)
   *
   * @param chainId - Chain ID in hex format
   * @param tokenAddress - Token contract address
   * @param currency - Target currency (default: 'usd')
   * @param includeOHLC - Include OHLC data (default: false)
   * @param signal - Optional abort signal
   * @returns Price graph data
   */
  async getV1HistoricalPriceGraphByTokenAddress(
    chainId: string,
    tokenAddress: string,
    currency: SupportedCurrency = 'usd',
    includeOHLC: boolean = false,
    signal?: AbortSignal,
  ): Promise<GetV3HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();
    params.append('vsCurrency', currency);
    params.append('includeOHLC', String(includeOHLC));

    return this.#client.get(
      `/v1/chains/${chainIdDecimal}/historical-prices-graph/${tokenAddress}?${params.toString()}`,
      { signal },
    );
  }
}
