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

import type {
  FetchQueryOptions,
  QueryFunctionContext,
} from '@tanstack/query-core';

import type {
  CoinGeckoSpotPrice,
  V1ExchangeRatesResponse,
  PriceSupportedNetworksResponse,
  V1HistoricalPricesResponse,
  V3SpotPricesResponse,
  V3HistoricalPricesResponse,
} from './types';
import { BaseApiClient, API_URLS, STALE_TIMES, GC_TIMES } from '../base-client';
import { getQueryOptionsOverrides } from '../shared-types';
import type {
  FetchOptions,
  MarketDataDetails,
  SupportedCurrency,
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
   * Returns the TanStack Query options object for price v1 supported networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getPriceV1SupportedNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<PriceSupportedNetworksResponse> {
    return {
      queryKey: ['prices', 'v1SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<PriceSupportedNetworksResponse>(
          API_URLS.PRICES,
          '/v1/supportedNetworks',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get price supported networks (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The supported networks response.
   */
  async fetchPriceV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<PriceSupportedNetworksResponse> {
    return this.queryClient.fetchQuery(
      this.getPriceV1SupportedNetworksQueryOptions(options),
    );
  }

  /**
   * Returns the TanStack Query options object for price v2 supported networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getPriceV2SupportedNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<PriceSupportedNetworksResponse> {
    return {
      queryKey: ['prices', 'v2SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<PriceSupportedNetworksResponse>(
          API_URLS.PRICES,
          '/v2/supportedNetworks',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
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
    return this.queryClient.fetchQuery(
      this.getPriceV2SupportedNetworksQueryOptions(options),
    );
  }

  // ==========================================================================
  // EXCHANGE RATES
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 exchange rates.
   *
   * @param baseCurrency - The base currency code.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1ExchangeRatesQueryOptions(
    baseCurrency: string,
    options?: FetchOptions,
  ): FetchQueryOptions<V1ExchangeRatesResponse> {
    return {
      queryKey: ['prices', 'v1ExchangeRates', baseCurrency],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V1ExchangeRatesResponse> => {
        if (baseCurrency === '') {
          return {};
        }
        return this.fetch<V1ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates',
          {
            signal,
            params: { baseCurrency },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    if (baseCurrency === '') {
      return {};
    }
    return this.queryClient.fetchQuery(
      this.getV1ExchangeRatesQueryOptions(baseCurrency, options),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 fiat exchange rates.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1FiatExchangeRatesQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<V1ExchangeRatesResponse> {
    return {
      queryKey: ['prices', 'v1FiatExchangeRates'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates/fiat',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    return this.queryClient.fetchQuery(
      this.getV1FiatExchangeRatesQueryOptions(options),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 crypto exchange rates.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1CryptoExchangeRatesQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<V1ExchangeRatesResponse> {
    return {
      queryKey: ['prices', 'v1CryptoExchangeRates'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates/crypto',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    return this.queryClient.fetchQuery(
      this.getV1CryptoExchangeRatesQueryOptions(options),
    );
  }

  // ==========================================================================
  // V1 SPOT PRICES (CoinGecko ID based)
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 spot prices by coin IDs.
   *
   * @param coinIds - Array of CoinGecko coin IDs.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1SpotPricesByCoinIdsQueryOptions(
    coinIds: string[],
    options?: FetchOptions,
  ): FetchQueryOptions<Record<string, CoinGeckoSpotPrice>> {
    return {
      queryKey: [
        'prices',
        'v1SpotPricesByCoinIds',
        { coinIds: [...coinIds].sort() },
      ],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<Record<string, CoinGeckoSpotPrice>> => {
        if (coinIds.length === 0) {
          return {};
        }
        return this.fetch<Record<string, CoinGeckoSpotPrice>>(
          API_URLS.PRICES,
          '/v1/spot-prices',
          {
            signal,
            params: { coinIds },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    return this.queryClient.fetchQuery(
      this.getV1SpotPricesByCoinIdsQueryOptions(coinIds, options),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 spot price by coin ID.
   *
   * @param coinId - The CoinGecko coin ID.
   * @param currency - The currency for prices.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1SpotPriceByCoinIdQueryOptions(
    coinId: string,
    currency: SupportedCurrency = 'usd',
    options?: FetchOptions,
  ): FetchQueryOptions<CoinGeckoSpotPrice> {
    return {
      queryKey: ['prices', 'v1SpotPriceByCoinId', coinId, currency],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<CoinGeckoSpotPrice> => {
        if (coinId === '') {
          return { id: '', price: 0 };
        }
        return this.fetch<CoinGeckoSpotPrice>(
          API_URLS.PRICES,
          `/v1/spot-prices/${coinId}`,
          {
            signal,
            params: { vsCurrency: currency },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    return this.queryClient.fetchQuery(
      this.getV1SpotPriceByCoinIdQueryOptions(coinId, currency, options),
    );
  }

  // ==========================================================================
  // V1 SPOT PRICES (Token Address based)
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 token prices.
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddresses - Array of token addresses.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeMarketData - Whether to include market data.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1TokenPricesQueryOptions(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<Record<string, Record<string, number>>> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<
        Record<string, Record<string, number>>
      > => {
        if (chainId === '' || tokenAddresses.length === 0) {
          return {};
        }
        return this.fetch<Record<string, Record<string, number>>>(
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
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    if (chainId === '' || tokenAddresses.length === 0) {
      return {};
    }
    return this.queryClient.fetchQuery(
      this.getV1TokenPricesQueryOptions(
        chainId,
        tokenAddresses,
        queryOptions,
        options,
      ),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 token price.
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddress - The token address.
   * @param currency - The currency for prices.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1TokenPriceQueryOptions(
    chainId: string,
    tokenAddress: string,
    currency: SupportedCurrency = 'usd',
    options?: FetchOptions,
  ): FetchQueryOptions<MarketDataDetails> {
    const chainIdDecimal = parseInt(chainId, 16);
    return {
      queryKey: ['prices', 'v1TokenPrice', chainId, tokenAddress, currency],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<MarketDataDetails> => {
        return this.fetch<MarketDataDetails>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/spot-prices/${tokenAddress}`,
          {
            signal,
            params: { vsCurrency: currency },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

  /**
   * Get spot price for a single token (v1 endpoint).
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddress - The token address.
   * @param currency - The currency for prices.
   * @param options - Fetch options including cache settings.
   * @returns The market data.
   */
  async fetchV1TokenPrice(
    chainId: string,
    tokenAddress: string,
    currency: SupportedCurrency = 'usd',
    options?: FetchOptions,
  ): Promise<MarketDataDetails> {
    return this.queryClient.fetchQuery(
      this.getV1TokenPriceQueryOptions(
        chainId,
        tokenAddress,
        currency,
        options,
      ),
    );
  }

  // ==========================================================================
  // V2 SPOT PRICES
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v2 spot prices.
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddresses - Array of token addresses.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeMarketData - Whether to include market data.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2SpotPricesQueryOptions(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<Record<string, MarketDataDetails>> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const includeMarketData = queryOptions?.includeMarketData ?? true;
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<Record<string, MarketDataDetails>> => {
        if (chainId === '' || tokenAddresses.length === 0) {
          return {};
        }
        return this.fetch<Record<string, MarketDataDetails>>(
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
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    if (chainId === '' || tokenAddresses.length === 0) {
      return {};
    }
    return this.queryClient.fetchQuery(
      this.getV2SpotPricesQueryOptions(
        chainId,
        tokenAddresses,
        queryOptions,
        options,
      ),
    );
  }

  // ==========================================================================
  // V3 SPOT PRICES (CAIP-19 based)
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v3 spot prices.
   *
   * @param assetIds - Array of CAIP-19 asset IDs.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeMarketData - Whether to include market data.
   * @param queryOptions.cacheOnly - Whether to use cache only.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3SpotPricesQueryOptions(
    assetIds: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
      cacheOnly?: boolean;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V3SpotPricesResponse> {
    const currency = queryOptions?.currency ?? 'usd';
    const includeMarketData = queryOptions?.includeMarketData ?? true;
    const cacheOnly = queryOptions?.cacheOnly ?? false;
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V3SpotPricesResponse> => {
        if (assetIds.length === 0) {
          return {};
        }
        return this.fetch<V3SpotPricesResponse>(
          API_URLS.PRICES,
          '/v3/spot-prices',
          {
            signal,
            params: {
              assetIds,
              vsCurrency: currency,
              includeMarketData,
              cacheOnly,
            },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    return this.queryClient.fetchQuery(
      this.getV3SpotPricesQueryOptions(assetIds, queryOptions, options),
    );
  }

  // ==========================================================================
  // V1 HISTORICAL PRICES
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 historical prices by coin ID.
   *
   * @param coinId - The CoinGecko coin ID.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.timePeriod - The time period.
   * @param queryOptions.from - Start timestamp.
   * @param queryOptions.to - End timestamp.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1HistoricalPricesByCoinIdQueryOptions(
    coinId: string,
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V1HistoricalPricesResponse> {
    return {
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
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    return this.queryClient.fetchQuery(
      this.getV1HistoricalPricesByCoinIdQueryOptions(
        coinId,
        queryOptions,
        options,
      ),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 historical prices by token addresses.
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddresses - Array of token addresses.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.timePeriod - The time period.
   * @param queryOptions.from - Start timestamp.
   * @param queryOptions.to - End timestamp.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1HistoricalPricesByTokenAddressesQueryOptions(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V1HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    return {
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
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    return this.queryClient.fetchQuery(
      this.getV1HistoricalPricesByTokenAddressesQueryOptions(
        chainId,
        tokenAddresses,
        queryOptions,
        options,
      ),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 historical prices.
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddress - The token address.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.timeRange - The time range.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1HistoricalPricesQueryOptions(
    chainId: string,
    tokenAddress: string,
    queryOptions?: { currency?: SupportedCurrency; timeRange?: string },
    options?: FetchOptions,
  ): FetchQueryOptions<V1HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const timeRange = queryOptions?.timeRange ?? '7d';
    return {
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
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    return this.queryClient.fetchQuery(
      this.getV1HistoricalPricesQueryOptions(
        chainId,
        tokenAddress,
        queryOptions,
        options,
      ),
    );
  }

  // ==========================================================================
  // V3 HISTORICAL PRICES
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v3 historical prices.
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
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3HistoricalPricesQueryOptions(
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
  ): FetchQueryOptions<V3HistoricalPricesResponse> {
    return {
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
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    return this.queryClient.fetchQuery(
      this.getV3HistoricalPricesQueryOptions(
        chainId,
        assetType,
        queryOptions,
        options,
      ),
    );
  }

  // ==========================================================================
  // V1 HISTORICAL PRICE GRAPH
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 historical price graph by coin ID.
   *
   * @param coinId - The CoinGecko coin ID.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeOHLC - Whether to include OHLC data.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1HistoricalPriceGraphByCoinIdQueryOptions(
    coinId: string,
    queryOptions?: { currency?: SupportedCurrency; includeOHLC?: boolean },
    options?: FetchOptions,
  ): FetchQueryOptions<V3HistoricalPricesResponse> {
    const currency = queryOptions?.currency ?? 'usd';
    const includeOHLC = queryOptions?.includeOHLC ?? false;
    return {
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
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    return this.queryClient.fetchQuery(
      this.getV1HistoricalPriceGraphByCoinIdQueryOptions(
        coinId,
        queryOptions,
        options,
      ),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 historical price graph by token address.
   *
   * @param chainId - The chain ID (hex format).
   * @param tokenAddress - The token address.
   * @param queryOptions - Query options.
   * @param queryOptions.currency - The currency for prices.
   * @param queryOptions.includeOHLC - Whether to include OHLC data.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1HistoricalPriceGraphByTokenAddressQueryOptions(
    chainId: string,
    tokenAddress: string,
    queryOptions?: { currency?: SupportedCurrency; includeOHLC?: boolean },
    options?: FetchOptions,
  ): FetchQueryOptions<V3HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const includeOHLC = queryOptions?.includeOHLC ?? false;
    return {
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
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    return this.queryClient.fetchQuery(
      this.getV1HistoricalPriceGraphByTokenAddressQueryOptions(
        chainId,
        tokenAddress,
        queryOptions,
        options,
      ),
    );
  }
}
