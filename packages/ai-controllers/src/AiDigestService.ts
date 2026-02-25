import {
  array,
  is,
  optional,
  string,
  type as structType,
} from '@metamask/superstruct';
import type { CaipAssetType } from '@metamask/utils';

import { AiDigestControllerErrorMessage } from './ai-digest-constants';
import type { DigestService, MarketInsightsReport } from './ai-digest-types';

export type AiDigestServiceConfig = {
  baseUrl: string;
};

const MarketInsightsArticleStruct = structType({
  title: string(),
  url: string(),
  source: string(),
  date: string(),
});

const MarketInsightsTweetStruct = structType({
  contentSummary: string(),
  url: string(),
  author: string(),
  date: string(),
});

const MarketInsightsTrendStruct = structType({
  title: string(),
  description: string(),
  category: string(),
  impact: string(),
  articles: array(MarketInsightsArticleStruct),
  tweets: array(MarketInsightsTweetStruct),
});

const MarketInsightsSourceStruct = structType({
  name: string(),
  url: string(),
  type: string(),
});

const MarketInsightsReportStruct = structType({
  version: optional(string()),
  asset: string(),
  generatedAt: string(),
  headline: string(),
  summary: string(),
  trends: array(MarketInsightsTrendStruct),
  social: optional(array(MarketInsightsTweetStruct)),
  sources: array(MarketInsightsSourceStruct),
});

const MarketInsightsDigestEnvelopeStruct = structType({
  digest: MarketInsightsReportStruct,
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
