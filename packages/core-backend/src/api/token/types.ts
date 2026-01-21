/**
 * Token API types for the API Platform Client.
 * API: token.api.cx.metamask.io
 */

// ============================================================================
// TOKEN METADATA TYPES
// ============================================================================

/**
 * Token metadata from Token API v1 /tokens/{chainId} endpoint
 */
export type TokenMetadata = {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  iconUrl?: string;
  aggregators?: string[];
  occurrences?: number;
};

/** Token description response */
export type V1TokenDescriptionResponse = {
  description: string;
};

// ============================================================================
// NETWORK TYPES
// ============================================================================

/** Network info */
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

// ============================================================================
// TOP ASSETS TYPES
// ============================================================================

/** Top asset */
export type TopAsset = {
  address: string;
  symbol: string;
};

// ============================================================================
// TRENDING TOKENS TYPES
// ============================================================================

/**
 * Sort options for trending tokens (v3)
 */
export type TrendingSortBy =
  | 'm5_trending'
  | 'h1_trending'
  | 'h6_trending'
  | 'h24_trending';

/**
 * Trending token data from Token API v3 /tokens/trending endpoint
 */
export type TrendingToken = {
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  price: string;
  aggregatedUsdVolume: number;
  marketCap: number;
  priceChangePct?: {
    m5?: string;
    m15?: string;
    m30?: string;
    h1?: string;
    h6?: string;
    h24?: string;
  };
  labels?: string[];
};

/** Top gainers sort options */
export type TopGainersSortOption =
  | 'm5_price_change_percentage_desc'
  | 'h1_price_change_percentage_desc'
  | 'h6_price_change_percentage_desc'
  | 'h24_price_change_percentage_desc'
  | 'm5_price_change_percentage_asc'
  | 'h1_price_change_percentage_asc'
  | 'h6_price_change_percentage_asc'
  | 'h24_price_change_percentage_asc';

/** Trending sort options */
export type TrendingSortOption =
  | 'm5_trending'
  | 'h1_trending'
  | 'h6_trending'
  | 'h24_trending';

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Suggested occurrence floors response */
export type V1SuggestedOccurrenceFloorsResponse = {
  [chainId: string]: number;
};
