import { AbstractTokenSearchApiService } from './abstract-token-search-api-service';
import type {
  SwappableTokenSearchParams,
  TokenSearchParams,
  TokenSearchResponseItem,
} from '../types';

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
    const url = new URL('/tokens-search', this.#baseUrl);

    if (tokenSearchParams?.chains && tokenSearchParams.chains.length > 0) {
      url.searchParams.append('chains', tokenSearchParams.chains.join());
    }
    if (tokenSearchParams?.query) {
      url.searchParams.append('query', tokenSearchParams.query);
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

  async searchSwappableTokens(
    swappableTokenSearchParams: SwappableTokenSearchParams,
  ): Promise<TokenSearchResponseItem[]> {
    const url = new URL('/tokens-search/swappable', this.#baseUrl);
    url.searchParams.append('query', swappableTokenSearchParams.query);

    if (swappableTokenSearchParams?.limit) {
      url.searchParams.append('limit', swappableTokenSearchParams.limit);
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
