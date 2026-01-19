import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import type { Country, TokensResponse, Provider, State } from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
} from './RampsService-method-action-types';
import type {
  RequestCache as RequestCacheType,
  RequestState,
  ExecuteRequestOptions,
  PendingRequest,
} from './RequestCache';
import {
  DEFAULT_REQUEST_CACHE_TTL,
  DEFAULT_REQUEST_CACHE_MAX_SIZE,
  createCacheKey,
  isCacheExpired,
  createLoadingState,
  createSuccessState,
  createErrorState,
} from './RequestCache';

// === GENERAL ===

/**
 * The name of the {@link RampsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'RampsController';

// === STATE ===

/**
 * Represents the user's selected region with full country and state objects.
 */
export type UserRegion = {
  /**
   * The country object for the selected region.
   */
  country: Country;
  /**
   * The state object if a state was selected, null if only country was selected.
   */
  state: State | null;
  /**
   * The region code string (e.g., "us-ut" or "fr") used for API calls.
   */
  regionCode: string;
};

/**
 * Describes the shape of the state object for {@link RampsController}.
 */
export type RampsControllerState = {
  /**
   * The user's selected region with full country and state objects.
   * Initially set via geolocation fetch, but can be manually changed by the user.
   * Once set (either via geolocation or manual selection), it will not be overwritten
   * by subsequent geolocation fetches.
   */
  userRegion: UserRegion | null;
  /**
   * The user's preferred provider.
   * Can be manually set by the user.
   */
  preferredProvider: Provider | null;
  /**
   * List of providers available for the current region.
   */
  providers: Provider[];
  /**
   * Tokens fetched for the current region and action.
   * Contains topTokens and allTokens arrays.
   */
  tokens: TokensResponse | null;
  /**
   * Cache of request states, keyed by cache key.
   * This stores loading, success, and error states for API requests.
   */
  requests: RequestCacheType;
};

/**
 * The metadata for each property in {@link RampsControllerState}.
 */
const rampsControllerMetadata = {
  userRegion: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  preferredProvider: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  providers: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  tokens: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  requests: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: false,
    usedInUi: true,
  },
} satisfies StateMetadata<RampsControllerState>;

/**
 * Constructs the default {@link RampsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link RampsController} state.
 */
export function getDefaultRampsControllerState(): RampsControllerState {
  return {
    userRegion: null,
    preferredProvider: null,
    providers: [],
    tokens: null,
    requests: {},
  };
}

// === MESSENGER ===

/**
 * Retrieves the state of the {@link RampsController}.
 */
export type RampsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  RampsControllerState
>;

/**
 * Actions that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerActions = RampsControllerGetStateAction;

/**
 * Actions from other messengers that {@link RampsController} calls.
 */
type AllowedActions =
  | RampsServiceGetGeolocationAction
  | RampsServiceGetCountriesAction
  | RampsServiceGetTokensAction
  | RampsServiceGetProvidersAction;

/**
 * Published when the state of {@link RampsController} changes.
 */
export type RampsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  RampsControllerState
>;

/**
 * Events that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerEvents = RampsControllerStateChangeEvent;

/**
 * Events from other messengers that {@link RampsController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link RampsController}.
 */
export type RampsControllerMessenger = Messenger<
  typeof controllerName,
  RampsControllerActions | AllowedActions,
  RampsControllerEvents | AllowedEvents
>;

/**
 * Configuration options for the RampsController.
 */
export type RampsControllerOptions = {
  /** The messenger suited for this controller. */
  messenger: RampsControllerMessenger;
  /** The desired state with which to initialize this controller. */
  state?: Partial<RampsControllerState>;
  /** Time to live for cached requests in milliseconds. Defaults to 15 minutes. */
  requestCacheTTL?: number;
  /** Maximum number of entries in the request cache. Defaults to 250. */
  requestCacheMaxSize?: number;
};

// === HELPER FUNCTIONS ===

/**
 * Finds a country and state from a region code string.
 *
 * @param regionCode - The region code (e.g., "us-ca" or "us").
 * @param countries - Array of countries to search.
 * @returns UserRegion object with country and state, or null if not found.
 */
