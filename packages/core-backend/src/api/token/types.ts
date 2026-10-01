/**
 * Token API types for the API Platform Client.
 * API: token.api.cx.metamask.io
 */

import type { SupportedCurrency } from '../shared-types.js';

// ============================================================================
// SHARED QUERY TYPES
// ============================================================================

/** Region of the block-listed assets to exclude. */
export type TokenBlockRegion = 'global' | 'us';

/**
 * Cursor-based page info used by the Token API's JWT-paginated endpoints
 * (`/v1/rwas`, `/v3/tokens/meme`, `/v1/tokens/sparkline`).
 */
export type TokenCursorPageInfo = {
  /** JWT cursor for the next page, or `null` when there is no next page. */
  nextCursor: string | null;
  hasNextPage: boolean;
};

// ============================================================================
// RWA TYPES
// ============================================================================

/** Market open/close window for a Real World Asset. */
export type TokenRwaMarketWindow = {
  nextOpen: string | null;
  nextClose: string | null;
};

/**
 * Scheduled trading pause for a Real World Asset.
 * `nextPause` is an empty object when no pause is scheduled, so every field
 * is optional.
 */
export type TokenRwaPause = {
  start?: string;
  end?: string;
  reason?: string;
};

/**
 * Real World Asset (RWA) data returned when `includeRwaData` is set, and on
 * every item returned by `/v1/rwas`.
 */
export type TokenRwaData = {
  market: TokenRwaMarketWindow;
  nextPause: TokenRwaPause | null;
  offhours: TokenRwaMarketWindow;
  /** Underlying instrument ticker (e.g. `MSFT`). */
  ticker: string;
  instrumentType: string;
  assetClass: string;
  constituentTokens: string[] | null;
  custodians: string[];
  industry: string[];
  active: boolean;
  addressType: string;
  /** Omitted when the source has no share count. */
  sharesOutstanding?: number;
  restrictedCountries: string[];
  updatedAt: string;
  price: string;
  /** Omitted when the source has no market cap. */
  marketCap?: number;
  priceChange: string;
  aggregatedUsdVolume: number;
};

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
  holdingPercentage: number | null;
};

export type TokenSecurityMarket = {
  marketType: string;
  marketName: string;
  pairName: string;
  reserveUSD: number;
};

export type TokenSecurityFees = {
  transfer: number | null;
  transferFeeMaxAmount: number | null;
  buy: number | null;
  sell: number | null;
};

export type TokenSecurityFinancialStats = {
  /** Omitted for assets the security API has no supply for (e.g. native ETH). */
  supply?: number;
  topHolders: TokenSecurityHolder[] | null;
  /** Omitted when the holder count is unknown. */
  holdersCount?: number;
  /** Omitted or `null` when 24h trade volume is unknown. */
  tradeVolume24h?: number | null;
  /** Omitted or `null` when locked liquidity is unknown. */
  lockedLiquidityPct?: number | null;
  markets: TokenSecurityMarket[] | null;
};

export type TokenSecurityMetadata = {
  /** Omitted entirely when the security API has no link data. */
  externalLinks?: {
    homepage: string | null;
    twitterPage: string | null;
    telegramChannelId: string | null;
  };
};

export type TokenSecurityData = {
  resultType: string;
  /** `null` for assets the security API cannot score (e.g. native ETH). */
  maliciousScore: string | null;
  fees: TokenSecurityFees | null;
  features: TokenSecurityFeature[] | null;
  financialStats: TokenSecurityFinancialStats;
  metadata: TokenSecurityMetadata;
  /** Omitted when the security API has no creation timestamp. */
  created?: string;
};

/** Summary security data returned by `/v1/tokens/security-data` by default. */
export type V1TokenSecuritySummary = Pick<
  TokenSecurityData,
  'maliciousScore' | 'resultType'
>;

