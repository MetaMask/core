import type { CaipAssetType } from '@metamask/utils';

import { AiDigestControllerErrorMessage } from './ai-digest-constants';
import type { DigestService, MarketInsightsReport } from './ai-digest-types';

export type AiDigestServiceConfig = {
  baseUrl: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMarketInsightsReport = (
  value: unknown,
): value is MarketInsightsReport => {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.version === 'string' &&
    typeof value.asset === 'string' &&
    typeof value.generatedAt === 'string' &&
    typeof value.headline === 'string' &&
    typeof value.summary === 'string' &&
    Array.isArray(value.trends) &&
    Array.isArray(value.sources)
  );
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

    const json = await response.json();

    if (!isMarketInsightsReport(json)) {
      throw new Error(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    }

    return json;
  }
}
