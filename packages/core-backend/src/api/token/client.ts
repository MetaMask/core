/**
 * Token API Client - token.api.cx.metamask.io
 *
 * Handles all token-related API calls including:
 * - Networks
 * - Token lists
 * - Token metadata
 * - Token descriptions
 * - Trending tokens
 * - Top gainers/popular tokens
 * - Top assets
 * - Occurrence floors
 */

import type { QueryFunctionContext } from '@tanstack/query-core';

import type {
  TokenMetadata,
  V1TokenDescriptionResponse,
  NetworkInfo,
  TopAsset,
  TrendingToken,
  TrendingSortOption,
  TopGainersSortOption,
  V1SuggestedOccurrenceFloorsResponse,
} from './types';
import { BaseApiClient, API_URLS, STALE_TIMES, GC_TIMES } from '../base-client';
import type { FetchOptions } from '../shared-types';

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
   * Get all networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns Array of network info.
   */
  async fetchNetworks(options?: FetchOptions): Promise<NetworkInfo[]> {
    return this.queryClient.fetchQuery({
      queryKey: ['token', 'networks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<NetworkInfo[]>(API_URLS.TOKEN, '/networks', { signal }),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  /**
   * Get network by chain ID.
   *
   * @param chainId - The chain ID.
   * @param options - Fetch options including cache settings.
   * @returns The network info.
   */
  async fetchNetworkByChainId(
    chainId: number,
    options?: FetchOptions,
  ): Promise<NetworkInfo> {
    return this.queryClient.fetchQuery({
      queryKey: ['token', 'networkByChainId', chainId],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<NetworkInfo>(API_URLS.TOKEN, `/networks/${chainId}`, {
          signal,
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // TOKEN LIST
  // ==========================================================================

  /**
   * Get token list for a chain.
   *
   * @param chainId - The chain ID.
   * @param queryOptions - Query options.
   * @param queryOptions.includeTokenFees - Include token fees data.
   * @param queryOptions.includeAssetType - Include asset type data.
   * @param queryOptions.includeAggregators - Include aggregators data.
   * @param queryOptions.includeERC20Permit - Include ERC20 permit data.
   * @param queryOptions.includeOccurrences - Include occurrences data.
   * @param queryOptions.includeStorage - Include storage data.
   * @param queryOptions.includeIconUrl - Include icon URL.
   * @param queryOptions.includeAddress - Include address.
   * @param queryOptions.includeName - Include name.
   * @param options - Fetch options including cache settings.
   * @returns Array of token metadata.
   */
  async fetchTokenList(
    chainId: number,
    queryOptions?: {
      includeTokenFees?: boolean;
      includeAssetType?: boolean;
      includeAggregators?: boolean;
      includeERC20Permit?: boolean;
      includeOccurrences?: boolean;
      includeStorage?: boolean;
      includeIconUrl?: boolean;
      includeAddress?: boolean;
      includeName?: boolean;
    },
    options?: FetchOptions,
  ): Promise<TokenMetadata[]> {
    return this.queryClient.fetchQuery({
      queryKey: ['token', 'tokenList', { chainId, options: queryOptions }],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TokenMetadata[]>(API_URLS.TOKEN, `/tokens/${chainId}`, {
          signal,
          params: {
            includeTokenFees: queryOptions?.includeTokenFees,
            includeAssetType: queryOptions?.includeAssetType,
            includeAggregators: queryOptions?.includeAggregators,
            includeERC20Permit: queryOptions?.includeERC20Permit,
            includeOccurrences: queryOptions?.includeOccurrences,
            includeStorage: queryOptions?.includeStorage,
            includeIconUrl: queryOptions?.includeIconUrl,
            includeAddress: queryOptions?.includeAddress,
            includeName: queryOptions?.includeName,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_LIST,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // TOKEN METADATA
  // ==========================================================================

  /**
   * Get token metadata by address.
   *
   * @param chainId - The chain ID.
   * @param tokenAddress - The token address.
   * @param queryOptions - Query options.
   * @param queryOptions.includeTokenFees - Include token fees data.
   * @param queryOptions.includeAssetType - Include asset type data.
   * @param queryOptions.includeAggregators - Include aggregators data.
   * @param queryOptions.includeERC20Permit - Include ERC20 permit data.
   * @param queryOptions.includeOccurrences - Include occurrences data.
   * @param queryOptions.includeStorage - Include storage data.
   * @param queryOptions.includeIconUrl - Include icon URL.
   * @param queryOptions.includeAddress - Include address.
   * @param queryOptions.includeName - Include name.
   * @param options - Fetch options including cache settings.
   * @returns The token metadata or undefined.
   */
  async fetchV1TokenMetadata(
    chainId: number,
    tokenAddress: string,
    queryOptions?: {
      includeTokenFees?: boolean;
      includeAssetType?: boolean;
      includeAggregators?: boolean;
      includeERC20Permit?: boolean;
      includeOccurrences?: boolean;
      includeStorage?: boolean;
      includeIconUrl?: boolean;
      includeAddress?: boolean;
      includeName?: boolean;
    },
    options?: FetchOptions,
  ): Promise<TokenMetadata | undefined> {
    try {
      return await this.queryClient.fetchQuery({
        queryKey: [
          'token',
          'v1Metadata',
          { chainId, tokenAddress, options: queryOptions },
        ],
        queryFn: ({ signal }: QueryFunctionContext) =>
          this.fetch<TokenMetadata>(API_URLS.TOKEN, `/token/${chainId}`, {
            signal,
            params: {
              address: tokenAddress,
              includeTokenFees: queryOptions?.includeTokenFees,
              includeAssetType: queryOptions?.includeAssetType,
              includeAggregators: queryOptions?.includeAggregators,
              includeERC20Permit: queryOptions?.includeERC20Permit,
              includeOccurrences: queryOptions?.includeOccurrences,
              includeStorage: queryOptions?.includeStorage,
              includeIconUrl: queryOptions?.includeIconUrl,
              includeAddress: queryOptions?.includeAddress,
              includeName: queryOptions?.includeName,
            },
          }),
        staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
        gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
      });
    } catch {
      return undefined;
    }
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
      return await this.queryClient.fetchQuery({
        queryKey: ['token', 'tokenDescription', chainId, tokenAddress],
        queryFn: ({ signal }: QueryFunctionContext) =>
          this.fetch<V1TokenDescriptionResponse>(
            API_URLS.TOKEN,
            `/token/${chainId}/description`,
            {
              signal,
              params: { address: tokenAddress },
            },
          ),
        staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
        gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
      });
    } catch {
      return undefined;
    }
  }

  // ==========================================================================
  // TRENDING & TOP TOKENS
  // ==========================================================================

  /**
   * Get trending tokens (v3 endpoint).
   *
   * @param chainIds - Array of chain IDs.
   * @param queryOptions - Query options.
   * @param queryOptions.sortBy - Sort option.
   * @param queryOptions.minLiquidity - Minimum liquidity filter.
   * @param queryOptions.minVolume24hUsd - Minimum 24h volume filter.
   * @param queryOptions.maxVolume24hUsd - Maximum 24h volume filter.
   * @param queryOptions.minMarketCap - Minimum market cap filter.
   * @param queryOptions.maxMarketCap - Maximum market cap filter.
   * @param options - Fetch options including cache settings.
   * @returns Array of trending tokens.
   */
  async fetchV3TrendingTokens(
    chainIds: string[],
    queryOptions?: {
      sortBy?: TrendingSortOption;
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'token',
        'v3Trending',
        { chainIds: [...chainIds].sort(), options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TrendingToken[]>(API_URLS.TOKEN, '/v3/tokens/trending', {
          signal,
          params: {
            chainIds,
            sort: queryOptions?.sortBy,
            minLiquidity: queryOptions?.minLiquidity,
            minVolume24hUsd: queryOptions?.minVolume24hUsd,
            maxVolume24hUsd: queryOptions?.maxVolume24hUsd,
            minMarketCap: queryOptions?.minMarketCap,
            maxMarketCap: queryOptions?.maxMarketCap,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  /**
   * Get top gainers/losers (v3 endpoint).
   *
   * @param chainIds - Array of chain IDs.
   * @param queryOptions - Query options.
   * @param queryOptions.sort - Sort option.
   * @param queryOptions.blockRegion - Region filter (global/us).
   * @param queryOptions.minLiquidity - Minimum liquidity filter.
   * @param queryOptions.minVolume24hUsd - Minimum 24h volume filter.
   * @param queryOptions.maxVolume24hUsd - Maximum 24h volume filter.
   * @param queryOptions.minMarketCap - Minimum market cap filter.
   * @param queryOptions.maxMarketCap - Maximum market cap filter.
   * @param options - Fetch options including cache settings.
   * @returns Array of top gainer tokens.
   */
  async fetchV3TopGainers(
    chainIds: string[],
    queryOptions?: {
      sort?: TopGainersSortOption;
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'token',
        'v3TopGainers',
        { chainIds: [...chainIds].sort(), options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TrendingToken[]>(API_URLS.TOKEN, '/v3/tokens/top-gainers', {
          signal,
          params: {
            chainIds,
            sort: queryOptions?.sort,
            blockRegion: queryOptions?.blockRegion,
            minLiquidity: queryOptions?.minLiquidity,
            minVolume24hUsd: queryOptions?.minVolume24hUsd,
            maxVolume24hUsd: queryOptions?.maxVolume24hUsd,
            minMarketCap: queryOptions?.minMarketCap,
            maxMarketCap: queryOptions?.maxMarketCap,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  /**
   * Get popular tokens (v3 endpoint).
   *
   * @param chainIds - Array of chain IDs.
   * @param queryOptions - Query options.
   * @param queryOptions.blockRegion - Region filter (global/us).
   * @param queryOptions.minLiquidity - Minimum liquidity filter.
   * @param queryOptions.minVolume24hUsd - Minimum 24h volume filter.
   * @param queryOptions.maxVolume24hUsd - Maximum 24h volume filter.
   * @param queryOptions.minMarketCap - Minimum market cap filter.
   * @param queryOptions.maxMarketCap - Maximum market cap filter.
   * @param options - Fetch options including cache settings.
   * @returns Array of popular tokens.
   */
  async fetchV3PopularTokens(
    chainIds: string[],
    queryOptions?: {
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'token',
        'v3Popular',
        { chainIds: [...chainIds].sort(), options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TrendingToken[]>(API_URLS.TOKEN, '/v3/tokens/popular', {
          signal,
          params: {
            chainIds,
            blockRegion: queryOptions?.blockRegion,
            minLiquidity: queryOptions?.minLiquidity,
            minVolume24hUsd: queryOptions?.minVolume24hUsd,
            maxVolume24hUsd: queryOptions?.maxVolume24hUsd,
            minMarketCap: queryOptions?.minMarketCap,
            maxMarketCap: queryOptions?.maxMarketCap,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  // ==========================================================================
  // TOP ASSETS
  // ==========================================================================

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
    return this.queryClient.fetchQuery({
      queryKey: ['token', 'topAssets', chainId],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<TopAsset[]>(API_URLS.TOKEN, `/topAssets/${chainId}`, {
          signal,
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  /**
   * Get suggested occurrence floors for all chains.
   *
   * @param options - Fetch options including cache settings.
   * @returns The suggested occurrence floors response.
   */
  async fetchV1SuggestedOccurrenceFloors(
    options?: FetchOptions,
  ): Promise<V1SuggestedOccurrenceFloorsResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['token', 'v1SuggestedOccurrenceFloors'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1SuggestedOccurrenceFloorsResponse>(
          API_URLS.TOKEN,
          '/v1/suggestedOccurrenceFloors',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }
}