/** Query options for `/v1/tokens/security-data`. */
export type V1TokenSecurityDataQueryOptions = {
  /**
   * Whether to include the full security payload (fees, features, financial
   * stats, metadata) instead of only `maliciousScore` and `resultType`.
   */
  includeExtendedData?: boolean;
};

/**
 * `/v1/tokens/security-data` response, keyed by CAIP-19 asset ID.
 *
 * Every entry has `maliciousScore` and `resultType`; the remaining
 * `TokenSecurityData` fields are present only when `includeExtendedData` is
 * `true`. Chains not supported by the security-alerts API are omitted, so the
 * object may be empty.
 */
export type V1TokenSecurityDataResponse = {
  [assetId: string]: V1TokenSecuritySummary &
    Partial<Omit<TokenSecurityData, 'maliciousScore' | 'resultType'>>;
};

// ============================================================================
// TOKEN METADATA TYPES
// ============================================================================

/** Token fee information. */
export type TokenFees = {
  minFee: number;
  avgFee: number;
  maxFee: number;
};

/**
 * Token storage slot information.
 * Either slot is omitted when the token list has no index for it.
 */
export type TokenStorage = {
  balance?: number;
  approval?: number;
};

/**
 * Token metadata from Token API `/tokens/{chainId}` and `/token/{chainId}`.
 *
 * Optional fields are controlled by the corresponding `include*` query options.
 */
export type TokenMetadata = {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  iconUrl?: string;
  /** Asset type (e.g. `erc20`, `native`). */
  type?: string;
  aggregators?: string[];
  occurrences?: number;
  /** Whether the token meets the EIP-2612 permit standard. */
  erc20Permit?: boolean;
  fees?: TokenFees;
  storage?: TokenStorage;
  labels?: string[];
  rwaData?: TokenRwaData | null;
  securityData?: TokenSecurityData;
};

/** Query options for `/tokens/{chainId}`. */
export type TokenListQueryOptions = {
  /** Minimum number of token lists a token must appear on to be included. */
  occurrenceFloor?: number;
  /**
   * Whether to use the suggested token occurrence floor (if `true`, ignores
   * `occurrenceFloor`).
   */
  useSuggestedOccurrenceFloor?: boolean;
  includeDuplicateSymbolAssets?: boolean;
  includeNativeAssets?: boolean;
  includeTokenFees?: boolean;
  includeAssetType?: boolean;
  includeAggregators?: boolean;
  includeERC20Permit?: boolean;
  includeOccurrences?: boolean;
  includeStorage?: boolean;
  includeIconUrl?: boolean;
  includeAddress?: boolean;
  includeName?: boolean;
  includeRwaData?: boolean;
  includeTokenSecurityData?: boolean;
  includeLabels?: boolean;
};

/** Query options for `/token/{chainId}`. */
export type V1TokenMetadataQueryOptions = {
  includeTokenFees?: boolean;
  includeAssetType?: boolean;
  includeAggregators?: boolean;
  includeERC20Permit?: boolean;
  includeOccurrences?: boolean;
  includeStorage?: boolean;
  includeIconUrl?: boolean;
  includeAddress?: boolean;
  includeName?: boolean;
  includeTokenSecurityData?: boolean;
};

/**
 * Localized token descriptions from `/token/{chainId}/description`, keyed by
 * locale code (`en`, `zh-tw`, ...).
 */
export type V1TokenDescriptionResponse = {
  [locale: string]: string;
};

// ============================================================================
// NETWORK TYPES
// ============================================================================

/**
 * Token API `/v2/supportedNetworks` response: CAIP-2 chain IDs for which the
 * Token API serves a per-chain token list (`/tokens/{chainId}`), split by
 * support tier.
 *
 * Not to be confused with `V2TokenSupportedNetworksResponse`, which is the
 * Tokens API (`tokens.api.cx.metamask.io`) equivalent.
 */
export type TokenV2SupportedNetworksResponse = {
  fullSupport: string[];
  partialSupport: string[];
};

