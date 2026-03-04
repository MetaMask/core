import {
  array,
  enums,
  is,
  optional,
  string,
  type as structType,
} from '@metamask/superstruct';
import type { CaipAssetType } from '@metamask/utils';

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

const MarketOverviewTrendStruct = structType({
  title: string(),
  description: string(),
  category: enums(trendCategoryValues),
  impact: enums(trendImpactValues),
  articles: array(ArticleStruct),
  relatedAssets: array(string()),
});

const MarketOverviewStruct = structType({
  version: optional(string()),
  generatedAt: string(),
  headline: string(),
  summary: string(),
  trends: array(MarketOverviewTrendStruct),
  sources: array(SourceStruct),
  metadata: optional(array(AIResponseMetadataStruct)),
});

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
   * Calls `GET ${this.#baseUrl}/api/v1/market-overview`.
   *
   * @returns The market overview report, or `null` if none exists (404).
   */
  async fetchMarketOverview(): Promise<MarketOverview | null> {
    const response = await fetch(`${this.#baseUrl}/api/v1/market-overview`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `${AiDigestControllerErrorMessage.API_REQUEST_FAILED}: ${response.status}`,
      );
    }

    const body: unknown = await response.json();

    if (!is(body, MarketOverviewStruct)) {
      throw new Error(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    }

    return body;
  }

  /**
   * Search for market insights by CAIP-19 asset identifier.
   *
   * Calls `GET ${this.#baseUrl}/digests?caipAssetType=${encodeURIComponent(caip19Id)}`.
   *
   * @param caip19Id - The CAIP-19 identifier of the asset.
   * @returns The market insights report, or `null` if none exists (404).
   */
  async searchDigest(
    caip19Id: CaipAssetType,
  ): Promise<MarketInsightsReport | null> {
    const response = await fetch(
      `${this.#baseUrl}/digests?caipAssetType=${encodeURIComponent(caip19Id)}`,
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
