import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TokenSearchResponseItem } from './types';

export const TOKENSEARCH_EVENTS = {
  SEARCH_COMPLETED: 'SEARCH_COMPLETED',
} as const;

const name = 'TokenSearchDiscoveryController';

type Events = {
  type: (typeof TOKENSEARCH_EVENTS)[keyof typeof TOKENSEARCH_EVENTS];
  payload: [TokenSearchResponseItem[]];
};

export type TokenSearchDiscoveryControllerMessenger =
  RestrictedControllerMessenger<
    typeof name,
    never,
    Events,
    never,
    (typeof TOKENSEARCH_EVENTS)[keyof typeof TOKENSEARCH_EVENTS]
  >;

export type TokenSearchDiscoveryState = {
  recentSearches: TokenSearchResponseItem[];
  lastSearchTimestamp: number | null;
};

const defaultState: TokenSearchDiscoveryState = {
  recentSearches: [],
  lastSearchTimestamp: null,
};

export class TokenSearchDiscoveryController extends BaseController<
  typeof name,
  TokenSearchDiscoveryState,
  TokenSearchDiscoveryControllerMessenger
> {
  private readonly baseUrl: string;

  constructor({
    portfolioApiUrl,
    initialState,
    messenger,
  }: {
    portfolioApiUrl: string;
    initialState?: TokenSearchDiscoveryState;
    messenger: TokenSearchDiscoveryControllerMessenger;
  }) {
    super({
      name,
      metadata: {
        recentSearches: { persist: true, anonymous: false },
        lastSearchTimestamp: { persist: true, anonymous: false },
      },
      messenger,
      state: { ...defaultState, ...initialState },
    });

    if (!portfolioApiUrl) {
      throw new Error('Portfolio API URL is not set');
    }
    this.baseUrl = portfolioApiUrl;
  }

  async searchTokens(
    chains: string[] = [],
    name?: string,
    limit?: string,
  ): Promise<TokenSearchResponseItem[]> {
    const queryParams = new URLSearchParams();

    if (chains.length > 0) {
      queryParams.append('chains', chains.join());
    }
    if (name) {
      queryParams.append('name', name);
    }
    if (limit) {
      queryParams.append('limit', limit);
    }

    const endpoint = `tokens-search/name?${queryParams.toString()}`;
    const results = await this.request<TokenSearchResponseItem[]>(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.update((state) => {
      state.recentSearches = results;
      state.lastSearchTimestamp = Date.now();
    });

    return results;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(
        `Portfolio API request failed with status: ${response.status}`,
      );
    }

    return response.json();
  }

  clearRecentSearches(): void {
    this.update((state) => {
      state.recentSearches = [];
      state.lastSearchTimestamp = null;
    });
  }
}