/**
 * Network info.
 *
 * @deprecated The Token API `/networks` endpoints no longer exist in
 * production. Use `TokenV2SupportedNetworksResponse` via
 * `TokenApiClient.fetchV2SupportedNetworks` instead.
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
 * Trending token data from Token API v3 `/tokens/trending`, `/tokens/top-gainers`
 * and `/tokens/popular` endpoints.
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
  /** Present when `includeLabels` is `true`. */
  labels?: string[];
  /** Present when `includeRwaData` is `true`. */
  rwaData?: TokenRwaData | null;
  /** Present when `includeTokenSecurityData` is `true`. */
  securityData?: TokenSecurityData;
  /**
   * Present when `includeWssSupportField` is `true`. Mirrors the Price API and
   * is `true` when the asset price can be streamed over the price websocket.
   */
  wssSupport?: boolean;
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

/** Popular tokens sort options */
export type PopularTokensSortOption =
  | 'h24_volume_usd_desc'
  | 'h24_tx_count_desc';

/**
 * Currencies accepted by the `vsCurrency` parameter of `/v3/tokens/trending`.
 * Extends the Price API currencies with a few extra units.
 */
export type TrendingVsCurrency =
  | SupportedCurrency
  | 'xdr'
  | 'xag'
  | 'xau'
  | 'bits'
  | 'sats';

/**
 * Filter options shared by `/v3/tokens/trending`, `/v3/tokens/top-gainers`
 * and `/v3/tokens/popular`.
 */
export type V3TokenDiscoveryQueryOptions = {
  /** Region of the block-listed assets to exclude. */
  blockRegion?: TokenBlockRegion;
  /** Minimum liquidity (USD) to filter assets by. */
  minLiquidity?: number;
  /** Minimum USD volume over 24h to filter assets by. */
  minVolume24hUsd?: number;
  /** Maximum USD volume over 24h to filter assets by. */
  maxVolume24hUsd?: number;
  /** Minimum market cap to filter assets by. */
  minMarketCap?: number;
  /** Maximum market cap to filter assets by. */
  maxMarketCap?: number;
  includeRwaData?: boolean;
  includeLabels?: boolean;
  includeTokenSecurityData?: boolean;
  /** Whether to include the `wssSupport` field on each token. */
  includeWssSupportField?: boolean;
  /** Labels to filter out. Sent as a comma-separated list. */
  excludeLabels?: string[];
  /** Whether to exclude common assets like stablecoins and blue chip assets. */
  excludeCommonAssets?: boolean;
  /** Whether to filter out "Warning" assets. */
  filterWarning?: boolean;
};

/** Query options for `/v3/tokens/trending`. */
export type V3TrendingTokensQueryOptions = V3TokenDiscoveryQueryOptions & {
  /** Sort option (sent as the `sort` query parameter). */
  sortBy?: TrendingSortOption;
  /** Whether to filter out tokens with a 24h price gain of 1000% or more. */
  filterPriceGainOutliers?: boolean;
  /** Currency to convert prices to. */
  vsCurrency?: TrendingVsCurrency;
};

/** Query options for `/v3/tokens/top-gainers`. */
export type V3TopGainersQueryOptions = V3TokenDiscoveryQueryOptions & {
  sort?: TopGainersSortOption;
};

/** Query options for `/v3/tokens/popular`. */
export type V3PopularTokensQueryOptions = V3TokenDiscoveryQueryOptions & {
  sort?: PopularTokensSortOption;
  /** CAIP-19 asset IDs to include at the top of the response. */
  defaultAssetIds?: string[];
  /** CAIP-19 asset IDs to exclude from the response. */
  excludeAssetIds?: string[];
};

// ============================================================================
// MEME TOKENS TYPES
// ============================================================================

/** Timeframe options for `/v3/tokens/meme/trending`. */
export type V3TrendingMemeTokensTimeframe = '1h' | '4h' | '24h';

/** Sort options for `/v3/tokens/meme/trending`. */
export type V3TrendingMemeTokensSortOption =
  | 'trending'
  | 'volume'
  | 'price_change'
  | 'market_cap';

