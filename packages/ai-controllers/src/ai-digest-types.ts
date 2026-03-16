// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

/**
 * A news article referenced by a trend.
 */
export type Article = {
  /** Article title */
  title: string;
  /** Full URL to the article */
  url: string;
  /** Source domain name (e.g. "coindesk.com") */
  source: string;
  /** ISO date string */
  date: string;
};

/**
 * A social media post referenced by a trend.
 */
export type Tweet = {
  /** Summary of the tweet content */
  contentSummary: string;
  /** Full URL to the tweet */
  url: string;
  /** Author handle (e.g. "@saylordocs") */
  author: string;
  /** ISO date string */
  date: string;
};

/**
 * A data source used to generate a report.
 */
export type Source = {
  /** Source name (e.g. "CoinDesk") */
  name: string;
  /** Source URL */
  url: string;
  /** Source type */
  type: 'news' | 'data' | 'social';
};

export type MarketInsightsArticle = Article;
export type MarketInsightsTweet = Tweet;
export type MarketInsightsSource = Source;

// ---------------------------------------------------------------------------
// Market Insights types (asset-specific)
// ---------------------------------------------------------------------------

/**
 * A key market trend identified in the insights report.
 */
export type MarketInsightsTrend = {
  /** Trend title (e.g. "Institutions Buying the Dip") */
  title: string;
  /** Detailed description of the trend */
  description: string;
  /** Category of the trend */
  category:
    | 'geopolitical'
    | 'macro'
    | 'regulatory'
    | 'technical'
    | 'social'
    | 'other';
  /** Impact direction */
  impact: 'positive' | 'negative' | 'neutral';
  /** Related news articles */
  articles: Article[];
  /** Related social media posts */
  tweets: Tweet[];
};

/**
 * AI-generated market insights report for a crypto asset.
 * Returned by `GET /asset-summary?caipAssetType=<caip19Id>` or `GET /asset-summary?hlPerpsMarket=<symbol>`.
 */
export type MarketInsightsReport = {
  /** API version */
  version?: string;
  /** Asset symbol (lowercase, e.g. "btc") */
  asset: string;
  /** ISO date string when the report was generated */
  generatedAt: string;
  /** Main headline */
  headline: string;
  /** Summary paragraph */
  summary: string;
  /** Key market trends */
  trends: MarketInsightsTrend[];
  /** Optional top-level social posts included by the API */
  social?: Tweet[];
  /** Data sources used to generate the report */
  sources: Source[];
  /** Provider metadata */
  metadata?: AIResponseMetadata[];
};

/**
 * A cached market insights entry.
 */
export type MarketInsightsEntry = {
  /** Asset identifier — either a CAIP-19 ID (e.g. "eip155:1/slip44:60") or a perps market symbol (e.g. "ETH") */
  assetIdentifier: string;
  /** Timestamp when the entry was fetched */
  fetchedAt: number;
  /** The market insights report data */
  data: MarketInsightsReport;
};

/**
 * A cached market overview entry.
 */
export type MarketOverviewEntry = {
  /** Timestamp when the entry was fetched */
  fetchedAt: number;
  /** The market overview data */
  data: MarketOverview;
};

// ---------------------------------------------------------------------------
// Market Overview types (non-asset-specific)
// ---------------------------------------------------------------------------

export type MarketOverviewTrend = {
  title: string;
  description: string;
  category:
    | 'geopolitical'
    | 'macro'
    | 'regulatory'
    | 'technical'
    | 'social'
    | 'other';
  impact: 'positive' | 'negative' | 'neutral';
  articles: Article[];
  relatedAssets: string[];
};

/**
 * Provider metadata included in AI API responses.
 */
export type AIResponseMetadata = {
  provider: string;
};

export type MarketOverview = {
  version?: string;
  generatedAt: string;
  headline: string;
  summary: string;
  trends: MarketOverviewTrend[];
  sources: Source[];
  metadata?: AIResponseMetadata[];
};

// ---------------------------------------------------------------------------
// Controller state
// ---------------------------------------------------------------------------

export type AiDigestControllerState = {
  marketInsights: Record<string, MarketInsightsEntry>;
  marketOverview: MarketOverviewEntry | null;
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export type DigestService = {
  /**
   * Search for market insights by asset identifier.
   *
   * Accepts either a CAIP-19 asset type (e.g. `eip155:1/slip44:60`) or a perps
   * market symbol (e.g. `ETH`). The implementation is responsible for choosing
   * the correct query parameter (`caipAssetType` vs `hlPerpsMarket`).
   *
   * Calls `GET /asset-summary?caipAssetType=<assetIdentifier>` for CAIP-19 IDs,
   * or `GET /asset-summary?hlPerpsMarket=<assetIdentifier>` for perps symbols.
   *
   * @param assetIdentifier - The asset identifier (CAIP-19 ID or perps market symbol).
   * @returns The market insights report, or `null` if no insights exist (404).
   */
  searchDigest(assetIdentifier: string): Promise<MarketInsightsReport | null>;

  /**
   * Fetch the market overview report.
   * Calls `GET /market-overview`.
   *
   * @returns The market overview report, or `null` if none exists (404).
   */
  fetchMarketOverview(): Promise<MarketOverview | null>;
};
