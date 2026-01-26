import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import type {
  Country,
  TokensResponse,
  Provider,
  State,
  RampAction,
  PaymentMethod,
  PaymentMethodsResponse,
  RampsToken,
} from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
  RampsServiceGetPaymentMethodsAction,
} from './RampsService-method-action-types';
import type {
  RequestCache as RequestCacheType,
  RequestState,
  CacheOptions,
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
  RequestStatus,
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
   * List of countries available for ramp actions.
   */
  countries: Country[];
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
   * Payment methods available for the current context.
   * Filtered by region, fiat, asset, and provider.
   */
  paymentMethods: PaymentMethod[];
  /**
   * The user's selected payment method.
   * Can be manually set by the user.
   */
  selectedPaymentMethod: PaymentMethod | null;
  /**
   * The user's selected token.
   * When set, automatically fetches and sets payment methods for that token.
   */
  selectedToken: RampsToken | null;
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
  countries: {
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
  paymentMethods: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  selectedPaymentMethod: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  selectedToken: {
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
    countries: [],
    providers: [],
    tokens: null,
    paymentMethods: [],
    selectedPaymentMethod: null,
    selectedToken: null,
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
  | RampsServiceGetProvidersAction
  | RampsServiceGetPaymentMethodsAction;

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

    const pending = this.#pendingRequests.get(cacheKey);
    if (pending) {
      return pending.promise as Promise<TResult>;
    }

    if (!options?.forceRefresh) {
      const cached = this.state.requests[cacheKey];
      if (cached && !isCacheExpired(cached, ttl)) {
        return cached.data as TResult;
      }
    }

    const abortController = new AbortController();
    const lastFetchedAt = Date.now();

    this.#updateRequestState(cacheKey, createLoadingState());

    const promise = (async (): Promise<TResult> => {
      try {
        const data = await fetcher(abortController.signal);

        if (abortController.signal.aborted) {
          throw new Error('Request was aborted');
        }

        this.#updateRequestState(
          cacheKey,
          createSuccessState(data as Json, lastFetchedAt),
        );
        return data;
      } catch (error) {
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
        const currentPending = this.#pendingRequests.get(cacheKey);
        if (currentPending?.abortController === abortController) {
          this.#pendingRequests.delete(cacheKey);
        }
      }
    })();

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

  #cleanupState(): void {
    this.update((state) => {
      state.userRegion = null;
      state.preferredProvider = null;
      state.tokens = null;
      state.providers = [];
      state.paymentMethods = [];
      state.selectedPaymentMethod = null;
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
    const ttl = this.#requestCacheTTL;

    this.update((state) => {
      const requests = state.requests as unknown as Record<
        string,
        RequestState | undefined
      >;
      requests[cacheKey] = requestState;

      // Evict expired entries based on TTL
      // Only evict SUCCESS states that have exceeded their TTL
      const keys = Object.keys(requests);
      for (const key of keys) {
        const entry = requests[key];
        if (
          entry &&
          entry.status === RequestStatus.SUCCESS &&
          isCacheExpired(entry, ttl)
        ) {
          delete requests[key];
        }
      }

      // Evict oldest entries if cache still exceeds max size
      const remainingKeys = Object.keys(requests);
      if (remainingKeys.length > maxSize) {
        // Sort by timestamp (oldest first)
        const sortedKeys = remainingKeys.sort((a, b) => {
          const aTime = requests[a]?.timestamp ?? 0;
          const bTime = requests[b]?.timestamp ?? 0;
          return aTime - bTime;
        });

        // Remove oldest entries until we're under the limit
        const entriesToRemove = remainingKeys.length - maxSize;
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
   * Sets the user's region manually (without fetching geolocation).
   * This allows users to override the detected region.
   *
   * @param region - The region code to set (e.g., "US-CA").
   * @param options - Options for cache behavior (doNotUpdateState is not supported as this is inherently stateful).
   * @returns The user region object.
   */
  async setUserRegion(
    region: string,
    options?: CacheOptions,
  ): Promise<UserRegion> {
    const normalizedRegion = region.toLowerCase().trim();

    try {
      const { countries } = this.state;
      if (!countries || countries.length === 0) {
        this.#cleanupState();
        throw new Error(
          'No countries found. Cannot set user region without valid country information.',
        );
      }

      const userRegion = findRegionFromCode(normalizedRegion, countries);

      if (!userRegion) {
        this.#cleanupState();
        throw new Error(
          `Region "${normalizedRegion}" not found in countries data. Cannot set user region without valid country information.`,
        );
      }

      const regionChanged =
        normalizedRegion !== this.state.userRegion?.regionCode;

      this.update((state) => {
        if (regionChanged) {
          state.preferredProvider = null;
          state.tokens = null;
          state.providers = [];
          state.paymentMethods = [];
          state.selectedPaymentMethod = null;
        }
        state.userRegion = userRegion;
      });

      if (regionChanged || !this.state.tokens) {
        this.triggerGetTokens(userRegion.regionCode, 'buy', options);
      }
      if (regionChanged || this.state.providers.length === 0) {
        this.triggerGetProviders(userRegion.regionCode, options);
      }

      return userRegion;
    } catch (error) {
      this.#cleanupState();
      throw error;
    }
  }

  /**
   * Sets the user's preferred provider.
   * This allows users to set their preferred ramp provider.
   * If a token is already selected, automatically fetches payment methods for that token.
   *
   * @param provider - The provider object to set.
   */
  setPreferredProvider(provider: Provider | null): void {
    const hadProvider = this.state.preferredProvider !== null;
    this.update((state) => {
      state.preferredProvider = provider;
    });

    // If token is selected and provider changed, fetch payment methods
    if (this.state.selectedToken && provider) {
      this.#fetchAndSetPaymentMethods(
        provider.id,
        this.state.selectedToken,
      ).catch(() => {
        // Error stored in state
      });
    } else if (hadProvider && !provider && this.state.selectedToken) {
      this.update((state) => {
        state.paymentMethods = [];
        state.selectedPaymentMethod = null;
      });
    }
  }

  /**
   * Initializes the controller by fetching the user's region from geolocation.
   * This should be called once at app startup to set up the initial region.
   *
   * If a userRegion already exists (from persistence or manual selection),
   * this method will skip geolocation fetch and use the existing region.
   *
   * @param options - Options for cache behavior (doNotUpdateState is not supported as this is inherently stateful).
   * @returns Promise that resolves when initialization is complete.
   */
  async init(options?: CacheOptions): Promise<void> {
    await this.getCountries(options);

    let regionCode = this.state.userRegion?.regionCode;
    regionCode ??= await this.messenger.call('RampsService:getGeolocation');

    if (!regionCode) {
      throw new Error(
        'Failed to fetch geolocation. Cannot initialize controller without valid region information.',
      );
    }

    await this.setUserRegion(regionCode, options);
  }

  hydrateState(options?: CacheOptions): void {
    const regionCode = this.state.userRegion?.regionCode;
    if (!regionCode) {
      throw new Error(
        'Region code is required. Cannot hydrate state without valid region information.',
      );
    }

    this.triggerGetTokens(regionCode, 'buy', options);
    this.triggerGetProviders(regionCode, options);
  }

  /**
   * Fetches the list of supported countries.
   * The API returns countries with support information for both buy and sell actions.
   * The countries are saved in the controller state once fetched.
   *
   * @param options - Options for cache behavior.
   * @returns An array of countries.
   */
  async getCountries(options?: ExecuteRequestOptions): Promise<Country[]> {
    const cacheKey = createCacheKey('getCountries', []);

    const countries = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getCountries');
      },
      options,
    );

    if (!options?.doNotUpdateState) {
      this.update((state) => {
        state.countries = countries;
      });
    }

    return countries;
  }

  /**
   * Fetches the list of available tokens for a given region and action.
   * The tokens are saved in the controller state once fetched.
   *
   * @param region - The region code (e.g., "us", "fr", "us-ny"). If not provided, uses the user's region from controller state.
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Options for cache behavior and query filters.
   * @param options.provider - Provider ID(s) to filter by.
   * @returns The tokens response containing topTokens and allTokens.
   */
  async getTokens(
    region?: string,
    action: RampAction = 'buy',
    options?: ExecuteRequestOptions & {
      provider?: string | string[];
    },
  ): Promise<TokensResponse> {
    const regionToUse = region ?? this.state.userRegion?.regionCode;

    if (!regionToUse) {
      throw new Error(
        'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
      );
    }

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const cacheKey = createCacheKey('getTokens', [
      normalizedRegion,
      action,
      options?.provider,
    ]);

    const tokens = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call(
          'RampsService:getTokens',
          normalizedRegion,
          action,
          {
            provider: options?.provider,
          },
        );
      },
      options,
    );

    if (!options?.doNotUpdateState) {
      this.update((state) => {
        const userRegionCode = state.userRegion?.regionCode;

        if (
          userRegionCode === undefined ||
          userRegionCode === normalizedRegion
        ) {
          state.tokens = tokens;
        }
      });
    }

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

    if (!options?.doNotUpdateState) {
      this.update((state) => {
        const userRegionCode = state.userRegion?.regionCode;

        if (
          userRegionCode === undefined ||
          userRegionCode === normalizedRegion
        ) {
          state.providers = providers;
        }
      });
    }

    return { providers };
  }

  /**
   * Fetches the list of payment methods for a given context.
   * The payment methods are saved in the controller state once fetched.
   *
   * @param region - User's region code. If not provided, uses the user's region from controller state.
   * @param options - Query parameters for filtering payment methods.
   * @param options.fiat - Fiat currency code (e.g., "usd"). If not provided, uses the user's region currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.provider - Provider ID path.
   * @param options.forceRefresh - Whether to bypass cache.
   * @param options.ttl - Custom TTL for this request.
   * @param options.doNotUpdateState - If true, does not update controller state with results.
   * @returns The payment methods response containing payments array.
   */
  async getPaymentMethods(
    region?: string,
    options?: ExecuteRequestOptions & {
      fiat?: string;
      assetId: string;
      provider: string;
    },
  ): Promise<PaymentMethodsResponse> {
    const regionToUse = region ?? this.state.userRegion?.regionCode;
    const fiatToUse = options?.fiat ?? this.state.userRegion?.country?.currency;

    if (!regionToUse) {
      throw new Error(
        'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
      );
    }

    if (!fiatToUse) {
      throw new Error(
        'Fiat currency is required. Either provide a fiat parameter or ensure userRegion is set in controller state.',
      );
    }

    if (!options?.assetId) {
      throw new Error('assetId is required.');
    }

    if (!options?.provider) {
      throw new Error('provider is required.');
    }

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const normalizedFiat = fiatToUse.toLowerCase().trim();
    const cacheKey = createCacheKey('getPaymentMethods', [
      normalizedRegion,
      normalizedFiat,
      options.assetId,
      options.provider,
    ]);

    const response = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getPaymentMethods', {
          region: normalizedRegion,
          fiat: normalizedFiat,
          assetId: options.assetId,
          provider: options.provider,
        });
      },
      options,
    );

    if (!options?.doNotUpdateState) {
      this.update((state) => {
        state.paymentMethods = response.payments;
        if (
          state.selectedPaymentMethod &&
          !response.payments.some(
            (pm: PaymentMethod) => pm.id === state.selectedPaymentMethod?.id,
          )
        ) {
          state.selectedPaymentMethod = null;
        }
      });
    }

    return response;
  }

  /**
   * Sets the user's selected token.
   * Automatically fetches and sets payment methods for that token, and auto-selects the first one.
   *
   * @param token - The token object, or null to clear.
   * @param options - Options for cache behavior.
   */
  async setSelectedToken(
    token: RampsToken | null,
    options?: ExecuteRequestOptions,
  ): Promise<void> {
    this.update((state) => {
      state.selectedToken = token;
    });

    if (!token) {
      this.update((state) => {
        state.paymentMethods = [];
        state.selectedPaymentMethod = null;
      });
      return;
    }

    // Automatically fetch payment methods for the selected token
    const provider = this.state.preferredProvider ?? this.state.providers[0];

    if (provider) {
      await this.#fetchAndSetPaymentMethods(provider.id, token, options);
    } else {
      this.update((state) => {
        state.paymentMethods = [];
        state.selectedPaymentMethod = null;
      });
    }
  }

  /**
   * Fetches payment methods for the given provider and token, then auto-selects the first one.
   *
   * @param providerId - The provider ID.
   * @param token - The token object (optional, uses selectedToken if not provided).
   * @param options - Options for cache behavior.
   */
  async #fetchAndSetPaymentMethods(
    providerId: string,
    token?: RampsToken,
    options?: ExecuteRequestOptions,
  ): Promise<void> {
    const tokenToUse = token ?? this.state.selectedToken;
    if (!tokenToUse) {
      return;
    }

    const { assetId } = tokenToUse;

    const regionCode = this.state.userRegion?.regionCode;
    const fiatCurrency = this.state.userRegion?.country?.currency;

    if (!regionCode || !fiatCurrency) {
      return;
    }

    try {
      const response = await this.getPaymentMethods(regionCode, {
        assetId,
        provider: providerId,
        fiat: fiatCurrency,
        ...options,
      });

      // Auto-select the first payment method
      if (response.payments.length > 0) {
        this.update((state) => {
          state.selectedPaymentMethod = response.payments[0];
        });
      }
    } catch {
      // Error stored in state
    }
  }

  /**
   * Sets the user's selected payment method.
   *
   * @param paymentMethod - The payment method to select, or null to clear.
   */
  setSelectedPaymentMethod(paymentMethod: PaymentMethod | null): void {
    this.update((state) => {
      state.selectedPaymentMethod = paymentMethod;
    });
  }

  // ============================================================
  // Sync Trigger Methods
  // These fire-and-forget methods are for use in React effects.
  // Errors are stored in state and available via selectors.
  // ============================================================

  /**
   * Triggers setting the user region without throwing.
   *
   * @param region - The region code to set (e.g., "US-CA").
   * @param options - Options for cache behavior (doNotUpdateState is not supported as this is inherently stateful).
   */
  triggerSetUserRegion(region: string, options?: CacheOptions): void {
    this.setUserRegion(region, options).catch(() => {
      // Error stored in state
    });
  }

  /**
   * Triggers fetching countries without throwing.
   *
   * @param options - Options for cache behavior.
   */
  triggerGetCountries(options?: ExecuteRequestOptions): void {
    this.getCountries(options).catch(() => {
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

  /**
   * Triggers fetching payment methods without throwing.
   *
   * @param region - User's region code. If not provided, uses userRegion from state.
   * @param options - Query parameters for filtering payment methods.
   * @param options.fiat - Fiat currency code. If not provided, uses userRegion currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.provider - Provider ID path.
   * @param options.forceRefresh - Whether to bypass cache.
   * @param options.ttl - Custom TTL for this request.
   * @param options.doNotUpdateState - If true, does not update controller state with results.
   */
  triggerGetPaymentMethods(
    region?: string,
    options?: ExecuteRequestOptions & {
      fiat?: string;
      assetId: string;
      provider: string;
    },
  ): void {
    this.getPaymentMethods(region, options).catch(() => {
      // Error stored in state
    });
  }
}