/** Minimum liquidity tiers (USD) accepted by `/v3/tokens/meme/trending`. */
export type V3TrendingMemeTokensMinLiquidity =
  | 0
  | 10000
  | 50000
  | 100000
  | 500000
  | 1000000;

/** Minimum market cap tiers (USD) accepted by `/v3/tokens/meme/trending`. */
export type V3TrendingMemeTokensMinMarketCap =
  | 0
  | 100000
  | 1000000
  | 10000000
  | 100000000
  | 1000000000;

/** Maximum market cap tiers (USD) accepted by `/v3/tokens/meme/trending`. */
export type V3TrendingMemeTokensMaxMarketCap =
  | 100000
  | 1000000
  | 10000000
  | 100000000
  | 1000000000;

/**
 * Holder/sniper/bundler risk data, present when `includeRiskData` is `true`.
 * Solana entries add the optional score and holder-share fields; EVM entries
 * omit them. `sniperHeldPercentage` and `bundlerHeldPercentage` are `null`
 * when the source has no figure.
 */
export type MemeTokenRiskData = {
  holders: number;
  top10HoldersPercent: number;
  sniperHeldPercentage: number | null;
  bundlerHeldPercentage?: number | null;
  devHeldPercentage?: number;
  insiderHeldPercentage?: number;
  riskScore?: number;
  rugged?: boolean;
};

/**
 * Meme token returned by `/v3/tokens/meme` and `/v3/tokens/meme/trending`.
 */
export type MemeToken = TrendingToken & {
  liquidity?: number;
  iconUrl?: string;
  /** Launchpad the token was created on (e.g. `pumpfun`, `flap`). */
  launchpad?: string;
  /** Present when `includeRiskData` is `true`. */
  riskData?: MemeTokenRiskData;
};

/** Query options for `/v3/tokens/meme`. */
export type V3MemeTokensQueryOptions = {
  /** CAIP-2 chain IDs. Defaults to all supported networks when omitted. */
  chainIds?: string[];
  /** Launchpad names to filter by (e.g. `['flap', 'pumpfun']`). */
  launchpads?: string[];
  /** CAIP-19 asset IDs to look up. */
  assetIds?: string[];
  /** Token contract addresses to look up (EVM hex, Solana/Tron base58). */
  addresses?: string[];
  /** Case- and accent-insensitive substring match on token name or symbol. */
  search?: string;
  /** Number of results per page (max 100). */
  limit?: number;
  /** JWT cursor from the previous response's `pageInfo.nextCursor`. */
  after?: string;
  includeTokenSecurityData?: boolean;
};

/** `/v3/tokens/meme` response. */
export type V3MemeTokensResponse = {
  data: MemeToken[];
  pageInfo: TokenCursorPageInfo;
};

/** Query options for `/v3/tokens/meme/trending`. */
export type V3TrendingMemeTokensQueryOptions = {
  /** Window used for trending score, volume and price change. */
  timeframe?: V3TrendingMemeTokensTimeframe;
  /** Ranking applied over the selected timeframe. */
  sort?: V3TrendingMemeTokensSortOption;
  /** Maximum number of tokens to return (max 200). */
  limit?: number;
  minLiquidity?: V3TrendingMemeTokensMinLiquidity;
  minMarketCap?: V3TrendingMemeTokensMinMarketCap;
  maxMarketCap?: V3TrendingMemeTokensMaxMarketCap;
  blockRegion?: TokenBlockRegion;
  includeLabels?: boolean;
  includeRwaData?: boolean;
  includeTokenSecurityData?: boolean;
  /**
   * Whether to include holder count, top 10 holder share, sniper and bundler
   * held percentages (`riskData`).
   */
  includeRiskData?: boolean;
  /** Labels to filter out. Sent as a comma-separated list. */
  excludeLabels?: string[];
  excludeCommonAssets?: boolean;
  filterWarning?: boolean;
};

