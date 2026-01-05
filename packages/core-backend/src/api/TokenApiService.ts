/**
 * Token API Service for MetaMask (V1)
 *
 * Provides SDK methods for interacting with the Token API at token.api.cx.metamask.io
 * Supports token metadata, trending tokens, top gainers/losers, and network information.
 *
 * This is a plain service class. For Messenger integration, use BackendApiClient.
 *
 * @see https://token.api.cx.metamask.io/docs-json
 */

import { HttpClient } from './HttpClient';
import type {
  BaseApiServiceOptions,
  TokenMetadata,
  TrendingToken,
  GetTrendingTokensOptions,
} from './types';

/**
 * Default Token API base URL
 */
export const TOKEN_API_BASE_URL = 'https://token.api.cx.metamask.io';

/**
 * Token API Service Options
 */
export type TokenApiServiceOptions = BaseApiServiceOptions;

/**
 * Supported networks response
 */
export type GetTokenSupportedNetworksResponse = {
  fullSupport: string[];
};

/**
 * Network configuration
 */
export type NetworkInfo = {
  active: boolean;
  chainId: number;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
  };
  iconUrl?: string;
  blockExplorerUrl?: string;
  networkType?: string;
  tokenSources?: string[];
};

/**
 * Top asset
 */
export type TopAsset = {
  address: string;
  symbol: string;
};

/**
 * Token description response
 */
export type TokenDescriptionResponse = {
  description: string;
};

/**
 * Suggested occurrence floors response
 */
export type SuggestedOccurrenceFloorsResponse = {
  [chainId: string]: number;
};

/**
 * Top gainers sort options
 */
export type TopGainersSortOption =
  | 'm5_price_change_percentage_desc'
  | 'h1_price_change_percentage_desc'
  | 'h6_price_change_percentage_desc'
  | 'h24_price_change_percentage_desc'
  | 'm5_price_change_percentage_asc'
  | 'h1_price_change_percentage_asc'
  | 'h6_price_change_percentage_asc'
  | 'h24_price_change_percentage_asc';

/**
 * Token API Service
 *
 * SDK for interacting with MetaMask's Token API (token.api.cx.metamask.io).
 * Provides methods for fetching token metadata, trending tokens, and network info.
 */
/**
 * Method names exposed via BackendApiClient messenger
 */
export const TOKEN_API_METHODS = [
  // Supported Networks
  'getV1SupportedNetworks',
  // Networks
  'getNetworks',
  'getNetworkByChainId',
  // Token List
  'getTokenList',
  // Token Metadata
  'getTokenMetadata',
  'getTokenDescription',
  // Trending & Top Tokens (V3)
  'getV3TrendingTokens',
  'getV3TopGainers',
  'getV3PopularTokens',
  // Top Assets
  'getTopAssets',
  // Utility
  'getV1SuggestedOccurrenceFloors',
] as const;

export class TokenApiService {
  readonly #client: HttpClient;

