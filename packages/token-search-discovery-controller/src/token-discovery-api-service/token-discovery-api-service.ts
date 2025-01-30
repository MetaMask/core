import { AbstractTokenDiscoveryApiService } from './abstract-token-discovery-api-service';
import type { TokenTrendingResponseItem, TrendingTokensParams } from '../types';

export class TokenDiscoveryApiService extends AbstractTokenDiscoveryApiService {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    super();
    if (!baseUrl) {
      throw new Error('Portfolio API URL is not set');
    }
    this.#baseUrl = baseUrl;
  }

  async getTrendingTokensByChains(
    trendingTokensParams: TrendingTokensParams,
  ): Promise<TokenTrendingResponseItem[]> {
    const url = new URL('/tokens-search/trending-by-chains', this.#baseUrl);

    if (trendingTokensParams.chains && trendingTokensParams.chains.length > 0) {
      url.searchParams.append('chains', trendingTokensParams.chains.join());
    }
    if (trendingTokensParams.limit) {
      url.searchParams.append('limit', trendingTokensParams.limit);
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