// ============================================================================
// TOKEN SEARCH TYPES
// ============================================================================

/** Query options for `/tokens/search`. */
export type TokenSearchQueryOptions = {
  /**
   * CAIP-2 chain IDs to search. When omitted, defaults to all supported
   * search networks.
   */
  networks?: string[];
  blockRegion?: TokenBlockRegion;
  /** Maximum number of results to request (default 10). */
  first?: number;
  /** Base64 encoded end cursor for forward pagination (default `MA==`). */
  after?: string;
  /** CAIP-19 asset IDs to include at the top of the response. */
  defaultAssetIds?: string[];
  /** CAIP-19 asset IDs to exclude from the response. */
  excludeAssetIds?: string[];
  includeRwaData?: boolean;
  includeLabels?: boolean;
  includeTokenSecurityData?: boolean;
  /** Whether to include the `wssSupport` field on each result. */
  includeWssSupportField?: boolean;
};

/** Token returned by `/tokens/search`. */
export type TokenSearchResult = {
  assetId: string;
  symbol: string;
  decimals: number;
  name: string;
  labels?: string[];
  rwaData?: TokenRwaData | null;
  securityData?: TokenSecurityData;
  wssSupport?: boolean;
};

/** `/tokens/search` response. */
export type TokenSearchResponse = {
  data: TokenSearchResult[];
  /** Number of items in `data`. */
  count: number;
  /** Total number of matches across all pages. */
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    /** Base64 cursor to pass as `after` for the next page, or `null` on the last page. */
    endCursor: string | null;
  };
};

// ============================================================================
// ASSETS TYPES
// ============================================================================

/** Query options shared by `/assets` and `/v2/assets`. */
export type AssetsQueryOptions = {
  includeAggregators?: boolean;
  includeCoingeckoId?: boolean;
  includeLabels?: boolean;
  includeMarketData?: boolean;
  includeOccurrences?: boolean;
  includeTokenSecurityData?: boolean;
  includeRwaData?: boolean;
};

/** Market data returned by `/assets` when `includeMarketData` is `true`. */
export type V1AssetMarketData = {
  marketCap: number;
  totalVolume: number;
  price: string;
  pricePercentChange1d: string;
  pricePercentChange1h: string;
  liquidity: number;
  dilutedMarketCap: number;
  circulatingSupply: number;
};

/**
 * Asset returned by `/assets` (v1).
 *
 * When an `include*` flag is set but the data is unavailable, v1 omits the
 * field, and unknown `marketData` fields are coerced to `0` / `"0"`.
 */
export type V1Asset = {
  assetId: string;
  symbol: string;
  name: string;
  decimals: number;
  iconUrl?: string;
  aggregators?: string[];
  coingeckoId?: string;
  labels?: string[];
  occurrences?: number;
  marketData?: V1AssetMarketData;
  rwaData?: TokenRwaData;
  securityData?: TokenSecurityData;
};

/**
 * Market data returned by `/v2/assets` when `includeMarketData` is `true`.
 * Individual fields that are not known are `null`.
 */
export type V2AssetMarketData = {
  [Key in keyof V1AssetMarketData]: V1AssetMarketData[Key] | null;
};

/**
 * Asset returned by `/v2/assets`.
 *
 * Differs from v1 in how unknown data is represented: when an `include*` flag
 * is set and the data is not available, the field is `null` (v1 omits it), and
 * individual `marketData` fields that are not known are `null` (v1 coerces
 * them to `0` / `"0"`). A value of `0` therefore always means the source
 * reported zero.
 */
export type V2Asset = {
  assetId: string;
  symbol: string;
  name: string;
  decimals: number;
  iconUrl?: string | null;
  aggregators?: string[] | null;
  coingeckoId?: string | null;
  labels?: string[] | null;
  occurrences?: number | null;
  marketData?: V2AssetMarketData | null;
  rwaData?: TokenRwaData | null;
  securityData?: TokenSecurityData | null;
};

