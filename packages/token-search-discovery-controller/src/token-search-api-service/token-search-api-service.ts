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
    const queryParams = new URLSearchParams();

    if (tokenSearchParams?.chains && tokenSearchParams.chains.length > 0) {
      queryParams.append('chains', tokenSearchParams.chains.join());
    }
    if (tokenSearchParams?.name) {
      queryParams.append('name', tokenSearchParams.name);
    }
    if (tokenSearchParams?.limit) {
      queryParams.append('limit', tokenSearchParams.limit);
    }

    const queryString = queryParams.toString();
    const url = `${this.#baseUrl}/tokens-search/name${queryString ? `?${queryString}` : ''}`;

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
