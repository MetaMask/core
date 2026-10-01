/**
 * Token API Client - token.api.cx.metamask.io
 *
 * Handles all token-related API calls including:
 * - Supported networks
 * - Token lists
 * - Token metadata
 * - Token descriptions
 * - Token search
 * - Token security data
 * - Assets by CAIP-19 ID (v1 / v2)
 * - Real World Assets (RWAs)
 * - Trending tokens
 * - Top gainers/popular tokens
 * - Meme tokens
 * - Top assets
 * - Sparklines
 * - Occurrence floors
 */

import type {
  FetchQueryOptions,
  QueryFunctionContext,
} from '@tanstack/query-core';

import { BaseApiClient, STALE_TIMES, GC_TIMES } from '../base-client.js';
import { getQueryOptionsOverrides } from '../shared-types.js';
import type { FetchOptions } from '../shared-types.js';
import type {
  AssetsQueryOptions,
  MemeToken,
  NetworkInfo,
  TokenListQueryOptions,
  TokenMetadata,
  TokenSearchQueryOptions,
  TokenSearchResponse,
  TokenV2SupportedNetworksResponse,
  TopAsset,
  TrendingToken,
  V1Asset,
  V1RwasQueryOptions,
  V1RwasResponse,
  V1SuggestedOccurrenceFloorsResponse,
  V1TokenDescriptionResponse,
  V1TokenMetadataQueryOptions,
  V1TokenSecurityDataQueryOptions,
  V1TokenSecurityDataResponse,
  V1TokensSparklineQueryOptions,
  V1TokensSparklineResponse,
  V2Asset,
  V3MemeTokensQueryOptions,
  V3MemeTokensResponse,
  V3PopularTokensQueryOptions,
  V3TopGainersQueryOptions,
  V3TrendingMemeTokensQueryOptions,
  V3TrendingTokensQueryOptions,
} from './types.js';

/**
 * Token API Client.
 * Provides methods for interacting with the Token API.
 */
export class TokenApiClient extends BaseApiClient {
  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Invalidate all token API queries.
   * Note: This only invalidates queries from token.api.cx.metamask.io,
   * not from tokens.api.cx.metamask.io (use TokensApiClient.invalidateTokens() for that).
   */
  async invalidateToken(): Promise<void> {
    await this.queryClient.invalidateQueries({
      queryKey: ['token'],
    });
  }

