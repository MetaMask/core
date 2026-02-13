import { AiDigestControllerErrorMessage } from './ai-digest-constants';
import type {
  DigestService,
  DigestData,
  MarketInsightsReport,
} from './ai-digest-types';
import { getMockMarketInsights } from './market-insights-mock';

export type AiDigestServiceConfig = {
  baseUrl: string;
};

export class AiDigestService implements DigestService {
  readonly #baseUrl: string;

  constructor(config: AiDigestServiceConfig) {
    this.#baseUrl = config.baseUrl;
  }

  async fetchDigest(assetId: string): Promise<DigestData> {
    const response = await fetch(
      `${this.#baseUrl}/digests/assets/${encodeURIComponent(assetId)}/latest`,
    );

    if (!response.ok) {
      throw new Error(
        `${AiDigestControllerErrorMessage.API_REQUEST_FAILED}: ${response.status}`,
      );
    }

    const data: DigestData = await response.json();

    if (!data.success) {
      throw new Error(
        data.error ?? AiDigestControllerErrorMessage.API_RETURNED_ERROR,
      );
    }

    return data;
  }

  /**
   * Search for market insights by CAIP-19 asset identifier.
   *
   * TODO: Replace mock with real API call when live:
   * `GET ${this.#baseUrl}/digests/search?caip19Ids=${encodeURIComponent(caip19Id)}`
   *
   * @param caip19Id - The CAIP-19 identifier of the asset.
   * @returns The market insights report, or `null` if none exists (404).
   */
  async searchDigests(caip19Id: string): Promise<MarketInsightsReport | null> {
    // TODO: Replace with real API call when endpoint is live:
    //
    // const response = await fetch(
    //   `${this.#baseUrl}/digests/search?caip19Ids=${encodeURIComponent(caip19Id)}`,
    // );
    //
    // if (response.status === 404) {
    //   return null;
    // }
    //
    // if (!response.ok) {
    //   throw new Error(
    //     `${AiDigestControllerErrorMessage.API_REQUEST_FAILED}: ${response.status}`,
    //   );
    // }
    //
    // const data: MarketInsightsReport = await response.json();
    // return data;

    // Mock implementation until API is live
    return getMockMarketInsights(caip19Id);
  }
}