function findRegionFromCode(
  regionCode: string,
  countries: Country[],
): UserRegion | null {
  const normalizedCode = regionCode.toLowerCase().trim();
  const parts = normalizedCode.split('-');
  const countryCode = parts[0];
  const stateCode = parts[1];

  const country = countries.find((countryItem) => {
    if (countryItem.isoCode?.toLowerCase() === countryCode) {
      return true;
    }
    if (countryItem.id) {
      const id = countryItem.id.toLowerCase();
      if (id.startsWith('/regions/')) {
        const extractedCode = id.replace('/regions/', '').split('/')[0];
        return extractedCode === countryCode;
      }
      return id === countryCode || id.endsWith(`/${countryCode}`);
    }
    return false;
  });

  if (!country) {
    return null;
  }

  let state: State | null = null;
  if (stateCode && country.states) {
    state =
      country.states.find((stateItem) => {
        if (stateItem.stateId?.toLowerCase() === stateCode) {
          return true;
        }
        if (stateItem.id) {
          const stateId = stateItem.id.toLowerCase();
          if (
            stateId.includes(`-${stateCode}`) ||
            stateId.endsWith(`/${stateCode}`)
          ) {
            return true;
          }
        }
        return false;
      }) ?? null;
  }

  return {
    country,
    state,
    regionCode: normalizedCode,
  };
}

// === CONTROLLER DEFINITION ===

/**
 * Manages cryptocurrency on/off ramps functionality.
 */
export class RampsController extends BaseController<
  typeof controllerName,
  RampsControllerState,
  RampsControllerMessenger
