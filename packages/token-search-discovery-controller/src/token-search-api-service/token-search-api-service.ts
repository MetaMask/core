import { AbstractTokenSearchApiService } from './abstract-token-search-api-service';
import type { TokenSearchParams, TokenSearchResponseItem } from '../types';

export class TokenSearchApiService extends AbstractTokenSearchApiService {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    super();
    if (!baseUrl) {
      throw new Error('Portfolio API URL is not set');
    }
    this.#baseUrl = baseUrl;
  }

  async searchTokens(
    tokenSearchParams?: TokenSearchParams,
  ): Promise<TokenSearchResponseItem[]> {
    const url = new URL('/tokens-search/name', this.#baseUrl);

    if (tokenSearchParams?.chains && tokenSearchParams.chains.length > 0) {
      url.searchParams.append('chains', tokenSearchParams.chains.join());
    }
    if (tokenSearchParams?.name) {
      url.searchParams.append('name', tokenSearchParams.name);
    }
    if (tokenSearchParams?.limit) {
      url.searchParams.append('limit', tokenSearchParams.limit);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Portfolio API request failed with status: ${response.status}`,
      );
    }

    return response.json();
  }
}
