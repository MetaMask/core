import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import type { Country, Eligibility, TokensResponse } from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetEligibilityAction,
  RampsServiceGetTokensAction,
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
 * Describes the shape of the state object for {@link RampsController}.
 */
export type RampsControllerState = {
  /**
   * The user's selected region code (e.g., "US-CA").
   * Initially set via geolocation fetch, but can be manually changed by the user.
   */
  userRegion: string | null;
  /**
   * Eligibility information for the user's current region.
   */
  eligibility: Eligibility | null;
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
  eligibility: {
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
    eligibility: null,
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
  | RampsServiceGetEligibilityAction
  | RampsServiceGetTokensAction;

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
   * Updates the user's region by fetching geolocation and eligibility.
   * This method calls the RampsService to get the geolocation,
   * then automatically fetches eligibility for that region.
   *
   * @param options - Options for cache behavior.
   * @returns The user region string.
   */
  async updateUserRegion(options?: ExecuteRequestOptions): Promise<string> {
    const cacheKey = createCacheKey('updateUserRegion', []);

    const userRegion = await this.executeRequest(
      cacheKey,
      async () => {
        const result = await this.messenger.call('RampsService:getGeolocation');
        return result;
      },
      options,
    );

    const normalizedRegion = userRegion
      ? userRegion.toLowerCase().trim()
      : userRegion;

    this.update((state) => {
      state.userRegion = normalizedRegion;
    });

    if (normalizedRegion) {
      try {
        await this.updateEligibility(normalizedRegion, options);
      } catch {
        this.update((state) => {
          const currentUserRegion = state.userRegion?.toLowerCase().trim();
          if (currentUserRegion === normalizedRegion) {
            state.eligibility = null;
          }
        });
      }
    }

    return normalizedRegion;
  }

  /**
   * Sets the user's region manually (without fetching geolocation).
   * This allows users to override the detected region.
   *
   * @param region - The region code to set (e.g., "US-CA").
   * @param options - Options for cache behavior when fetching eligibility.
   * @returns The eligibility information for the region.
   */
  async setUserRegion(
    region: string,
    options?: ExecuteRequestOptions,
  ): Promise<Eligibility> {
    const normalizedRegion = region.toLowerCase().trim();

    this.update((state) => {
      state.userRegion = normalizedRegion;
    });

    try {
      return await this.updateEligibility(normalizedRegion, options);
    } catch (error) {
      // Eligibility fetch failed, but user region was successfully set.
      // Don't let eligibility errors prevent user region state from being updated.
      // Clear eligibility state to avoid showing stale data from a previous location.
      // Only clear if the region still matches to avoid race conditions where a newer
      // region change has already succeeded.
      this.update((state) => {
        const currentUserRegion = state.userRegion?.toLowerCase().trim();
        if (currentUserRegion === normalizedRegion) {
          state.eligibility = null;
        }
      });
      throw error;
    }
  }

  /**
   * Initializes the controller by fetching the user's region from geolocation.
   * This should be called once at app startup to set up the initial region.
   *
   * @param options - Options for cache behavior.
   * @returns Promise that resolves when initialization is complete.
   */
  async init(options?: ExecuteRequestOptions): Promise<void> {
    await this.updateUserRegion(options).catch(() => {
      // User region fetch failed - error state will be available via selectors
    });
  }

  /**
   * Updates the eligibility information for a given region.
   *
   * @param isoCode - The ISO code for the region (e.g., "us", "fr", "us-ny").
   * @param options - Options for cache behavior.
   * @returns The eligibility information.
   */
  async updateEligibility(
    isoCode: string,
    options?: ExecuteRequestOptions,
  ): Promise<Eligibility> {
    const normalizedIsoCode = isoCode.toLowerCase().trim();
    const cacheKey = createCacheKey('updateEligibility', [normalizedIsoCode]);

    const eligibility = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call(
          'RampsService:getEligibility',
          normalizedIsoCode,
        );
      },
      options,
    );

    this.update((state) => {
      const userRegion = state.userRegion?.toLowerCase().trim();

      if (userRegion === undefined || userRegion === normalizedIsoCode) {
        state.eligibility = eligibility;
      }
    });

    return eligibility;
  }

  /**
   * Fetches the list of supported countries for a given ramp action.
   *
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Options for cache behavior.
   * @returns An array of countries with their eligibility information.
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
   * @param action - The ramp action type ('buy' or 'deposit').
   * @param options - Options for cache behavior.
   * @returns The tokens response containing topTokens and allTokens.
   */
  async getTokens(
    region?: string,
    action: 'buy' | 'deposit' = 'buy',
    options?: ExecuteRequestOptions,
  ): Promise<TokensResponse> {
    const regionToUse = region ?? this.state.userRegion;

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
      state.tokens = tokens;
    });

    return tokens;
  }
}
