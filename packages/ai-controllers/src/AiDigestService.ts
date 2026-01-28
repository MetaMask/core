import { AiDigestControllerErrorMessage } from './ai-digest-constants';
import type { DigestService, DigestData } from './ai-digest-types';

export type DigestProvider = 'claude' | 'xai';

export type AiDigestServiceConfig = {
  baseUrl: string;
  provider: DigestProvider;
};

type ApiResponse = {
  success: boolean;
  data?: DigestData;
  error?: { message?: string };
};

export class AiDigestService implements DigestService {
  readonly #baseUrl: string;

  readonly #provider: DigestProvider;

  constructor(config: AiDigestServiceConfig) {
    this.#baseUrl = config.baseUrl;
    this.#provider = config.provider;
  }

  async fetchDigest(coingeckoSlug: string): Promise<DigestData> {
    const response = await fetch(`${this.#baseUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: coingeckoSlug,
        provider: this.#provider,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `${AiDigestControllerErrorMessage.API_REQUEST_FAILED}: ${response.status}`,
      );
    }

    const data: ApiResponse = await response.json();

    if (!data.success || data.data === undefined || data.data === null) {
      throw new Error(
        data.error?.message ??
          AiDigestControllerErrorMessage.API_RETURNED_ERROR,
      );
    }

    return data.data;
  }
}
