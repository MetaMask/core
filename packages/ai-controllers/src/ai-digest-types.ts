import type { CaipAssetType } from '@metamask/utils';

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
 * Returned by `GET /digests?caipAssetType=<caip19Id>`.
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
  /** CAIP-19 asset identifier */
  caip19Id: CaipAssetType;
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
   * Search for market insights by CAIP-19 asset identifier.
   * Calls `GET /asset-summary?caipAssetType=<caip19Id>`.
   *
   * @param caip19Id - The CAIP-19 identifier of the asset.
   * @returns The market insights report, or `null` if no insights exist (404).
   */
  searchDigest(caip19Id: CaipAssetType): Promise<MarketInsightsReport | null>;

  /**
   * Fetch the market overview report.
   * Calls `GET /market-overview`.
   *
   * @returns The market overview report, or `null` if none exists (404).
   */
  fetchMarketOverview(): Promise<MarketOverview | null>;
};