// ============================================================================
// RWA LIST TYPES
// ============================================================================

/** Custodian filter for `/v1/rwas`. */
export type RwaCustodian = 'ondo' | 'robinhood';

/** Underlying asset type filter for `/v1/rwas`. */
export type RwaType = 'stock' | 'etf' | 'cef' | 'unspecified';

/** Industry filter for `/v1/rwas`. */
export type RwaIndustry =
  | 'industrials'
  | 'technology'
  | 'healthcare'
  | 'consumer discretionary'
  | 'financials'
  | 'materials'
  | 'utilities'
  | 'energy'
  | 'real estate'
  | 'infrastructure'
  | 'unspecified'
  | 'unknown';

/** Sort options for `/v1/rwas`. */
export type RwaSortBy =
  | 'price_change_asc'
  | 'price_change_desc'
  | 'volume_asc'
  | 'volume_desc'
  | 'market_cap_asc'
  | 'market_cap_desc';

/** Query options for `/v1/rwas`. */
export type V1RwasQueryOptions = {
  /** CAIP-2 chain IDs. Defaults to all supported networks when omitted. */
  chainIds?: string[];
  /** Filter by active status. */
  active?: boolean;
  custodian?: RwaCustodian;
  type?: RwaType;
  industry?: RwaIndustry;
  /** Number of results per page (1-100). */
  limit?: number;
  /** JWT cursor from the previous response's `pageInfo.nextCursor`. */
  after?: string;
  /** Contract address, CAIP-19 asset ID, symbol, or name to search for. */
  query?: string;
  sortBy?: RwaSortBy;
  includeTokenSecurityData?: boolean;
};

/** Real World Asset returned by `/v1/rwas`. */
export type V1Rwa = {
  id: string;
  assetId: string;
  symbol: string;
  decimals: number;
  /** Underlying instrument name (e.g. `Microsoft Corp`). */
  name: string;
  /** On-chain token name (e.g. `Microsoft (Ondo Tokenized)`). */
  tokenName: string;
  iconUrl?: string;
  rwaData: TokenRwaData;
  securityData?: TokenSecurityData;
};

/** `/v1/rwas` response. */
export type V1RwasResponse = {
  data: V1Rwa[];
  /** Number of items in `data`. */
  count: number;
  /** Total number of matches across all pages. */
  totalCount: number;
  pageInfo: TokenCursorPageInfo;
};

// ============================================================================
// SPARKLINE TYPES
// ============================================================================

/** Curated category used to select the sparkline token list. */
export type V1TokensSparklineCategory = 'trending' | 'popular' | 'topGainers';

/** Sort options for `/v1/tokens/sparkline`. */
export type V1TokensSparklineSortOption =
  | 'price_asc'
  | 'price_desc'
  | 'price_change_asc'
  | 'price_change_desc';

/** Query options for `/v1/tokens/sparkline`. */
export type V1TokensSparklineQueryOptions = {
  category?: V1TokensSparklineCategory;
  /** JWT cursor from the previous response's `pageInfo.nextCursor`. */
  cursor?: string;
  /** Time period for the price chart (e.g. `1d`, `7d`, `30d`, `1y`). */
  timePeriod?: string;
  /** Sort applied to the whole category list before pagination. */
  sort?: V1TokensSparklineSortOption;
};

/** Sparkline entry for a single asset. */
export type V1TokenSparkline = {
  /** `[timestampMs, price]` tuples, or `null` when no chart data is available. */
  sparkline: [number, number][] | null;
  name: string;
  symbol: string;
  pricePercentChange1d: number;
};

/** `/v1/tokens/sparkline` response, with `data` keyed by CAIP-19 asset ID. */
export type V1TokensSparklineResponse = {
  data: { [assetId: string]: V1TokenSparkline };
  pageInfo: TokenCursorPageInfo;
};

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Suggested occurrence floors response */
export type V1SuggestedOccurrenceFloorsResponse = {
  [chainId: string]: number;
};
