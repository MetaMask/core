import { AbstractTokenDiscoveryApiService } from './abstract-token-discovery-api-service';
import type { TokenTrendingResponseItem } from '../types';

export class TokenDiscoveryApiService extends AbstractTokenDiscoveryApiService {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    super();
    if (!baseUrl) {
      throw new Error('Portfolio API URL is not set');
    }
    this.#baseUrl = baseUrl;
  }

  async getTrendingTokensByChains(params: {
    chains?: string[];
    limit?: string;
  }): Promise<TokenTrendingResponseItem[]> {
    const url = new URL('/tokens-search/trending-by-chains', this.#baseUrl);

    if (params.chains && params.chains.length > 0) {
      url.searchParams.append('chains', params.chains.join());
    }
    if (params.limit) {
      url.searchParams.append('limit', params.limit);
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
