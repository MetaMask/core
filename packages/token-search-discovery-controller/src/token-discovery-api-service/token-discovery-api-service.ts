import { AbstractTokenDiscoveryApiService } from './abstract-token-discovery-api-service';
import type {
  MoralisTokenResponseItem,
  TopGainersParams,
  TopLosersParams,
  TrendingTokensParams,
  BlueChipParams,
} from '../types';

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
    trendingTokensParams?: TrendingTokensParams,
  ): Promise<MoralisTokenResponseItem[]> {
    const url = new URL('/tokens-search/trending-by-chains', this.#baseUrl);

    if (
      trendingTokensParams?.chains &&
      trendingTokensParams.chains.length > 0
    ) {
      url.searchParams.append('chains', trendingTokensParams.chains.join());
    }
    if (trendingTokensParams?.limit) {
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

  async getTopLosersByChains(
    topLosersParams?: TopLosersParams,
  ): Promise<MoralisTokenResponseItem[]> {
    const url = new URL('/tokens-search/top-losers-by-chains', this.#baseUrl);

    if (topLosersParams?.chains && topLosersParams.chains.length > 0) {
      url.searchParams.append('chains', topLosersParams.chains.join());
    }
    if (topLosersParams?.limit) {
      url.searchParams.append('limit', topLosersParams.limit);
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

  async getTopGainersByChains(
    topGainersParams?: TopGainersParams,
  ): Promise<MoralisTokenResponseItem[]> {
    const url = new URL('/tokens-search/top-gainers-by-chains', this.#baseUrl);

    if (topGainersParams?.chains && topGainersParams.chains.length > 0) {
      url.searchParams.append('chains', topGainersParams.chains.join());
    }
    if (topGainersParams?.limit) {
      url.searchParams.append('limit', topGainersParams.limit);
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

  async getBlueChipTokensByChains(
    blueChipParams?: BlueChipParams,
  ): Promise<MoralisTokenResponseItem[]> {
    const url = new URL('/tokens-search/blue-chip', this.#baseUrl);

    if (blueChipParams?.chains && blueChipParams.chains.length > 0) {
      url.searchParams.append('chains', blueChipParams.chains.join());
    }
    if (blueChipParams?.limit) {
      url.searchParams.append('limit', blueChipParams.limit);
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
