/**
 * Tokens API Service for MetaMask (V2)
 *
 * Provides SDK methods for interacting with the Tokens API at tokens.api.cx.metamask.io
 * Supports V2/V3 endpoints including CAIP-19 asset lookups, multi-chain search, and network configs.
 *
 * This is a plain service class. For Messenger integration, use BackendApiClient.
 *
 * @see https://tokens.dev-api.cx.metamask.io/docs-json
 */

import { HttpClient } from './HttpClient';
import type {
  BaseApiServiceOptions,
  TokenMetadata,
  TokenSearchResponse,
  TrendingToken,
  GetTokenListOptions,
  SearchTokensOptions,
  GetTrendingTokensOptions,
  GetTokenMetadataOptions,
} from './types';

/**
 * Default Tokens API base URL
 */
export const TOKENS_API_BASE_URL = 'https://tokens.api.cx.metamask.io';

/**
 * Tokens API Service Options
 */
export type TokensApiServiceOptions = BaseApiServiceOptions;

/**
 * Supported networks response (v1)
 */
export type GetTokensSupportedNetworksV1Response = {
  fullSupport: number[];
  partialSupport: number[];
};

/**
 * Supported networks response (v2) - CAIP format
 */
export type GetTokensSupportedNetworksV2Response = {
  fullSupport: string[];
  partialSupport: string[];
};

/**
 * Extended token details with enriched data
 */
export type TokenDetails = TokenMetadata & {
  coingeckoId?: string;
  type?: string;
  isContractVerified?: boolean;
  honeypotStatus?: {
    honeypotIs: boolean;
    goPlus: boolean;
  };
  storage?: {
    minFee: number;
    avgFee: number;
    maxFee: number;
  };
  erc20Permit?: boolean;
  description?: {
    en: string;
  };
  fees?: {
    minFee: number;
    avgFee: number;
    maxFee: number;
  };
  iconUrlThumbnail?: string;
};

/**
 * Asset by CAIP-19 ID
 */
export type AssetByIdResponse = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  chainId: number | string;
  iconUrl?: string;
  iconUrlThumbnail?: string;
  coingeckoId?: string;
  occurrences?: number;
  aggregators?: string[];
};

/**
 * Network configuration (Tokens API)
 */
export type TokensNetworkConfig = {
  chainId: number;
  chainName: string;
  chainShortName: string;
  evmCompatible: boolean;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
    type: string;
    iconUrl?: string;
    coingeckoId?: string;
  };
  wrappedNativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
    type: string;
    address: string;
    iconUrl?: string;
    coingeckoId?: string;
  };
  iconUrl?: string;
  rpcProviders?: {
    providerName: string;
    htmlUrl: string;
    apiKeyRequired: boolean;
    apiUrl: string;
  }[];
  blockExplorer?: {
    url: string;
    apiUrl?: string;
    name?: string;
  };
  networkType?: string;
  networkCategory?: string;
  consensusMethod?: string;
  coingeckoPlatformId?: string;
  tokenSources?: string[];
};

/**
 * Top asset
 */
export type TokensTopAsset = {
  address: string;
  symbol: string;
};

/**
 * Tokens API Service
 *
 * SDK for interacting with MetaMask's Tokens API (tokens.api.cx.metamask.io).
 * Provides V2/V3 methods for fetching token metadata, CAIP-19 assets,
 * and multi-chain token search.
 */
/**
 * Method names exposed via BackendApiClient messenger
 */
export const TOKENS_API_METHODS = [
  // Supported Networks
  'getV1SupportedNetworks',
  'getV2SupportedNetworks',
  // Token List
  'getV1TokenList',
  // Token Details
  'getV1TokenMetadata',
  'getV1TokenDetails',
  'getV1TokensByAddresses',
  // Token Search
  'getV1SearchTokens',
  'getV1SearchTokensOnChain',
  // V3 Assets
  'getV3Assets',
  // Trending Tokens
  'getV3TrendingTokens',
  // Network Config
  'getNetworkConfig',
  'getNetworkTokenStandard',
  // Top Assets
  'getTopAssets',
] as const;

export class TokensApiService {
  readonly #client: HttpClient;

  readonly #baseUrl: string;

  constructor(options: TokensApiServiceOptions = {}) {
    this.#baseUrl = options.baseUrl ?? TOKENS_API_BASE_URL;
    this.#client = new HttpClient(this.#baseUrl, options);
  }

  // ===========================================================================
  // Supported Networks Methods
  // ===========================================================================

