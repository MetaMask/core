import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TokenSearchResponseItem } from './types';

// === GENERAL ===

const controllerName = 'TokenSearchDiscoveryController';

// === STATE ===

export type TokenSearchDiscoveryControllerState = {
  recentSearches: TokenSearchResponseItem[];
  lastSearchTimestamp: number | null;
};

const tokenSearchDiscoveryControllerMetadata = {
  recentSearches: { persist: true, anonymous: false },
  lastSearchTimestamp: { persist: true, anonymous: false },
} as const;

// === MESSENGER ===

/**
 * The action which can be used to retrieve the state of the
 * {@link TokenSearchDiscoveryController}.
 */
export type TokenSearchDiscoveryControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    TokenSearchDiscoveryControllerState
  >;

/**
 * All actions that {@link TokenSearchDiscoveryController} registers, to be
 * called externally.
 */
export type TokenSearchDiscoveryControllerActions =
  TokenSearchDiscoveryControllerGetStateAction;

/**
 * All actions that {@link TokenSearchDiscoveryController} calls internally.
 */
type AllowedActions = never;

/**
 * The event that {@link TokenSearchDiscoveryController} publishes when updating
 * state.
 */
export type TokenSearchDiscoveryControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    TokenSearchDiscoveryControllerState
  >;

/**
 * All events that {@link TokenSearchDiscoveryController} publishes, to be
 * subscribed to externally.
 */
export type TokenSearchDiscoveryControllerEvents =
  TokenSearchDiscoveryControllerStateChangeEvent;

/**
 * All events that {@link TokenSearchDiscoveryController} subscribes to internally.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link TokenSearchDiscoveryController}.
 */
export type TokenSearchDiscoveryControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    TokenSearchDiscoveryControllerActions | AllowedActions,
    TokenSearchDiscoveryControllerEvents | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

/**
 * Constructs the default {@link TokenSearchDiscoveryController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link TokenSearchDiscoveryController} state.
 */
export function getDefaultTokenSearchDiscoveryControllerState(): TokenSearchDiscoveryControllerState {
  return {
    recentSearches: [],
    lastSearchTimestamp: null,
  };
}

/**
 * The TokenSearchDiscoveryController manages the retrieval of token search results and token discovery.
 * It fetches token search results from the portfolio API.
 */
export class TokenSearchDiscoveryController extends BaseController<
  typeof controllerName,
  TokenSearchDiscoveryControllerState,
  TokenSearchDiscoveryControllerMessenger
> {
  readonly #baseUrl: string;

  constructor({
    portfolioApiUrl,
    state = {},
    messenger,
  }: {
    portfolioApiUrl: string;
    state?: Partial<TokenSearchDiscoveryControllerState>;
    messenger: TokenSearchDiscoveryControllerMessenger;
  }) {
    super({
      name: controllerName,
      metadata: tokenSearchDiscoveryControllerMetadata,
      messenger,
      state: { ...getDefaultTokenSearchDiscoveryControllerState(), ...state },
    });

    if (!portfolioApiUrl) {
      throw new Error('Portfolio API URL is not set');
    }
    this.#baseUrl = portfolioApiUrl;
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
    const url = `${this.#baseUrl}/${endpoint}`;
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
