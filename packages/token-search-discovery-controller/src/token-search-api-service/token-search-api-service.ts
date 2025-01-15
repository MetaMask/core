import { AbstractTokenSearchApiService } from './abstract-token-search-api-service';
import type { TokenSearchParams, TokenSearchResponseItem } from '../types';

export class TokenSearchApiService extends AbstractTokenSearchApiService {
  constructor(private readonly baseUrl: string) {
    super();
    if (!baseUrl) {
      throw new Error('Portfolio API URL is not set');
    }
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

    const response = await fetch(
      `${this.baseUrl}/tokens-search/name?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Portfolio API request failed with status: ${response.status}`,
      );
    }

    return response.json();
  }
}
