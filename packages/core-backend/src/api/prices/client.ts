/**
 * Prices API Client - price.api.cx.metamask.io
 *
 * Handles all price-related API calls including:
 * - Supported networks
 * - Exchange rates
 * - Spot prices (v1, v2, v3)
 * - Historical prices
 * - Price graphs
 */

import type { QueryFunctionContext } from '@tanstack/query-core';

import type {
  CoinGeckoSpotPrice,
  V1ExchangeRatesResponse,
  PriceSupportedNetworksResponse,
  V1HistoricalPricesResponse,
  V3SpotPricesResponse,
  V3HistoricalPricesResponse,
} from './types';
import { BaseApiClient, API_URLS, STALE_TIMES, GC_TIMES } from '../base-client';
import type {
  FetchOptions,
  SupportedCurrency,
  MarketDataDetails,
} from '../shared-types';

/**
 * Prices API Client.
 * Provides methods for interacting with the Price API.
 */
export class PricesApiClient extends BaseApiClient {
  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Invalidate all price queries.
   */
  async invalidatePrices(): Promise<void> {
    await this.queryClient.invalidateQueries({
      queryKey: ['prices'],
    });
  }

  // ==========================================================================
  // SUPPORTED NETWORKS
  // ==========================================================================

  /**
   * Get price supported networks (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The supported networks response.
   */
  async fetchPriceV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<PriceSupportedNetworksResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v1SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<PriceSupportedNetworksResponse>(
          API_URLS.PRICES,
          '/v1/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  /**
   * Get price supported networks in CAIP format (v2 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The supported networks response.
   */
  async fetchPriceV2SupportedNetworks(
    options?: FetchOptions,
  ): Promise<PriceSupportedNetworksResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v2SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<PriceSupportedNetworksResponse>(
          API_URLS.PRICES,
          '/v2/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // EXCHANGE RATES
  // ==========================================================================

  /**
   * Get all exchange rates for a base currency (v1 endpoint).
   *
   * @param baseCurrency - The base currency code.
   * @param options - Fetch options including cache settings.
   * @returns The exchange rates response.
   */
  async fetchV1ExchangeRates(
    baseCurrency: string,
    options?: FetchOptions,
  ): Promise<V1ExchangeRatesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v1ExchangeRates', baseCurrency],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates',
          {
            signal,
            params: { baseCurrency },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get fiat exchange rates (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The exchange rates response.
   */
  async fetchV1FiatExchangeRates(
    options?: FetchOptions,
  ): Promise<V1ExchangeRatesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v1FiatExchangeRates'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates/fiat',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get crypto exchange rates (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The exchange rates response.
   */
  async fetchV1CryptoExchangeRates(
    options?: FetchOptions,
  ): Promise<V1ExchangeRatesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v1CryptoExchangeRates'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates/crypto',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // V1 SPOT PRICES (CoinGecko ID based)
  // ==========================================================================

  /**
   * Get spot prices by CoinGecko coin IDs (v1 endpoint).
   *
   * @param coinIds - Array of CoinGecko coin IDs.
   * @param options - Fetch options including cache settings.
   * @returns The spot prices by coin ID.
   */
  async fetchV1SpotPricesByCoinIds(
    coinIds: string[],
    options?: FetchOptions,
  ): Promise<Record<string, CoinGeckoSpotPrice>> {
    if (coinIds.length === 0) {
      return {};
    }
    return this.queryClient.fetchQuery({
      queryKey: [
        'prices',
        'v1SpotPricesByCoinIds',
        { coinIds: [...coinIds].sort() },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<Record<string, CoinGeckoSpotPrice>>(
          API_URLS.PRICES,
          '/v1/spot-prices',
          {
            signal,
            params: { coinIds },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get spot price for a single CoinGecko coin ID (v1 endpoint).
   *
   * @param coinId - The CoinGecko coin ID.
   * @param currency - The currency for prices.
   * @param options - Fetch options including cache settings.
   * @returns The spot price data.
   */
  async fetchV1SpotPriceByCoinId(
    coinId: string,
    currency: SupportedCurrency = 'usd',
    options?: FetchOptions,
  ): Promise<CoinGeckoSpotPrice> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v1SpotPriceByCoinId', coinId, currency],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<CoinGeckoSpotPrice>(
          API_URLS.PRICES,
          `/v1/spot-prices/${coinId}`,
          {
            signal,
            params: { vsCurrency: currency },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // V1 SPOT PRICES (Token Address based)
  // ==========================================================================

  /**
   * Get spot prices for tokens on a chain (v1 endpoint).
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddresses - Array of token addresses.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeMarketData - Whether to include market data.
   * @param options - Fetch options including cache settings.
   * @returns The token prices by address.
   */
  async fetchV1TokenPrices(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
    },
    options?: FetchOptions,
  ): Promise<Record<string, Record<string, number>>> {
    if (tokenAddresses.length === 0) {
      return {};
    }
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    return this.queryClient.fetchQuery({
      queryKey: [
        'prices',
        'v1TokenPrices',
        {
          chainId,
          tokenAddresses: [...tokenAddresses].sort(),
          currency,
          includeMarketData: queryOptions?.includeMarketData,
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<Record<string, Record<string, number>>>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/spot-prices`,
          {
            signal,
            params: {
              tokenAddresses,
              vsCurrency: currency,
              includeMarketData: queryOptions?.includeMarketData,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get spot price for a single token (v1 endpoint).
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddress - The token address.
   * @param currency - The currency for prices.
   * @param options - Fetch options including cache settings.
   * @returns The market data or undefined.
   */
  async fetchV1TokenPrice(
    chainId: string,
    tokenAddress: string,
    currency: SupportedCurrency = 'usd',
    options?: FetchOptions,
  ): Promise<MarketDataDetails | undefined> {
    const chainIdDecimal = parseInt(chainId, 16);
    try {
      return await this.queryClient.fetchQuery({
        queryKey: ['prices', 'v1TokenPrice', chainId, tokenAddress, currency],
        queryFn: ({ signal }: QueryFunctionContext) =>
          this.fetch<MarketDataDetails>(
            API_URLS.PRICES,
            `/v1/chains/${chainIdDecimal}/spot-prices/${tokenAddress}`,
            {
              signal,
              params: { vsCurrency: currency },
            },
          ),
        staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
        gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
      });
    } catch {
      return undefined;
    }
  }

  // ==========================================================================
  // V2 SPOT PRICES
  // ==========================================================================

  /**
   * Get spot prices for tokens on a chain with market data (v2 endpoint).
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddresses - Array of token addresses.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeMarketData - Whether to include market data.
   * @param options - Fetch options including cache settings.
   * @returns The spot prices with market data.
   */
  async fetchV2SpotPrices(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
    },
    options?: FetchOptions,
  ): Promise<Record<string, MarketDataDetails>> {
    if (tokenAddresses.length === 0) {
      return {};
    }
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const includeMarketData = queryOptions?.includeMarketData ?? true;
    return this.queryClient.fetchQuery({
      queryKey: [
        'prices',
        'v2SpotPrices',
        {
          chainId,
          tokenAddresses: [...tokenAddresses].sort(),
          currency,
          includeMarketData,
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<Record<string, MarketDataDetails>>(
          API_URLS.PRICES,
          `/v2/chains/${chainIdDecimal}/spot-prices`,
          {
            signal,
            params: {
              tokenAddresses,
              vsCurrency: currency,
              includeMarketData: queryOptions?.includeMarketData ?? true,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // V3 SPOT PRICES (CAIP-19 based)
  // ==========================================================================

  /**
   * Get spot prices by CAIP-19 asset IDs (v3 endpoint).
   *
   * @param assetIds - Array of CAIP-19 asset IDs.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeMarketData - Whether to include market data.
   * @param queryOptions.cacheOnly - Whether to use cache only.
   * @param options - Fetch options including cache settings.
   * @returns The spot prices response.
   */
  async fetchV3SpotPrices(
    assetIds: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
      cacheOnly?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V3SpotPricesResponse> {
    if (assetIds.length === 0) {
      return {};
    }
    const currency = queryOptions?.currency ?? 'usd';
    const includeMarketData = queryOptions?.includeMarketData ?? true;
    const cacheOnly = queryOptions?.cacheOnly ?? false;
    return this.queryClient.fetchQuery({
      queryKey: [
        'prices',
        'v3SpotPrices',
        {
          assetIds: [...assetIds].sort(),
          currency,
          includeMarketData,
          cacheOnly,
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V3SpotPricesResponse>(API_URLS.PRICES, '/v3/spot-prices', {
          signal,
          params: {
            assetIds,
            vsCurrency: currency,
            includeMarketData,
            cacheOnly,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // V1 HISTORICAL PRICES
  // ==========================================================================

  /**
   * Get historical prices by CoinGecko coin ID (v1 endpoint).
   *
   * @param coinId - The CoinGecko coin ID.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.timePeriod - The time period.
   * @param queryOptions.from - Start timestamp.
   * @param queryOptions.to - End timestamp.
   * @param options - Fetch options including cache settings.
   * @returns The historical prices response.
   */
  async fetchV1HistoricalPricesByCoinId(
    coinId: string,
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    options?: FetchOptions,
  ): Promise<V1HistoricalPricesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v1HistoricalByCoinId', coinId, queryOptions],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/historical-prices/${coinId}`,
          {
            signal,
            params: {
              vsCurrency: queryOptions?.currency,
              timePeriod: queryOptions?.timePeriod,
              from: queryOptions?.from,
              to: queryOptions?.to,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get historical prices for tokens on a chain (v1 endpoint).
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddresses - Array of token addresses.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.timePeriod - The time period.
   * @param queryOptions.from - Start timestamp.
   * @param queryOptions.to - End timestamp.
   * @param options - Fetch options including cache settings.
   * @returns The historical prices response.
   */
  async fetchV1HistoricalPricesByTokenAddresses(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    options?: FetchOptions,
  ): Promise<V1HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    return this.queryClient.fetchQuery({
      queryKey: [
        'prices',
        'v1HistoricalByTokenAddresses',
        {
          chainId,
          tokenAddresses: [...tokenAddresses].sort(),
          options: queryOptions,
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/historical-prices`,
          {
            signal,
            params: {
              tokenAddresses,
              vsCurrency: queryOptions?.currency,
              timePeriod: queryOptions?.timePeriod,
              from: queryOptions?.from,
              to: queryOptions?.to,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get historical prices for a single token (v1 endpoint).
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddress - The token address.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.timeRange - The time range.
   * @param options - Fetch options including cache settings.
   * @returns The historical prices response.
   */
  async fetchV1HistoricalPrices(
    chainId: string,
    tokenAddress: string,
    queryOptions?: { currency?: SupportedCurrency; timeRange?: string },
    options?: FetchOptions,
  ): Promise<V1HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const timeRange = queryOptions?.timeRange ?? '7d';
    return this.queryClient.fetchQuery({
      queryKey: [
        'prices',
        'v1Historical',
        chainId,
        tokenAddress,
        currency,
        timeRange,
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/historical-prices/${tokenAddress}`,
          {
            signal,
            params: {
              vsCurrency: currency,
              timePeriod: timeRange,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // V3 HISTORICAL PRICES
  // ==========================================================================

  /**
   * Get historical prices by CAIP-19 asset ID (v3 endpoint).
   *
   * @param chainId - The CAIP-2 chain ID.
   * @param assetType - The asset type portion of CAIP-19.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.timePeriod - The time period.
   * @param queryOptions.from - Start timestamp.
   * @param queryOptions.to - End timestamp.
   * @param queryOptions.interval - Data interval.
   * @param options - Fetch options including cache settings.
   * @returns The historical prices response.
   */
  async fetchV3HistoricalPrices(
    chainId: string,
    assetType: string,
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
      interval?: '5m' | 'hourly' | 'daily';
    },
    options?: FetchOptions,
  ): Promise<V3HistoricalPricesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v3Historical', chainId, assetType, queryOptions],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V3HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v3/historical-prices/${chainId}/${assetType}`,
          {
            signal,
            params: {
              vsCurrency: queryOptions?.currency,
              timePeriod: queryOptions?.timePeriod,
              from: queryOptions?.from,
              to: queryOptions?.to,
              interval: queryOptions?.interval,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // V1 HISTORICAL PRICE GRAPH
  // ==========================================================================

  /**
   * Get historical price graph data by CoinGecko coin ID (v1 endpoint).
   *
   * @param coinId - The CoinGecko coin ID.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeOHLC - Whether to include OHLC data.
   * @param options - Fetch options including cache settings.
   * @returns The historical price graph response.
   */
  async fetchV1HistoricalPriceGraphByCoinId(
    coinId: string,
    queryOptions?: { currency?: SupportedCurrency; includeOHLC?: boolean },
    options?: FetchOptions,
  ): Promise<V3HistoricalPricesResponse> {
    const currency = queryOptions?.currency ?? 'usd';
    const includeOHLC = queryOptions?.includeOHLC ?? false;
    return this.queryClient.fetchQuery({
      queryKey: ['prices', 'v1GraphByCoinId', coinId, currency, includeOHLC],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V3HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/historical-prices-graph/${coinId}`,
          {
            signal,
            params: {
              vsCurrency: currency,
              includeOHLC,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get historical price graph data by token address (v1 endpoint).
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddress - The token address.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeOHLC - Whether to include OHLC data.
   * @param options - Fetch options including cache settings.
   * @returns The historical price graph response.
   */
  async fetchV1HistoricalPriceGraphByTokenAddress(
    chainId: string,
    tokenAddress: string,
    queryOptions?: { currency?: SupportedCurrency; includeOHLC?: boolean },
    options?: FetchOptions,
  ): Promise<V3HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const includeOHLC = queryOptions?.includeOHLC ?? false;
    return this.queryClient.fetchQuery({
      queryKey: [
        'prices',
        'v1GraphByTokenAddress',
        chainId,
        tokenAddress,
        currency,
        includeOHLC,
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V3HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/historical-prices-graph/${tokenAddress}`,
          {
            signal,
            params: {
              vsCurrency: currency,
              includeOHLC,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }
}
