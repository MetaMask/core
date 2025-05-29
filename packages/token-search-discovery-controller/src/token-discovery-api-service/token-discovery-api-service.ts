import { AbstractTokenDiscoveryApiService } from './abstract-token-discovery-api-service';
import type {
  MoralisTokenResponseItem,
  TopGainersParams,
  TopLosersParams,
  TrendingTokensParams,
  BlueChipParams,
  ParamsBase,
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

  async #fetch(subPath: string, params?: ParamsBase) {
    const url = new URL(`/tokens-search/${subPath}`, this.#baseUrl);

    if (params?.chains && params.chains.length > 0) {
      url.searchParams.append('chains', params.chains.join());
    }

    if (params?.limit) {
      url.searchParams.append('limit', params.limit);
    }

    if (params?.swappable) {
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

  async getTrendingTokensByChains(
    trendingTokensParams?: TrendingTokensParams,
  ): Promise<MoralisTokenResponseItem[]> {
    return this.#fetch('trending', trendingTokensParams);
  }

  async getTopLosersByChains(
    topLosersParams?: TopLosersParams,
  ): Promise<MoralisTokenResponseItem[]> {
    return this.#fetch('top-losers', topLosersParams);
  }

  async getTopGainersByChains(
    topGainersParams?: TopGainersParams,
  ): Promise<MoralisTokenResponseItem[]> {
    return this.#fetch('top-gainers', topGainersParams);
  }

  async getBlueChipTokensByChains(
    blueChipParams?: BlueChipParams,
  ): Promise<MoralisTokenResponseItem[]> {
    return this.#fetch('blue-chip', blueChipParams);
  }
}