  // ==========================================================================
  // NETWORKS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v2 supported networks.
   *
   * This targets `token.api.cx.metamask.io`, so it reports the chains for
   * which `/tokens/{chainId}` serves a token list. For the Tokens API
   * (`tokens.api.cx.metamask.io`) equivalent, use
   * `TokensApiClient.getTokenV2SupportedNetworksQueryOptions`.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2SupportedNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<TokenV2SupportedNetworksResponse> {
    return {
      queryKey: ['token', 'v2SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TokenV2SupportedNetworksResponse>(
          this.apiUrls.TOKEN,
          '/v2/supportedNetworks',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get the chains for which the Token API serves a token list (v2 endpoint).
   * Returns both `fullSupport` and `partialSupport` CAIP-2 chain IDs.
   *
   * @param options - Fetch options including cache settings.
   * @returns The supported networks response.
   */
  async fetchV2SupportedNetworks(
    options?: FetchOptions,
  ): Promise<TokenV2SupportedNetworksResponse> {
    return this.queryClient.fetchQuery(
      this.getV2SupportedNetworksQueryOptions(options),
    );
  }

  /**
   * Returns the TanStack Query options object for networks.
   *
   * @deprecated The Token API `/networks` endpoint no longer exists in
   * production and returns 404. Use `getV2SupportedNetworksQueryOptions`
   * instead.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<NetworkInfo[]> {
    return {
      queryKey: ['token', 'networks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<NetworkInfo[]>(this.apiUrls.TOKEN, '/networks', { signal }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get all networks.
   *
   * @deprecated The Token API `/networks` endpoint no longer exists in
   * production and returns 404. Use `fetchV2SupportedNetworks` instead.
   * @param options - Fetch options including cache settings.
   * @returns Array of network info.
   */
  async fetchNetworks(options?: FetchOptions): Promise<NetworkInfo[]> {
    return this.queryClient.fetchQuery(this.getNetworksQueryOptions(options));
  }

  /**
   * Returns the TanStack Query options object for network by chain ID.
   *
   * @deprecated The Token API `/networks/{chainId}` endpoint no longer exists
   * in production and returns 404. Use `getV2SupportedNetworksQueryOptions`
   * instead.
   * @param chainId - The chain ID.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getNetworkByChainIdQueryOptions(
    chainId: number,
    options?: FetchOptions,
  ): FetchQueryOptions<NetworkInfo> {
    return {
      queryKey: ['token', 'networkByChainId', chainId],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<NetworkInfo>(this.apiUrls.TOKEN, `/networks/${chainId}`, {
          signal,
        }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get network by chain ID.
   *
   * @deprecated The Token API `/networks/{chainId}` endpoint no longer exists
   * in production and returns 404. Use `fetchV2SupportedNetworks` instead.
   * @param chainId - The chain ID.
   * @param options - Fetch options including cache settings.
   * @returns The network info.
   */
  async fetchNetworkByChainId(
    chainId: number,
    options?: FetchOptions,
  ): Promise<NetworkInfo> {
    return this.queryClient.fetchQuery(
      this.getNetworkByChainIdQueryOptions(chainId, options),
    );
  }

  // ==========================================================================
  // TOKEN LIST
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for token list.
   *
   * @param chainId - The chain ID.
   * @param queryOptions - Query options (occurrence floor and `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getTokenListQueryOptions(
    chainId: number,
    queryOptions?: TokenListQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<TokenMetadata[]> {
    return {
      queryKey: ['token', 'tokenList', { chainId, options: queryOptions }],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TokenMetadata[]>(this.apiUrls.TOKEN, `/tokens/${chainId}`, {
          signal,
          params: { ...queryOptions },
        }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_LIST,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get token list for a chain.
   *
   * @param chainId - The chain ID.
   * @param queryOptions - Query options (occurrence floor and `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns Array of token metadata.
   */
  async fetchTokenList(
    chainId: number,
    queryOptions?: TokenListQueryOptions,
    options?: FetchOptions,
  ): Promise<TokenMetadata[]> {
    return this.queryClient.fetchQuery(
      this.getTokenListQueryOptions(chainId, queryOptions, options),
    );
  }

  // ==========================================================================
  // TOKEN METADATA
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 token metadata.
   *
   * @param chainId - The chain ID.
   * @param tokenAddress - The token address.
   * @param queryOptions - Query options (`include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1TokenMetadataQueryOptions(
    chainId: number,
    tokenAddress: string,
    queryOptions?: V1TokenMetadataQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<TokenMetadata> {
    return {
      queryKey: [
        'token',
        'v1Metadata',
        { chainId, tokenAddress, options: queryOptions },
      ],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<TokenMetadata> => {
        return this.fetch<TokenMetadata>(
          this.apiUrls.TOKEN,
          `/token/${chainId}`,
          {
            signal,
            params: {
              address: tokenAddress,
              ...queryOptions,
            },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get token metadata by address.
   *
   * @param chainId - The chain ID.
   * @param tokenAddress - The token address.
   * @param queryOptions - Query options (`include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns The token metadata or undefined.
   */
  async fetchV1TokenMetadata(
    chainId: number,
    tokenAddress: string,
    queryOptions?: V1TokenMetadataQueryOptions,
    options?: FetchOptions,
  ): Promise<TokenMetadata | undefined> {
    try {
      return await this.queryClient.fetchQuery(
        this.getV1TokenMetadataQueryOptions(
          chainId,
          tokenAddress,
          queryOptions,
          options,
        ),
      );
    } catch {
      return undefined;
    }
  }

  /**
   * Returns the TanStack Query options object for token description.
   *
   * @param chainId - The chain ID.
   * @param tokenAddress - The token address.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getTokenDescriptionQueryOptions(
    chainId: number,
    tokenAddress: string,
    options?: FetchOptions,
  ): FetchQueryOptions<V1TokenDescriptionResponse> {
    return {
      queryKey: ['token', 'tokenDescription', chainId, tokenAddress],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V1TokenDescriptionResponse> =>
        this.fetch<V1TokenDescriptionResponse>(
          this.apiUrls.TOKEN,
          `/token/${chainId}/description`,
          {
            signal,
            params: { address: tokenAddress },
          },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get token description.
   *
   * @param chainId - The chain ID.
   * @param tokenAddress - The token address.
   * @param options - Fetch options including cache settings.
   * @returns The token description or undefined.
   */
  async fetchTokenDescription(
    chainId: number,
    tokenAddress: string,
    options?: FetchOptions,
  ): Promise<V1TokenDescriptionResponse | undefined> {
    try {
      return await this.queryClient.fetchQuery(
        this.getTokenDescriptionQueryOptions(chainId, tokenAddress, options),
      );
    } catch {
      return undefined;
    }
  }

  // ==========================================================================
  // TOKEN SEARCH
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for token search.
   *
   * @param query - Asset reference, symbol, or name to search for.
   * @param queryOptions - Query options (networks, pagination, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getTokenSearchQueryOptions(
    query: string,
    queryOptions?: TokenSearchQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<TokenSearchResponse> {
    return {
      queryKey: [
        'token',
        'search',
        {
          query,
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TokenSearchResponse>(this.apiUrls.TOKEN, '/tokens/search', {
          signal,
          params: {
            query,
            ...queryOptions,
          },
        }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

  /**
   * Search tokens by asset reference, symbol, or name.
   *
   * @param query - Asset reference, symbol, or name to search for.
   * @param queryOptions - Query options (networks, pagination, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns The paginated search response.
   */
  async fetchTokenSearch(
    query: string,
    queryOptions?: TokenSearchQueryOptions,
    options?: FetchOptions,
  ): Promise<TokenSearchResponse> {
    return this.queryClient.fetchQuery(
      this.getTokenSearchQueryOptions(query, queryOptions, options),
    );
  }

  // ==========================================================================
  // TOKEN SECURITY DATA
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 token security data.
   *
   * @param assetIds - CAIP-19 asset IDs (maximum of 100).
   * @param queryOptions - Query options.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1TokenSecurityDataQueryOptions(
    assetIds: string[],
    queryOptions?: V1TokenSecurityDataQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<V1TokenSecurityDataResponse> {
    return {
      queryKey: [
        'token',
        'v1SecurityData',
        { assetIds: [...assetIds].sort(), options: queryOptions },
      ],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V1TokenSecurityDataResponse> => {
        if (assetIds.length === 0) {
          return {};
        }
        return this.fetch<V1TokenSecurityDataResponse>(
          this.apiUrls.TOKEN,
          '/v1/tokens/security-data',
          {
            signal,
            params: {
              assetIds,
              ...queryOptions,
            },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get token security data keyed by CAIP-19 asset ID.
   *
   * Returns `maliciousScore` and `resultType` per asset, or the full security
   * payload when `includeExtendedData` is `true`. Chains not supported by the
   * security-alerts API are omitted from the response.
   *
   * @param assetIds - CAIP-19 asset IDs (maximum of 100).
   * @param queryOptions - Query options.
   * @param options - Fetch options including cache settings.
   * @returns Security data keyed by asset ID.
   */
  async fetchV1TokenSecurityData(
    assetIds: string[],
    queryOptions?: V1TokenSecurityDataQueryOptions,
    options?: FetchOptions,
  ): Promise<V1TokenSecurityDataResponse> {
    if (assetIds.length === 0) {
      return {};
    }
    return this.queryClient.fetchQuery(
      this.getV1TokenSecurityDataQueryOptions(assetIds, queryOptions, options),
    );
  }

  // ==========================================================================
  // ASSETS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for assets by CAIP-19 ID (v1).
   *
   * @param assetIds - CAIP-19 asset IDs.
   * @param queryOptions - Query options (`include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1AssetsQueryOptions(
    assetIds: string[],
    queryOptions?: AssetsQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<V1Asset[]> {
    return {
      queryKey: [
        'token',
        'v1Assets',
        { assetIds: [...assetIds].sort(), options: queryOptions },
      ],
      queryFn: async ({ signal }: QueryFunctionContext): Promise<V1Asset[]> => {
        if (assetIds.length === 0) {
          return [];
        }
        return this.fetch<V1Asset[]>(this.apiUrls.TOKEN, '/assets', {
          signal,
          params: {
            assetIds,
            ...queryOptions,
          },
        });
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get asset metadata by CAIP-19 asset IDs (v1).
   *
   * Prefer `fetchV2Assets`, which represents unknown data as `null` instead of
   * omitting fields or coercing them to `0`.
   *
   * @param assetIds - CAIP-19 asset IDs.
   * @param queryOptions - Query options (`include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns Array of assets.
   */
  async fetchV1Assets(
    assetIds: string[],
    queryOptions?: AssetsQueryOptions,
    options?: FetchOptions,
  ): Promise<V1Asset[]> {
    if (assetIds.length === 0) {
      return [];
    }
    return this.queryClient.fetchQuery(
      this.getV1AssetsQueryOptions(assetIds, queryOptions, options),
    );
  }

  /**
   * Returns the TanStack Query options object for assets by CAIP-19 ID (v2).
   *
   * @param assetIds - CAIP-19 asset IDs.
   * @param queryOptions - Query options (`include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2AssetsQueryOptions(
    assetIds: string[],
    queryOptions?: AssetsQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<V2Asset[]> {
    return {
      queryKey: [
        'token',
        'v2Assets',
        { assetIds: [...assetIds].sort(), options: queryOptions },
      ],
      queryFn: async ({ signal }: QueryFunctionContext): Promise<V2Asset[]> => {
        if (assetIds.length === 0) {
          return [];
        }
        return this.fetch<V2Asset[]>(this.apiUrls.TOKEN, '/v2/assets', {
          signal,
          params: {
            assetIds,
            ...queryOptions,
          },
        });
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get asset metadata by CAIP-19 asset IDs (v2).
   *
   * Differs from v1 in how unknown data is represented: when an `include*`
   * flag is set and the data is not available, the field is `null`, and
   * individual `marketData` fields that are not known are `null`. A value of
   * `0` therefore always means the source reported zero.
   *
   * @param assetIds - CAIP-19 asset IDs.
   * @param queryOptions - Query options (`include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns Array of assets.
   */
  async fetchV2Assets(
    assetIds: string[],
    queryOptions?: AssetsQueryOptions,
    options?: FetchOptions,
  ): Promise<V2Asset[]> {
    if (assetIds.length === 0) {
      return [];
    }
    return this.queryClient.fetchQuery(
      this.getV2AssetsQueryOptions(assetIds, queryOptions, options),
    );
  }

  // ==========================================================================
  // REAL WORLD ASSETS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 Real World Assets.
   *
   * @param queryOptions - Query options (filters, pagination, sorting).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1RwasQueryOptions(
    queryOptions?: V1RwasQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<V1RwasResponse> {
    return {
      queryKey: [
        'token',
        'v1Rwas',
        queryOptions && {
          ...queryOptions,
          chainIds: queryOptions.chainIds && [...queryOptions.chainIds].sort(),
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1RwasResponse>(this.apiUrls.TOKEN, '/v1/rwas', {
          signal,
          params: { ...queryOptions },
        }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get a paginated list of Real World Assets (RWAs).
   *
   * @param queryOptions - Query options (filters, pagination, sorting).
   * @param options - Fetch options including cache settings.
   * @returns The paginated RWA response.
   */
  async fetchV1Rwas(
    queryOptions?: V1RwasQueryOptions,
    options?: FetchOptions,
  ): Promise<V1RwasResponse> {
    return this.queryClient.fetchQuery(
      this.getV1RwasQueryOptions(queryOptions, options),
    );
  }

  // ==========================================================================
  // TRENDING & TOP TOKENS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v3 trending tokens.
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3TrendingTokensQueryOptions(
    chainIds: string[],
    queryOptions?: V3TrendingTokensQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<TrendingToken[]> {
    const { sortBy, ...restQueryOptions } = queryOptions ?? {};
    return {
      queryKey: [
        'token',
        'v3Trending',
        { chainIds: [...chainIds].sort(), options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TrendingToken[]>(this.apiUrls.TOKEN, '/v3/tokens/trending', {
          signal,
          params: {
            chainIds,
            sort: sortBy,
            ...restQueryOptions,
          },
        }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get trending tokens (v3 endpoint).
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns Array of trending tokens.
   */
  async fetchV3TrendingTokens(
    chainIds: string[],
    queryOptions?: V3TrendingTokensQueryOptions,
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.queryClient.fetchQuery(
      this.getV3TrendingTokensQueryOptions(chainIds, queryOptions, options),
    );
  }

  /**
   * Returns the TanStack Query options object for v3 top gainers.
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3TopGainersQueryOptions(
    chainIds: string[],
    queryOptions?: V3TopGainersQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<TrendingToken[]> {
    return {
      queryKey: [
        'token',
        'v3TopGainers',
        { chainIds: [...chainIds].sort(), options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TrendingToken[]>(
          this.apiUrls.TOKEN,
          '/v3/tokens/top-gainers',
          {
            signal,
            params: {
              chainIds,
              ...queryOptions,
            },
          },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get top gainers/losers (v3 endpoint).
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns Array of top gainer tokens.
   */
  async fetchV3TopGainers(
    chainIds: string[],
    queryOptions?: V3TopGainersQueryOptions,
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.queryClient.fetchQuery(
      this.getV3TopGainersQueryOptions(chainIds, queryOptions, options),
    );
  }

  /**
   * Returns the TanStack Query options object for v3 popular tokens.
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3PopularTokensQueryOptions(
    chainIds: string[],
    queryOptions?: V3PopularTokensQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<TrendingToken[]> {
    return {
      queryKey: [
        'token',
        'v3Popular',
        { chainIds: [...chainIds].sort(), options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TrendingToken[]>(this.apiUrls.TOKEN, '/v3/tokens/popular', {
          signal,
          params: {
            chainIds,
            ...queryOptions,
          },
        }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get popular tokens (v3 endpoint).
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns Array of popular tokens.
   */
  async fetchV3PopularTokens(
    chainIds: string[],
    queryOptions?: V3PopularTokensQueryOptions,
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.queryClient.fetchQuery(
      this.getV3PopularTokensQueryOptions(chainIds, queryOptions, options),
    );
  }

  // ==========================================================================
  // MEME TOKENS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v3 meme tokens.
   *
   * @param queryOptions - Query options (filters, search, pagination).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3MemeTokensQueryOptions(
    queryOptions?: V3MemeTokensQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<V3MemeTokensResponse> {
    return {
      queryKey: [
        'token',
        'v3Meme',
        queryOptions && {
          ...queryOptions,
          chainIds: queryOptions.chainIds && [...queryOptions.chainIds].sort(),
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V3MemeTokensResponse>(
          this.apiUrls.TOKEN,
          '/v3/tokens/meme',
          {
            signal,
            params: { ...queryOptions },
          },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get a paginated list of launchpad meme tokens enriched with market data
   * (v3 endpoint).
   *
   * @param queryOptions - Query options (filters, search, pagination).
   * @param options - Fetch options including cache settings.
   * @returns The paginated meme tokens response.
   */
  async fetchV3MemeTokens(
    queryOptions?: V3MemeTokensQueryOptions,
    options?: FetchOptions,
  ): Promise<V3MemeTokensResponse> {
    return this.queryClient.fetchQuery(
      this.getV3MemeTokensQueryOptions(queryOptions, options),
    );
  }

  /**
   * Returns the TanStack Query options object for v3 trending meme tokens.
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (timeframe, sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3TrendingMemeTokensQueryOptions(
    chainIds: string[],
    queryOptions?: V3TrendingMemeTokensQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<MemeToken[]> {
    return {
      queryKey: [
        'token',
        'v3TrendingMeme',
        { chainIds: [...chainIds].sort(), options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<MemeToken[]>(
          this.apiUrls.TOKEN,
          '/v3/tokens/meme/trending',
          {
            signal,
            params: {
              chainIds,
              ...queryOptions,
            },
          },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get trending meme tokens over the selected timeframe (v3 endpoint).
   *
   * EVM chains are ranked by Codex and Solana by Solana Tracker. Mixed chain
   * requests are interleaved by rank for the `trending` sort and sorted by the
   * field for the other sorts.
   *
   * @param chainIds - Array of CAIP-2 chain IDs.
   * @param queryOptions - Query options (timeframe, sort, filters, `include*` flags).
   * @param options - Fetch options including cache settings.
   * @returns Array of trending meme tokens.
   */
  async fetchV3TrendingMemeTokens(
    chainIds: string[],
    queryOptions?: V3TrendingMemeTokensQueryOptions,
    options?: FetchOptions,
  ): Promise<MemeToken[]> {
    return this.queryClient.fetchQuery(
      this.getV3TrendingMemeTokensQueryOptions(chainIds, queryOptions, options),
    );
  }

  // ==========================================================================
  // TOP ASSETS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for top assets.
   *
   * @param chainId - The chain ID.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getTopAssetsQueryOptions(
    chainId: number,
    options?: FetchOptions,
  ): FetchQueryOptions<TopAsset[]> {
    return {
      queryKey: ['token', 'topAssets', chainId],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TopAsset[]>(this.apiUrls.TOKEN, `/topAssets/${chainId}`, {
          signal,
        }),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get top assets for a chain.
   *
   * @param chainId - The chain ID.
   * @param options - Fetch options including cache settings.
   * @returns Array of top assets.
   */
  async fetchTopAssets(
    chainId: number,
    options?: FetchOptions,
  ): Promise<TopAsset[]> {
    return this.queryClient.fetchQuery(
      this.getTopAssetsQueryOptions(chainId, options),
    );
  }

  // ==========================================================================
  // SPARKLINE
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 token sparklines.
   *
   * @param queryOptions - Query options (category, time period, sort, cursor).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1TokensSparklineQueryOptions(
    queryOptions?: V1TokensSparklineQueryOptions,
    options?: FetchOptions,
  ): FetchQueryOptions<V1TokensSparklineResponse> {
    return {
      queryKey: ['token', 'v1Sparkline', queryOptions],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1TokensSparklineResponse>(
          this.apiUrls.TOKEN,
          '/v1/tokens/sparkline',
          {
            signal,
            params: { ...queryOptions },
          },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    };
  }

  /**
   * Get paginated sparkline data for a curated category
   * (trending / popular / top gainers).
   *
   * @param queryOptions - Query options (category, time period, sort, cursor).
   * @param options - Fetch options including cache settings.
   * @returns The paginated sparkline response keyed by CAIP-19 asset ID.
   */
  async fetchV1TokensSparkline(
    queryOptions?: V1TokensSparklineQueryOptions,
    options?: FetchOptions,
  ): Promise<V1TokensSparklineResponse> {
    return this.queryClient.fetchQuery(
      this.getV1TokensSparklineQueryOptions(queryOptions, options),
    );
  }

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 suggested occurrence floors.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1SuggestedOccurrenceFloorsQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<V1SuggestedOccurrenceFloorsResponse> {
    return {
      queryKey: ['token', 'v1SuggestedOccurrenceFloors'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1SuggestedOccurrenceFloorsResponse>(
          this.apiUrls.TOKEN,
          '/v1/suggestedOccurrenceFloors',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get suggested occurrence floors for all chains.
   *
   * @param options - Fetch options including cache settings.
   * @returns The suggested occurrence floors response.
   */
  async fetchV1SuggestedOccurrenceFloors(
    options?: FetchOptions,
  ): Promise<V1SuggestedOccurrenceFloorsResponse> {
    return this.queryClient.fetchQuery(
      this.getV1SuggestedOccurrenceFloorsQueryOptions(options),
    );
  }
}
