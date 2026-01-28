import { AiDigestControllerErrorMessage } from './ai-digest-constants';
import type { DigestService, DigestData } from './ai-digest-types';

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
      `${this.#baseUrl}/digests/assets/${assetId}/latest`,
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
}