> {
  /**
   * Default TTL for cached requests.
   */
  readonly #requestCacheTTL: number;

  /**
   * Maximum number of entries in the request cache.
   */
  readonly #requestCacheMaxSize: number;

  /**
   * Map of pending requests for deduplication.
   * Key is the cache key, value is the pending request with abort controller.
   */
  readonly #pendingRequests: Map<string, PendingRequest> = new Map();

  /**
   * Constructs a new {@link RampsController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   * @param args.requestCacheTTL - Time to live for cached requests in milliseconds.
   * @param args.requestCacheMaxSize - Maximum number of entries in the request cache.
   */
  constructor({
    messenger,
    state = {},
    requestCacheTTL = DEFAULT_REQUEST_CACHE_TTL,
    requestCacheMaxSize = DEFAULT_REQUEST_CACHE_MAX_SIZE,
  }: RampsControllerOptions) {
    super({
      messenger,
      metadata: rampsControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultRampsControllerState(),
        ...state,
        // Always reset requests cache on initialization (non-persisted)
        requests: {},
      },
    });

    this.#requestCacheTTL = requestCacheTTL;
    this.#requestCacheMaxSize = requestCacheMaxSize;
  }

  /**
   * Executes a request with caching and deduplication.
   *
   * If a request with the same cache key is already in flight, returns the
   * existing promise. If valid cached data exists, returns it without making
   * a new request.
   *
   * @param cacheKey - Unique identifier for this request.
   * @param fetcher - Function that performs the actual fetch. Receives an AbortSignal.
   * @param options - Options for cache behavior.
   * @returns The result of the request.
   */
  async executeRequest<TResult>(
    cacheKey: string,
    fetcher: (signal: AbortSignal) => Promise<TResult>,
    options?: ExecuteRequestOptions,
  ): Promise<TResult> {
    const ttl = options?.ttl ?? this.#requestCacheTTL;

    // Check for existing pending request - join it instead of making a duplicate
    const pending = this.#pendingRequests.get(cacheKey);
    if (pending) {
      return pending.promise as Promise<TResult>;
    }

    // Check cache validity (unless force refresh)
    if (!options?.forceRefresh) {
      const cached = this.state.requests[cacheKey];
      if (cached && !isCacheExpired(cached, ttl)) {
        return cached.data as TResult;
      }
    }

    // Create abort controller for this request
    const abortController = new AbortController();
    const lastFetchedAt = Date.now();

    // Update state to loading
    this.#updateRequestState(cacheKey, createLoadingState());

    // Create the fetch promise
    const promise = (async (): Promise<TResult> => {
      try {
        const data = await fetcher(abortController.signal);

        // Don't update state if aborted
        if (abortController.signal.aborted) {
          throw new Error('Request was aborted');
        }

        this.#updateRequestState(
          cacheKey,
          createSuccessState(data as Json, lastFetchedAt),
        );
        return data;
      } catch (error) {
        // Don't update state if aborted
        if (abortController.signal.aborted) {
          throw error;
        }

        const errorMessage = (error as Error)?.message;

        this.#updateRequestState(
          cacheKey,
          createErrorState(errorMessage ?? 'Unknown error', lastFetchedAt),
        );
        throw error;
      } finally {
        // Only delete if this is still our entry (not replaced by a new request)
        const currentPending = this.#pendingRequests.get(cacheKey);
        if (currentPending?.abortController === abortController) {
          this.#pendingRequests.delete(cacheKey);
        }
      }
    })();

    // Store pending request for deduplication
    this.#pendingRequests.set(cacheKey, { promise, abortController });

    return promise;
  }

  /**
   * Aborts a pending request if one exists.
   *
   * @param cacheKey - The cache key of the request to abort.
   * @returns True if a request was aborted.
   */
  abortRequest(cacheKey: string): boolean {
    const pending = this.#pendingRequests.get(cacheKey);
    if (pending) {
      pending.abortController.abort();
      this.#pendingRequests.delete(cacheKey);
      this.#removeRequestState(cacheKey);
      return true;
    }
    return false;
  }

  /**
   * Removes a request state from the cache.
   *
   * @param cacheKey - The cache key to remove.
   */
  #removeRequestState(cacheKey: string): void {
    this.update((state) => {
      const requests = state.requests as unknown as Record<
        string,
        RequestState | undefined
      >;
      delete requests[cacheKey];
    });
  }

  /**
   * Gets the state of a specific cached request.
   *
   * @param cacheKey - The cache key to look up.
   * @returns The request state, or undefined if not cached.
   */
  getRequestState(cacheKey: string): RequestState | undefined {
    return this.state.requests[cacheKey];
  }

  /**
   * Updates the state for a specific request.
   *
   * @param cacheKey - The cache key.
   * @param requestState - The new state for the request.
   */
  #updateRequestState(cacheKey: string, requestState: RequestState): void {
    const maxSize = this.#requestCacheMaxSize;

    this.update((state) => {
      const requests = state.requests as unknown as Record<
        string,
        RequestState | undefined
      >;
      requests[cacheKey] = requestState;

      // Evict oldest entries if cache exceeds max size
      const keys = Object.keys(requests);

      if (keys.length > maxSize) {
        // Sort by timestamp (oldest first)
        const sortedKeys = keys.sort((a, b) => {
          const aTime = requests[a]?.timestamp ?? 0;
          const bTime = requests[b]?.timestamp ?? 0;
          return aTime - bTime;
        });

        // Remove oldest entries until we're under the limit
        const entriesToRemove = keys.length - maxSize;
        for (let i = 0; i < entriesToRemove; i++) {
          const keyToRemove = sortedKeys[i];
          if (keyToRemove) {
            delete requests[keyToRemove];
          }
        }
      }
    });
  }

  /**
   * Updates the user's region by fetching geolocation.
   * This method calls the RampsService to get the geolocation.
   *
   * @param options - Options for cache behavior.
   * @returns The user region object.
   */
  async updateUserRegion(
    options?: ExecuteRequestOptions,
  ): Promise<UserRegion | null> {
    // If a userRegion already exists and forceRefresh is not requested,
    // return it immediately without fetching geolocation.
    // This ensures that once a region is set (either via geolocation or manual selection),
    // it will not be overwritten by subsequent geolocation fetches.
    if (this.state.userRegion && !options?.forceRefresh) {
      return this.state.userRegion;
    }

    // When forceRefresh is true, clear the existing region, tokens, and providers before fetching
    if (options?.forceRefresh) {
      this.update((state) => {
        state.userRegion = null;
        state.tokens = null;
        state.providers = [];
      });
    }

    const cacheKey = createCacheKey('updateUserRegion', []);

    const regionCode = await this.executeRequest(
      cacheKey,
      async () => {
        const result = await this.messenger.call('RampsService:getGeolocation');
        return result;
      },
      options,
    );

    if (!regionCode) {
      this.update((state) => {
        state.userRegion = null;
        state.tokens = null;
        state.providers = [];
      });
      return null;
    }

    const normalizedRegion = regionCode.toLowerCase().trim();

    try {
      const countries = await this.getCountries('buy', options);
      const userRegion = findRegionFromCode(normalizedRegion, countries);

      if (userRegion) {
        this.update((state) => {
          const regionChanged =
            state.userRegion?.regionCode !== userRegion.regionCode;
          state.userRegion = userRegion;
          // Clear tokens and providers when region changes
          if (regionChanged) {
            state.tokens = null;
            state.providers = [];
          }
        });

        // Fetch providers for the new region
        if (userRegion.regionCode) {
          try {
            await this.getProviders(userRegion.regionCode, options);
          } catch {
            // Provider fetch failed - error state will be available via selectors
          }
        }

        return userRegion;
      }

      // Region not found in countries data
      this.update((state) => {
        state.userRegion = null;
        state.tokens = null;
        state.providers = [];
      });

      return null;
    } catch {
      // If countries fetch fails, we can't create a valid UserRegion
      // Return null to indicate we don't have valid country data
      this.update((state) => {
        state.userRegion = null;
        state.tokens = null;
        state.providers = [];
      });

      return null;
    }
  }

  /**
   * Sets the user's region manually (without fetching geolocation).
   * This allows users to override the detected region.
   *
   * @param region - The region code to set (e.g., "US-CA").
   * @param options - Options for cache behavior.
   * @returns The user region object.
   */
  async setUserRegion(
    region: string,
    options?: ExecuteRequestOptions,
  ): Promise<UserRegion> {
    const normalizedRegion = region.toLowerCase().trim();

    try {
      const countries = await this.getCountries('buy', options);
      const userRegion = findRegionFromCode(normalizedRegion, countries);

      if (userRegion) {
        this.update((state) => {
          state.userRegion = userRegion;
          state.tokens = null;
          state.providers = [];
        });

        // Fetch providers for the new region
        try {
          await this.getProviders(userRegion.regionCode, options);
        } catch {
          // Provider fetch failed - error state will be available via selectors
        }

        return userRegion;
      }

      // Region not found in countries data
      this.update((state) => {
        state.userRegion = null;
        state.tokens = null;
        state.providers = [];
      });
      throw new Error(
        `Region "${normalizedRegion}" not found in countries data. Cannot set user region without valid country information.`,
      );
    } catch (error) {
      // If the error is "not found", re-throw it
      // Otherwise, it's from countries fetch failure
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      // Countries fetch failed
      this.update((state) => {
        state.userRegion = null;
        state.tokens = null;
        state.providers = [];
      });
      throw new Error(
        'Failed to fetch countries data. Cannot set user region without valid country information.',
      );
    }
  }

  /**
   * Sets the user's preferred provider.
   * This allows users to set their preferred ramp provider.
   *
   * @param provider - The provider object to set.
   */
  setPreferredProvider(provider: Provider | null): void {
    this.update((state) => {
      state.preferredProvider = provider;
    });
  }

  /**
   * Initializes the controller by fetching the user's region from geolocation.
   * This should be called once at app startup to set up the initial region.
   * After the region is set, tokens and providers are fetched and saved to state.
   *
   * If a userRegion already exists (from persistence or manual selection),
   * this method will skip geolocation fetch and only fetch tokens if needed.
   *
   * @param options - Options for cache behavior.
   * @returns Promise that resolves when initialization is complete.
   */
  async init(options?: ExecuteRequestOptions): Promise<void> {
    const userRegion = await this.updateUserRegion(options).catch(() => {
      // User region fetch failed - error state will be available via selectors
      return null;
    });

    if (userRegion) {
      try {
        await this.getTokens(userRegion.regionCode, 'buy', options);
      } catch {
        // Token fetch failed - error state will be available via selectors
      }

      try {
        await this.getProviders(userRegion.regionCode, options);
      } catch {
        // Provider fetch failed - error state will be available via selectors
      }
    }
  }

  /**
   * Fetches the list of supported countries for a given ramp action.
   *
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Options for cache behavior.
   * @returns An array of countries.
   */
  async getCountries(
    action: 'buy' | 'sell' = 'buy',
    options?: ExecuteRequestOptions,
  ): Promise<Country[]> {
    const cacheKey = createCacheKey('getCountries', [action]);

    return this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getCountries', action);
      },
      options,
    );
  }

  /**
   * Fetches the list of available tokens for a given region and action.
   * The tokens are saved in the controller state once fetched.
   *
   * @param region - The region code (e.g., "us", "fr", "us-ny"). If not provided, uses the user's region from controller state.
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Options for cache behavior.
   * @returns The tokens response containing topTokens and allTokens.
   */
  async getTokens(
    region?: string,
    action: 'buy' | 'sell' = 'buy',
    options?: ExecuteRequestOptions,
  ): Promise<TokensResponse> {
    const regionToUse = region ?? this.state.userRegion?.regionCode;

    if (!regionToUse) {
      throw new Error(
        'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
      );
    }

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const cacheKey = createCacheKey('getTokens', [normalizedRegion, action]);

    const tokens = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call(
          'RampsService:getTokens',
          normalizedRegion,
          action,
        );
      },
      options,
    );

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.tokens = tokens;
      }
    });

    return tokens;
  }

  /**
   * Fetches the list of providers for a given region.
   * The providers are saved in the controller state once fetched.
   *
   * @param region - The region code (e.g., "us", "fr", "us-ny"). If not provided, uses the user's region from controller state.
   * @param options - Options for cache behavior and query filters.
   * @param options.provider - Provider ID(s) to filter by.
   * @param options.crypto - Crypto currency ID(s) to filter by.
   * @param options.fiat - Fiat currency ID(s) to filter by.
   * @param options.payments - Payment method ID(s) to filter by.
   * @returns The providers response containing providers array.
   */
  async getProviders(
    region?: string,
    options?: ExecuteRequestOptions & {
      provider?: string | string[];
      crypto?: string | string[];
      fiat?: string | string[];
      payments?: string | string[];
    },
  ): Promise<{ providers: Provider[] }> {
    const regionToUse = region ?? this.state.userRegion?.regionCode;

    if (!regionToUse) {
      throw new Error(
        'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
      );
    }

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const cacheKey = createCacheKey('getProviders', [
      normalizedRegion,
      options?.provider,
      options?.crypto,
      options?.fiat,
      options?.payments,
    ]);

    const { providers } = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call(
          'RampsService:getProviders',
          normalizedRegion,
          {
            provider: options?.provider,
            crypto: options?.crypto,
            fiat: options?.fiat,
            payments: options?.payments,
          },
        );
      },
      options,
    );

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.providers = providers;
      }
    });

    return { providers };
  }

  // ============================================================
  // Sync Trigger Methods
  // These fire-and-forget methods are for use in React effects.
  // Errors are stored in state and available via selectors.
  // ============================================================

  /**
   * Triggers a user region update without throwing.
   *
   * @param options - Options for cache behavior.
   */
  triggerUpdateUserRegion(options?: ExecuteRequestOptions): void {
    this.updateUserRegion(options).catch(() => {
      // Error stored in state
    });
  }

  /**
   * Triggers setting the user region without throwing.
   *
   * @param region - The region code to set (e.g., "US-CA").
   * @param options - Options for cache behavior.
   */
  triggerSetUserRegion(region: string, options?: ExecuteRequestOptions): void {
    this.setUserRegion(region, options).catch(() => {
      // Error stored in state
    });
  }

  /**
   * Triggers fetching countries without throwing.
   *
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Options for cache behavior.
   */
  triggerGetCountries(
    action: 'buy' | 'sell' = 'buy',
    options?: ExecuteRequestOptions,
  ): void {
    this.getCountries(action, options).catch(() => {
      // Error stored in state
    });
  }

  /**
   * Triggers fetching tokens without throwing.
   *
   * @param region - The region code. If not provided, uses userRegion from state.
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Options for cache behavior.
   */
  triggerGetTokens(
    region?: string,
    action: 'buy' | 'sell' = 'buy',
    options?: ExecuteRequestOptions,
  ): void {
    this.getTokens(region, action, options).catch(() => {
      // Error stored in state
    });
  }

  /**
   * Triggers fetching providers without throwing.
   *
   * @param region - The region code. If not provided, uses userRegion from state.
   * @param options - Options for cache behavior and query filters.
   */
  triggerGetProviders(
    region?: string,
    options?: ExecuteRequestOptions & {
      provider?: string | string[];
      crypto?: string | string[];
      fiat?: string | string[];
      payments?: string | string[];
    },
  ): void {
    this.getProviders(region, options).catch(() => {
      // Error stored in state
    });
  }
}
