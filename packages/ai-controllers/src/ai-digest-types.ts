import type { CaipAssetType } from '@metamask/utils';

// ---------------------------------------------------------------------------
// Market Insights types
// ---------------------------------------------------------------------------

/**
 * A news article referenced by a market insight trend.
 */
export type MarketInsightsArticle = {
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
 * A social media post referenced by a market insight trend.
 */
export type MarketInsightsTweet = {
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
 * A key market trend identified in the insights report.
 */
export type MarketInsightsTrend = {
  /** Trend title (e.g. "Institutions Buying the Dip") */
  title: string;
  /** Detailed description of the trend */
  description: string;
  /** Category of the trend */
  category: 'macro' | 'technical' | 'social' | string;
  /** Impact direction */
  impact: 'positive' | 'negative' | 'neutral' | string;
  /** Related news articles */
  articles: MarketInsightsArticle[];
  /** Related social media posts */
  tweets: MarketInsightsTweet[];
};

/**
 * A data source used to generate the market insights report.
 */
export type MarketInsightsSource = {
  /** Source name (e.g. "CoinDesk") */
  name: string;
  /** Source URL */
  url: string;
  /** Source type */
  type: 'news' | 'data' | 'social' | string;
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
  social?: MarketInsightsTweet[];
  /** Data sources used to generate the report */
  sources: MarketInsightsSource[];
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

// ---------------------------------------------------------------------------
// Controller state
// ---------------------------------------------------------------------------

export type AiDigestControllerState = {
  marketInsights: Record<string, MarketInsightsEntry>;
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export type DigestService = {
  /**
   * Search for market insights by CAIP-19 asset identifier.
   * Calls `GET /digests?caipAssetType=<caip19Id>`.
   *
   * @param caip19Id - The CAIP-19 identifier of the asset.
   * @returns The market insights report, or `null` if no insights exist (404).
   */
  searchDigest(caip19Id: CaipAssetType): Promise<MarketInsightsReport | null>;
};
