import { AiDigestControllerErrorMessage } from './ai-digest-constants';
import type { IAiDigestService, DigestData } from './ai-digest-types';

export type AiDigestServiceConfig = {
  baseUrl: string;
};

type ApiResponse = {
  success: boolean;
  data?: DigestData;
  error?: { message?: string };
};

export class AiDigestService implements IAiDigestService {
  readonly #baseUrl: string;

  constructor(config: AiDigestServiceConfig) {
    this.#baseUrl = config.baseUrl;
  }

  async fetchDigest(coingeckoSlug: string): Promise<DigestData> {
    const response = await fetch(`${this.#baseUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: coingeckoSlug,
        provider: 'litellm',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `${AiDigestControllerErrorMessage.API_REQUEST_FAILED}: ${response.status}`,
      );
    }

    const data: ApiResponse = await response.json();

    if (!data.success || data.data === undefined) {
      throw new Error(
        data.error?.message ?? AiDigestControllerErrorMessage.API_RETURNED_ERROR,
      );
    }

    return data.data;
  }
}