  constructor(options: TokenApiServiceOptions = {}) {
    this.#client = new HttpClient(
      options.baseUrl ?? TOKEN_API_BASE_URL,
      options,
    );
  }

  // ===========================================================================
  // Health Methods
  // ===========================================================================

  /**
   * Get service metadata
   *
   * @param signal - Optional abort signal
   * @returns Service metadata
   */
  async getServiceMetadata(signal?: AbortSignal): Promise<unknown> {
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
   * @returns Supported networks
   */
  async getV1SupportedNetworks(
    signal?: AbortSignal,
  ): Promise<GetTokenSupportedNetworksResponse> {
    return this.#client.get('/v1/supportedNetworks', { signal });
  }

  // ===========================================================================
  // Network Methods
  // ===========================================================================

  /**
   * Get all networks
   *
   * @param signal - Optional abort signal
   * @returns Array of network configurations
   */
  async getNetworks(signal?: AbortSignal): Promise<NetworkInfo[]> {
    return this.#client.get('/networks', { signal });
  }

  /**
   * Get network by chain ID
   *
   * @param chainId - Chain ID (decimal)
   * @param signal - Optional abort signal
   * @returns Network configuration
   */
  async getNetworkByChainId(
    chainId: number,
    signal?: AbortSignal,
  ): Promise<NetworkInfo> {
    return this.#client.get(`/networks/${chainId}`, { signal });
  }

  // ===========================================================================
  // Token List Methods
  // ===========================================================================

  /**
   * Get token list for a chain
   *
   * @param chainId - Chain ID (decimal)
   * @param options - Include options
   * @param options.includeTokenFees - Whether to include token fees
   * @param options.includeAssetType - Whether to include asset type
   * @param options.includeAggregators - Whether to include aggregators
   * @param options.includeERC20Permit - Whether to include ERC20 permit info
   * @param options.includeOccurrences - Whether to include occurrences
   * @param options.includeStorage - Whether to include storage info
   * @param options.includeIconUrl - Whether to include icon URL
   * @param options.includeAddress - Whether to include address
   * @param options.includeName - Whether to include name
   * @param signal - Optional abort signal
   * @returns Array of token metadata
   */
  async getTokenList(
    chainId: number,
    options?: {
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
    signal?: AbortSignal,
  ): Promise<TokenMetadata[]> {
    const params = new URLSearchParams();

    if (options?.includeTokenFees !== undefined) {
      params.append('includeTokenFees', String(options.includeTokenFees));
    }
    if (options?.includeAssetType !== undefined) {
      params.append('includeAssetType', String(options.includeAssetType));
    }
    if (options?.includeAggregators !== undefined) {
      params.append('includeAggregators', String(options.includeAggregators));
    }
    if (options?.includeERC20Permit !== undefined) {
      params.append('includeERC20Permit', String(options.includeERC20Permit));
    }
    if (options?.includeOccurrences !== undefined) {
      params.append('includeOccurrences', String(options.includeOccurrences));
    }
    if (options?.includeStorage !== undefined) {
      params.append('includeStorage', String(options.includeStorage));
    }
    if (options?.includeIconUrl !== undefined) {
      params.append('includeIconUrl', String(options.includeIconUrl));
    }
    if (options?.includeAddress !== undefined) {
      params.append('includeAddress', String(options.includeAddress));
    }
    if (options?.includeName !== undefined) {
      params.append('includeName', String(options.includeName));
    }

    const queryString = params.toString();
    return this.#client.get(
      `/tokens/${chainId}${queryString ? `?${queryString}` : ''}`,
      { signal },
    );
  }

  // ===========================================================================
  // Token Metadata Methods
  // ===========================================================================

  /**
   * Get token metadata by address
   *
   * @param chainId - Chain ID (decimal)
   * @param tokenAddress - Token contract address
   * @param options - Include options
   * @param options.includeTokenFees - Whether to include token fees
   * @param options.includeAssetType - Whether to include asset type
   * @param options.includeAggregators - Whether to include aggregators
   * @param options.includeERC20Permit - Whether to include ERC20 permit info
   * @param options.includeOccurrences - Whether to include occurrences
   * @param options.includeStorage - Whether to include storage info
   * @param options.includeIconUrl - Whether to include icon URL
   * @param options.includeAddress - Whether to include address
   * @param options.includeName - Whether to include name
   * @param signal - Optional abort signal
   * @returns Token metadata
   */
  async getTokenMetadata(
    chainId: number,
    tokenAddress: string,
    options?: {
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
    signal?: AbortSignal,
  ): Promise<TokenMetadata | undefined> {
    const params = new URLSearchParams();
    params.append('address', tokenAddress);

    if (options?.includeTokenFees !== undefined) {
      params.append('includeTokenFees', String(options.includeTokenFees));
    }
    if (options?.includeAssetType !== undefined) {
      params.append('includeAssetType', String(options.includeAssetType));
    }
    if (options?.includeAggregators !== undefined) {
      params.append('includeAggregators', String(options.includeAggregators));
    }
    if (options?.includeERC20Permit !== undefined) {
      params.append('includeERC20Permit', String(options.includeERC20Permit));
    }
    if (options?.includeOccurrences !== undefined) {
      params.append('includeOccurrences', String(options.includeOccurrences));
    }
    if (options?.includeStorage !== undefined) {
      params.append('includeStorage', String(options.includeStorage));
    }
    if (options?.includeIconUrl !== undefined) {
      params.append('includeIconUrl', String(options.includeIconUrl));
    }
    if (options?.includeAddress !== undefined) {
      params.append('includeAddress', String(options.includeAddress));
    }
    if (options?.includeName !== undefined) {
      params.append('includeName', String(options.includeName));
    }

    try {
      return await this.#client.get(`/token/${chainId}?${params.toString()}`, {
        signal,
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Get token description
   *
   * @param chainId - Chain ID (decimal)
   * @param tokenAddress - Token contract address
   * @param signal - Optional abort signal
   * @returns Token description
   */
  async getTokenDescription(
    chainId: number,
    tokenAddress: string,
    signal?: AbortSignal,
  ): Promise<TokenDescriptionResponse | undefined> {
    try {
      return await this.#client.get(
        `/token/${chainId}/description?address=${tokenAddress}`,
        { signal },
      );
    } catch {
      return undefined;
    }
  }

  // ===========================================================================
  // Trending & Top Tokens Methods (V3)
  // ===========================================================================

  /**
   * Get trending tokens (v3 endpoint)
   *
   * @param options - Trending tokens request options
   * @param signal - Optional abort signal
   * @returns Array of trending tokens
   */
  async getV3TrendingTokens(
    options: GetTrendingTokensOptions,
    signal?: AbortSignal,
  ): Promise<TrendingToken[]> {
    const {
      chainIds,
      sortBy,
      minLiquidity,
      minVolume24hUsd,
      maxVolume24hUsd,
      minMarketCap,
      maxMarketCap,
    } = options;

    const params = new URLSearchParams();
    params.append('chainIds', chainIds.join(','));

    if (sortBy) {
      params.append('sort', sortBy);
    }
    if (minLiquidity !== undefined) {
      params.append('minLiquidity', String(minLiquidity));
    }
    if (minVolume24hUsd !== undefined) {
      params.append('minVolume24hUsd', String(minVolume24hUsd));
    }
    if (maxVolume24hUsd !== undefined) {
      params.append('maxVolume24hUsd', String(maxVolume24hUsd));
    }
    if (minMarketCap !== undefined) {
      params.append('minMarketCap', String(minMarketCap));
    }
    if (maxMarketCap !== undefined) {
      params.append('maxMarketCap', String(maxMarketCap));
    }

    return this.#client.get(`/v3/tokens/trending?${params.toString()}`, {
      signal,
    });
  }

  /**
   * Get top gainers/losers (v3 endpoint)
   *
   * @param chainIds - Array of CAIP-2 chain IDs
   * @param options - Query options
   * @param options.sort - Sort option for results
   * @param options.blockRegion - Region filter (global or us)
   * @param options.minLiquidity - Minimum liquidity threshold
   * @param options.minVolume24hUsd - Minimum 24h volume in USD
   * @param options.maxVolume24hUsd - Maximum 24h volume in USD
   * @param options.minMarketCap - Minimum market cap
   * @param options.maxMarketCap - Maximum market cap
   * @param signal - Optional abort signal
   * @returns Array of top gaining/losing tokens
   */
  async getV3TopGainers(
    chainIds: string[],
    options?: {
      sort?: TopGainersSortOption;
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    signal?: AbortSignal,
  ): Promise<TrendingToken[]> {
    const params = new URLSearchParams();
    params.append('chainIds', chainIds.join(','));

    if (options?.sort) {
      params.append('sort', options.sort);
    }
    if (options?.blockRegion) {
      params.append('blockRegion', options.blockRegion);
    }
    if (options?.minLiquidity !== undefined) {
      params.append('minLiquidity', String(options.minLiquidity));
    }
    if (options?.minVolume24hUsd !== undefined) {
      params.append('minVolume24hUsd', String(options.minVolume24hUsd));
    }
    if (options?.maxVolume24hUsd !== undefined) {
      params.append('maxVolume24hUsd', String(options.maxVolume24hUsd));
    }
    if (options?.minMarketCap !== undefined) {
      params.append('minMarketCap', String(options.minMarketCap));
    }
    if (options?.maxMarketCap !== undefined) {
      params.append('maxMarketCap', String(options.maxMarketCap));
    }

    return this.#client.get(`/v3/tokens/top-gainers?${params.toString()}`, {
      signal,
    });
  }

  /**
   * Get popular tokens (v3 endpoint)
   *
   * @param chainIds - Array of CAIP-2 chain IDs
   * @param options - Query options
   * @param options.blockRegion - Region filter (global or us)
   * @param options.minLiquidity - Minimum liquidity threshold
   * @param options.minVolume24hUsd - Minimum 24h volume in USD
   * @param options.maxVolume24hUsd - Maximum 24h volume in USD
   * @param options.minMarketCap - Minimum market cap
   * @param options.maxMarketCap - Maximum market cap
   * @param signal - Optional abort signal
   * @returns Array of popular tokens
   */
  async getV3PopularTokens(
    chainIds: string[],
    options?: {
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    signal?: AbortSignal,
  ): Promise<TrendingToken[]> {
    const params = new URLSearchParams();
    params.append('chainIds', chainIds.join(','));

    if (options?.blockRegion) {
      params.append('blockRegion', options.blockRegion);
    }
    if (options?.minLiquidity !== undefined) {
      params.append('minLiquidity', String(options.minLiquidity));
    }
    if (options?.minVolume24hUsd !== undefined) {
      params.append('minVolume24hUsd', String(options.minVolume24hUsd));
    }
    if (options?.maxVolume24hUsd !== undefined) {
      params.append('maxVolume24hUsd', String(options.maxVolume24hUsd));
    }
    if (options?.minMarketCap !== undefined) {
      params.append('minMarketCap', String(options.minMarketCap));
    }
    if (options?.maxMarketCap !== undefined) {
      params.append('maxMarketCap', String(options.maxMarketCap));
    }

    return this.#client.get(`/v3/tokens/popular?${params.toString()}`, {
      signal,
    });
  }

  // ===========================================================================
  // Top Assets Methods
  // ===========================================================================

  /**
   * Get top assets for a chain
   *
   * @param chainId - Chain ID (decimal)
   * @param signal - Optional abort signal
   * @returns Array of top assets
   */
  async getTopAssets(
    chainId: number,
    signal?: AbortSignal,
  ): Promise<TopAsset[]> {
    return this.#client.get(`/topAssets/${chainId}`, { signal });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get suggested occurrence floors for all chains
   *
   * @param signal - Optional abort signal
   * @returns Map of chainId to suggested occurrence floor
   */
  async getV1SuggestedOccurrenceFloors(
    signal?: AbortSignal,
  ): Promise<SuggestedOccurrenceFloorsResponse> {
    return this.#client.get('/v1/suggestedOccurrenceFloors', { signal });
  }
}
