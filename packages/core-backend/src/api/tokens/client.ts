/**
 * Tokens API Client - tokens.api.cx.metamask.io
 *
 * Handles bulk token operations including:
 * - Supported networks (v1, v2)
 * - V3 Assets
 */

import type {
  FetchQueryOptions,
  QueryFunctionContext,
} from '@tanstack/query-core';

import type {
  V1TokenSupportedNetworksResponse,
  V2TokenSupportedNetworksResponse,
  V3AssetResponse,
  V3AssetsQueryOptions,
} from './types';
import { BaseApiClient, API_URLS, STALE_TIMES, GC_TIMES } from '../base-client';
import { getQueryOptionsOverrides } from '../shared-types';
import type { FetchOptions } from '../shared-types';

/**
 * Tokens API Client.
 * Provides methods for interacting with the Tokens API.
 */
export class TokensApiClient extends BaseApiClient {
  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Invalidate all token queries.
   */
  async invalidateTokens(): Promise<void> {
    await this.queryClient.invalidateQueries({
      queryKey: ['tokens'],
    });
  }

  // ==========================================================================
  // SUPPORTED NETWORKS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for token v1 supported networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getTokenV1SupportedNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<V1TokenSupportedNetworksResponse> {
    return {
      queryKey: ['tokens', 'v1SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1TokenSupportedNetworksResponse>(
          API_URLS.TOKENS,
          '/v1/supportedNetworks',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get token supported networks (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The supported networks response.
   */
  async fetchTokenV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V1TokenSupportedNetworksResponse> {
    return this.queryClient.fetchQuery(
      this.getTokenV1SupportedNetworksQueryOptions(options),
    );
  }

  /**
   * Returns the TanStack Query options object for token v2 supported networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getTokenV2SupportedNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<V2TokenSupportedNetworksResponse> {
    return {
      queryKey: ['tokens', 'v2SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2TokenSupportedNetworksResponse>(
          API_URLS.TOKENS,
          '/v2/supportedNetworks',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get token supported networks (v2 endpoint).
   * Returns both fullSupport and partialSupport networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns The supported networks response.
   */
  async fetchTokenV2SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V2TokenSupportedNetworksResponse> {
    return this.queryClient.fetchQuery(
      this.getTokenV2SupportedNetworksQueryOptions(options),
    );
  }

  // ==========================================================================
  // V3 ASSETS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v3 assets.
   *
   * @param assetIds - Array of CAIP-19 asset IDs.
   * @param queryOptions - API query options (filters, etc.).
   * @param fetchOptions - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV3AssetsQueryOptions(
    assetIds: string[],
    queryOptions?: V3AssetsQueryOptions,
    fetchOptions?: FetchOptions,
  ): FetchQueryOptions<V3AssetResponse[]> {
    return {
      queryKey: [
        'tokens',
        'v3Assets',
        { assetIds: [...assetIds].sort(), ...queryOptions },
      ],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V3AssetResponse[]> => {
        if (assetIds.length === 0) {
          return [];
        }
        return this.fetch<V3AssetResponse[]>(API_URLS.TOKENS, '/v3/assets', {
          signal,
          params: {
            assetIds,
            ...queryOptions,
          },
        });
      },
      ...getQueryOptionsOverrides(fetchOptions),
      staleTime: fetchOptions?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: fetchOptions?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Fetch assets by IDs (v3) with caching.
   *
   * @param assetIds - Array of CAIP-19 asset IDs.
   * @param queryOptions - Query options to include additional data in response.
   * @param fetchOptions - Fetch options including cache settings.
   * @returns Array of asset responses.
   */
  async fetchV3Assets(
    assetIds: string[],
    queryOptions?: V3AssetsQueryOptions,
    fetchOptions?: FetchOptions,
  ): Promise<V3AssetResponse[]> {
    if (assetIds.length === 0) {
      return [];
    }
    return this.queryClient.fetchQuery(
      this.getV3AssetsQueryOptions(assetIds, queryOptions, fetchOptions),
    );
  }
}
