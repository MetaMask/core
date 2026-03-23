import {
  array,
  enums,
  is,
  optional,
  string,
  type as structType,
} from '@metamask/superstruct';

import { AiDigestControllerErrorMessage } from './ai-digest-constants';
import type {
  DigestService,
  MarketInsightsReport,
  MarketOverview,
} from './ai-digest-types';

export type AiDigestServiceConfig = {
  baseUrl: string;
};

// Shared sub-type structs

const ArticleStruct = structType({
  title: string(),
  url: string(),
  source: string(),
  date: string(),
});

const TweetStruct = structType({
  contentSummary: string(),
  url: string(),
  author: string(),
  date: string(),
});

const SourceStruct = structType({
  name: string(),
  url: string(),
  type: enums(['news', 'data', 'social'] as const),
});

const AIResponseMetadataStruct = structType({
  provider: string(),
});

const trendCategoryValues = [
  'geopolitical',
  'macro',
  'regulatory',
  'technical',
  'social',
  'other',
] as const;

const trendImpactValues = ['positive', 'negative', 'neutral'] as const;

// Market Insights structs

const MarketInsightsTrendStruct = structType({
  title: string(),
  description: string(),
  category: enums(trendCategoryValues),
  impact: enums(trendImpactValues),
  articles: array(ArticleStruct),
  tweets: array(TweetStruct),
});

const MarketInsightsReportStruct = structType({
  version: optional(string()),
  asset: string(),
  generatedAt: string(),
  headline: string(),
  summary: string(),
  trends: array(MarketInsightsTrendStruct),
  social: optional(array(TweetStruct)),
  sources: array(SourceStruct),
  metadata: optional(array(AIResponseMetadataStruct)),
});

const MarketInsightsDigestEnvelopeStruct = structType({
  digest: MarketInsightsReportStruct,
});

// Market Overview structs

const RelatedAssetStruct = structType({
  name: string(),
  symbol: string(),
  caip19: array(string()),
  sourceAssetId: string(),
  hlPerpsMarket: optional(string()),
});

const MarketOverviewTrendStruct = structType({
  title: string(),
  description: string(),
  category: optional(enums(trendCategoryValues)),
  impact: optional(enums(trendImpactValues)),
  articles: array(ArticleStruct),
  relatedAssets: array(RelatedAssetStruct),
});

const MarketOverviewStruct = structType({
  version: optional(string()),
  generatedAt: string(),
  trends: array(MarketOverviewTrendStruct),
  metadata: optional(array(AIResponseMetadataStruct)),
});

const MarketOverviewReportEnvelopeStruct = structType({
  report: MarketOverviewStruct,
});

const getNormalizedMarketOverview = (value: unknown): MarketOverview | null => {
  if (is(value, MarketOverviewStruct)) {
    return value;
  }

  if (is(value, MarketOverviewReportEnvelopeStruct)) {
    return value.report;
  }

  return null;
};

const getNormalizedMarketInsightsReport = (
  value: unknown,
): MarketInsightsReport | null => {
  if (is(value, MarketInsightsReportStruct)) {
    return value;
  }

  if (is(value, MarketInsightsDigestEnvelopeStruct)) {
    return value.digest;
  }

  return null;
};

export class AiDigestService implements DigestService {
  readonly #baseUrl: string;

  constructor(config: AiDigestServiceConfig) {
    this.#baseUrl = config.baseUrl;
  }

  /**
   * Fetch the market overview report.
   *
   * Calls `GET ${this.#baseUrl}/market-overview`.
   *
   * @returns The market overview report, or `null` if none exists (404).
   */
  async fetchMarketOverview(): Promise<MarketOverview | null> {
    const response = await fetch(`${this.#baseUrl}/market-overview`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `${AiDigestControllerErrorMessage.API_REQUEST_FAILED}: ${response.status}`,
      );
    }

    const overview = getNormalizedMarketOverview(await response.json());

    if (!overview) {
      throw new Error(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    }

    return overview;
  }

  /**
   * Search for market insights by asset identifier.
   *
   * Accepts any identifier the API understands (CAIP-19 asset type, ticker
   * symbol, asset name, HyperLiquid perps market id, etc.) and forwards it
   * unchanged via the universal `asset` query parameter.
   *
   * Calls `GET ${baseUrl}/asset-summary?asset=<assetIdentifier>`.
   *
   * @param assetIdentifier - The asset identifier (e.g. `eip155:1/slip44:60`,
   *   `ETH`, `Bitcoin`, `xyz:TSLA`).
   * @returns The market insights report, or `null` if none exists (404).
   */
  async searchDigest(
    assetIdentifier: string,
  ): Promise<MarketInsightsReport | null> {
    const response = await fetch(
      `${this.#baseUrl}/asset-summary?asset=${encodeURIComponent(assetIdentifier)}`,
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `${AiDigestControllerErrorMessage.API_REQUEST_FAILED}: ${response.status}`,
      );
    }

    const report = getNormalizedMarketInsightsReport(await response.json());

    if (!report) {
      throw new Error(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    }

    return report;
  }
}
