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

/**
 * Query options for Token API `GET /tokens/{chainId}`.
 */
export type TokenListQueryOptions = {
  /** Minimum aggregator occurrences required for a token to be returned. */
  occurrenceFloor?: number;
  /** Include the chain's native asset in the list. */
  includeNativeAssets?: boolean;
  /** Include token fee data. */
  includeTokenFees?: boolean;
  /** Include asset type data. */
  includeAssetType?: boolean;
  /** Include aggregator data. */
  includeAggregators?: boolean;
  /** Include ERC-20 permit data. */
  includeERC20Permit?: boolean;
  /** Include occurrence counts. */
  includeOccurrences?: boolean;
  /** Include storage slot data. */
  includeStorage?: boolean;
  /** Include the token icon URL. */
  includeIconUrl?: boolean;
  /** Include the token address. */
  includeAddress?: boolean;
  /** Include the token name. */
  includeName?: boolean;
  /** Include real-world-asset data. */
  includeRwaData?: boolean;
};

/**
 * Supported networks from Token API `GET /v2/supportedNetworks`.
 * Chain IDs are CAIP-2 (for example `eip155:1`).
 */
export type TokenV2SupportedNetworksResponse = {
  fullSupport?: string[];
  partialSupport?: string[];
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

// ============================================================================
// TOKEN SECURITY TYPES
// ============================================================================

export type TokenSecurityFeature = {
  featureId: string;
  type: string;
  description: string;
};

export type TokenSecurityHolder = {
  label: string;
  name: string | null;
  address: string;
  holdingPercentage: number;
};

export type TokenSecurityMarket = {
  marketType: string;
  marketName: string;
  pairName: string;
  reserveUSD: number;
};

export type TokenSecurityFees = {
  transfer: number;
  transferFeeMaxAmount: number | null;
  buy: number;
  sell: number | null;
};

export type TokenSecurityFinancialStats = {
  supply: number;
  topHolders: TokenSecurityHolder[];
  holdersCount: number;
  tradeVolume24h: number | null;
  lockedLiquidityPct: number | null;
  markets: TokenSecurityMarket[];
};

export type TokenSecurityMetadata = {
  externalLinks: {
    homepage: string | null;
    twitterPage: string | null;
    telegramChannelId: string | null;
  };
};

export type TokenSecurityData = {
  resultType: string;
  maliciousScore: string;
  fees: TokenSecurityFees;
  features: TokenSecurityFeature[];
  financialStats: TokenSecurityFinancialStats;
  metadata: TokenSecurityMetadata;
  created: string;
};

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
  /** Optional security data for tokens when includeTokenSecurityData is true */
  securityData?: TokenSecurityData;
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
