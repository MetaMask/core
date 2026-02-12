/**
 * Tokens API Client - tokens.api.cx.metamask.io
 *
 * Handles bulk token operations including:
 * - Supported networks (v1, v2)
 * - V3 Assets
 */

import type { QueryFunctionContext } from '@tanstack/query-core';

import type {
  V1TokenSupportedNetworksResponse,
  V2TokenSupportedNetworksResponse,
  V3AssetResponse,
  V3AssetsQueryOptions,
} from './types';
import { BaseApiClient, API_URLS, STALE_TIMES, GC_TIMES } from '../base-client';
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
   * Get token supported networks (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The supported networks response.
   */
  async fetchTokenV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V1TokenSupportedNetworksResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['tokens', 'v1SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1TokenSupportedNetworksResponse>(
          API_URLS.TOKENS,
          '/v1/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
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
    return this.queryClient.fetchQuery({
      queryKey: ['tokens', 'v2SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2TokenSupportedNetworksResponse>(
          API_URLS.TOKENS,
          '/v2/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // V3 ASSETS
  // ==========================================================================

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
    return this.queryClient.fetchQuery({
      queryKey: [
        'tokens',
        'v3Assets',
        { assetIds: [...assetIds].sort(), ...queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V3AssetResponse[]>(API_URLS.TOKENS, '/v3/assets', {
          signal,
          params: {
            assetIds,
            ...queryOptions,
          },
        }),
      staleTime: fetchOptions?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: fetchOptions?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }
}