  /**
   * Get supported networks (v1 endpoint)
   *
   * @param signal - Optional abort signal
   * @returns Supported networks with full and partial support
   */
  async getV1SupportedNetworks(
    signal?: AbortSignal,
  ): Promise<GetTokensSupportedNetworksV1Response> {
    return this.#client.get('/v1/supportedNetworks', { signal });
  }

  /**
   * Get supported networks in CAIP format (v2 endpoint)
   *
   * @param signal - Optional abort signal
   * @returns Supported networks as CAIP chain IDs
   */
  async getV2SupportedNetworks(
    signal?: AbortSignal,
  ): Promise<GetTokensSupportedNetworksV2Response> {
    return this.#client.get('/v2/supportedNetworks', { signal });
  }

  // ===========================================================================
  // Token List Methods
  // ===========================================================================

  /**
   * Get list of tokens for a chain
   *
   * @param options - Token list request options
   * @param signal - Optional abort signal
   * @returns Array of token metadata
   */
  async getV1TokenList(
    options: GetTokenListOptions,
    signal?: AbortSignal,
  ): Promise<TokenMetadata[]> {
    const {
      chainId,
      occurrenceFloor,
      includeNativeAssets,
      includeTokenFees,
      includeAssetType,
      includeERC20Permit,
      includeStorage,
    } = options;

    const params = new URLSearchParams();

    if (occurrenceFloor !== undefined) {
      params.append('occurrenceFloor', String(occurrenceFloor));
    }
    if (includeNativeAssets !== undefined) {
      params.append('includeNativeAssets', String(includeNativeAssets));
    }
    if (includeTokenFees !== undefined) {
      params.append('includeTokenFees', String(includeTokenFees));
    }
    if (includeAssetType !== undefined) {
      params.append('includeAssetType', String(includeAssetType));
    }
    if (includeERC20Permit !== undefined) {
      params.append('includeERC20Permit', String(includeERC20Permit));
    }
    if (includeStorage !== undefined) {
      params.append('includeStorage', String(includeStorage));
    }

    const queryString = params.toString();
    const chainIdDecimal = parseInt(chainId, 16);

    return this.#client.get(
      `/tokens/${chainIdDecimal}${queryString ? `?${queryString}` : ''}`,
      { signal },
    );
  }

  // ===========================================================================
  // Token Details Methods
  // ===========================================================================

  /**
   * Get token metadata by address
   *
   * @param options - Token metadata request options
   * @param signal - Optional abort signal
   * @returns Token metadata or undefined if not found
   */
  async getV1TokenMetadata(
    options: GetTokenMetadataOptions,
    signal?: AbortSignal,
  ): Promise<TokenMetadata | undefined> {
    const { chainId, tokenAddress } = options;
    const chainIdDecimal = parseInt(chainId, 16);

    try {
      const response = await this.#client.get<TokenMetadata[]>(
        `/token/${chainIdDecimal}?address=${tokenAddress}`,
        { signal },
      );

      return response?.[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Get detailed token information with enriched data
   *
   * @param chainId - Chain ID in hex format
   * @param tokenAddress - Token contract address
   * @param options - Include options
   * @param options.includeEnrichedData - Whether to include enriched data
   * @param options.includeCoingeckoId - Whether to include CoinGecko ID
   * @param options.includeAggregators - Whether to include aggregators
   * @param options.includeOccurrences - Whether to include occurrences
   * @param options.includeIconUrl - Whether to include icon URL
   * @param options.includeAssetType - Whether to include asset type
   * @param options.includeTokenFees - Whether to include token fees
   * @param options.includeHoneypotStatus - Whether to include honeypot status
   * @param options.includeContractVerificationStatus - Whether to include contract verification status
   * @param options.includeStorage - Whether to include storage info
   * @param options.includeERC20Permit - Whether to include ERC20 permit info
   * @param options.includeDescription - Whether to include description
   * @param options.includeCexData - Whether to include CEX data
   * @param signal - Optional abort signal
   * @returns Token details with enriched data
   */
  async getV1TokenDetails(
    chainId: string,
    tokenAddress: string,
    options?: {
      includeEnrichedData?: boolean;
      includeCoingeckoId?: boolean;
      includeAggregators?: boolean;
      includeOccurrences?: boolean;
      includeIconUrl?: boolean;
      includeAssetType?: boolean;
      includeTokenFees?: boolean;
      includeHoneypotStatus?: boolean;
      includeContractVerificationStatus?: boolean;
      includeStorage?: boolean;
      includeERC20Permit?: boolean;
      includeDescription?: boolean;
      includeCexData?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<TokenDetails | undefined> {
    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();
    params.append('address', tokenAddress);

    if (options?.includeEnrichedData !== undefined) {
      params.append('includeEnrichedData', String(options.includeEnrichedData));
    }
    if (options?.includeCoingeckoId !== undefined) {
      params.append('includeCoingeckoId', String(options.includeCoingeckoId));
    }
    if (options?.includeAggregators !== undefined) {
      params.append('includeAggregators', String(options.includeAggregators));
    }
    if (options?.includeOccurrences !== undefined) {
      params.append('includeOccurrences', String(options.includeOccurrences));
    }
    if (options?.includeIconUrl !== undefined) {
      params.append('includeIconUrl', String(options.includeIconUrl));
    }
    if (options?.includeAssetType !== undefined) {
      params.append('includeAssetType', String(options.includeAssetType));
    }
    if (options?.includeTokenFees !== undefined) {
      params.append('includeTokenFees', String(options.includeTokenFees));
    }
    if (options?.includeHoneypotStatus !== undefined) {
      params.append(
        'includeHoneypotStatus',
        String(options.includeHoneypotStatus),
      );
    }
    if (options?.includeContractVerificationStatus !== undefined) {
      params.append(
        'includeContractVerificationStatus',
        String(options.includeContractVerificationStatus),
      );
    }
    if (options?.includeStorage !== undefined) {
      params.append('includeStorage', String(options.includeStorage));
    }
    if (options?.includeERC20Permit !== undefined) {
      params.append('includeERC20Permit', String(options.includeERC20Permit));
    }
    if (options?.includeDescription !== undefined) {
      params.append('includeDescription', String(options.includeDescription));
    }
    if (options?.includeCexData !== undefined) {
      params.append('includeCexData', String(options.includeCexData));
    }

    try {
      const response = await this.#client.get<TokenDetails[]>(
        `/token/${chainIdDecimal}?${params.toString()}`,
        { signal },
      );
      return response?.[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Get multiple tokens by addresses
   *
   * @param chainId - Chain ID in hex format
   * @param tokenAddresses - Array of token addresses
   * @param signal - Optional abort signal
   * @returns Array of token details
   */
  async getV1TokensByAddresses(
    chainId: string,
    tokenAddresses: string[],
    signal?: AbortSignal,
  ): Promise<TokenDetails[]> {
    if (tokenAddresses.length === 0) {
      return [];
    }

    const chainIdDecimal = parseInt(chainId, 16);
    return this.#client.get(
      `/token/${chainIdDecimal}?addresses=${tokenAddresses.join(',')}`,
      { signal },
    );
  }

  // ===========================================================================
  // Token Search Methods
  // ===========================================================================

  /**
   * Search tokens across multiple chains
   *
   * @param options - Search options
   * @param signal - Optional abort signal
   * @returns Token search response
   */
  async getV1SearchTokens(
    options: SearchTokensOptions,
    signal?: AbortSignal,
  ): Promise<TokenSearchResponse> {
    const { chainIds, query, limit, includeMarketData } = options;

    const params = new URLSearchParams();
    params.append('chains', chainIds.join(','));
    params.append('query', query);

    if (limit !== undefined) {
      params.append('limit', String(limit));
    }
    if (includeMarketData !== undefined) {
      params.append('includeMarketData', String(includeMarketData));
    }

    return this.#client.get(`/tokens/search?${params.toString()}`, { signal });
  }

  /**
   * Search tokens on a specific chain
   *
   * @param chainId - Chain ID in hex format
   * @param query - Search query
   * @param options - Optional parameters
   * @param options.limit - Maximum number of results to return
   * @param signal - Optional abort signal
   * @returns Array of matching tokens
   */
  async getV1SearchTokensOnChain(
    chainId: string,
    query: string,
    options?: {
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<TokenMetadata[]> {
    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();
    params.append('query', query);

    if (options?.limit !== undefined) {
      params.append('limit', String(options.limit));
    }

    return this.#client.get(
      `/tokens/${chainIdDecimal}/search?${params.toString()}`,
      { signal },
    );
  }

  // ===========================================================================
  // V3 Asset Methods (CAIP-19 based)
  // ===========================================================================

  /**
   * Get assets by CAIP-19 asset IDs (v3 endpoint)
   *
   * @param assetIds - Array of CAIP-19 asset IDs
   * @param options - Include options
   * @param options.includeCoingeckoId - Whether to include CoinGecko ID
   * @param options.includeAggregators - Whether to include aggregators
   * @param options.includeOccurrences - Whether to include occurrences
   * @param options.includeIconUrl - Whether to include icon URL
   * @param signal - Optional abort signal
   * @returns Map of asset ID to asset details
   *
   * @example
   * ```typescript
   * const assets = await tokensApi.getV3Assets([
   *   'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
   *   'eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
   * ]);
   * ```
   */
  async getV3Assets(
    assetIds: string[],
    options?: {
      includeCoingeckoId?: boolean;
      includeAggregators?: boolean;
      includeOccurrences?: boolean;
      includeIconUrl?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<Record<string, AssetByIdResponse>> {
    if (assetIds.length === 0) {
      return {};
    }

    const params = new URLSearchParams();
    params.append('assetIds', assetIds.join(','));

    if (options?.includeCoingeckoId !== undefined) {
      params.append('includeCoingeckoId', String(options.includeCoingeckoId));
    }
    if (options?.includeAggregators !== undefined) {
      params.append('includeAggregators', String(options.includeAggregators));
    }
    if (options?.includeOccurrences !== undefined) {
      params.append('includeOccurrences', String(options.includeOccurrences));
    }
    if (options?.includeIconUrl !== undefined) {
      params.append('includeIconUrl', String(options.includeIconUrl));
    }

    const response = await this.#client.get<
      (AssetByIdResponse & { assetId?: string })[]
    >(`/v3/assets?${params.toString()}`, { signal });

    // Transform array response to object keyed by CAIP asset IDs
    const result: Record<string, AssetByIdResponse> = {};
    for (const asset of response) {
      // Use assetId from response if available, otherwise construct from chainId/address
      const assetId =
        asset.assetId ??
        `eip155:${asset.chainId}/erc20:${asset.address.toLowerCase()}`;
      result[assetId] = asset;
    }
    return result;
  }

  // ===========================================================================
  // Trending Token Methods (v3)
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
    params.append('chains', chainIds.join(','));

    if (sortBy) {
      params.append('sortBy', sortBy);
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

  // ===========================================================================
  // Network Methods
  // ===========================================================================

  /**
   * Get network configuration
   *
   * @param chainId - Chain ID in hex format
   * @param signal - Optional abort signal
   * @returns Network configuration
   */
  async getNetworkConfig(
    chainId: string,
    signal?: AbortSignal,
  ): Promise<TokensNetworkConfig | undefined> {
    const chainIdDecimal = parseInt(chainId, 16);

    try {
      const response = await this.#client.get<TokensNetworkConfig[]>(
        `/networks/${chainIdDecimal}`,
        { signal },
      );
      return response?.[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Get token standard for a network
   *
   * @param chainId - Chain ID in hex format
   * @param options - Query options
   * @param options.limit - Maximum number of results to return
   * @param signal - Optional abort signal
   * @returns Token standard list
   */
  async getNetworkTokenStandard(
    chainId: string,
    options?: { limit?: number },
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const chainIdDecimal = parseInt(chainId, 16);
    const params = new URLSearchParams();

    if (options?.limit !== undefined) {
      params.append('limit', String(options.limit));
    }

    const queryString = params.toString();
    return this.#client.get(
      `/networks/${chainIdDecimal}/tokenStandard${queryString ? `?${queryString}` : ''}`,
      { signal },
    );
  }

  // ===========================================================================
  // Top Assets Methods
  // ===========================================================================

  /**
   * Get top assets for a chain
   *
   * @param chainId - Chain ID in hex format
   * @param signal - Optional abort signal
   * @returns Array of top assets
   */
  async getTopAssets(
    chainId: string,
    signal?: AbortSignal,
  ): Promise<TokensTopAsset[]> {
    const chainIdDecimal = parseInt(chainId, 16);
    return this.#client.get(`/topAssets/${chainIdDecimal}`, { signal });
  }

  // ===========================================================================
  // Icon Methods
  // ===========================================================================

  /**
   * Get token icon URL
   *
   * @param chainId - Chain ID in hex format
   * @param tokenAddress - Token contract address
   * @param type - Image type ('original.png' or 'thumbnail.png')
   * @returns Icon URL
   */
  getTokenIconUrl(
    chainId: string,
    tokenAddress: string,
    type: 'original.png' | 'thumbnail.png' = 'original.png',
  ): string {
    const chainIdDecimal = parseInt(chainId, 16);
    return `${this.#baseUrl}/icons/${chainIdDecimal}/${tokenAddress}/${type}`;
  }
}
