import { AbstractTokenSearchApiService } from './abstract-token-search-api-service';
import type {
  MoralisTokenResponseItem,
  SwappableTokenSearchParams,
  TokenSearchFormattedParams,
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

  async searchTokensFormatted(
    tokenSearchFormattedParams: TokenSearchFormattedParams,
  ): Promise<MoralisTokenResponseItem[]> {
    const url = new URL('/tokens-search/formatted', this.#baseUrl);
    url.searchParams.append('query', tokenSearchFormattedParams.query);

    if (
      tokenSearchFormattedParams?.chains &&
      tokenSearchFormattedParams.chains.length > 0
    ) {
      url.searchParams.append(
        'chains',
        tokenSearchFormattedParams.chains.join(),
      );
    }
    if (tokenSearchFormattedParams?.limit) {
      url.searchParams.append('limit', tokenSearchFormattedParams.limit);
    }

    if (tokenSearchFormattedParams?.swappable) {
      url.searchParams.append('swappable', 'true');
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
