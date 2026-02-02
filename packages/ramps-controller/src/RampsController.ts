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
  QuotesResponse,
  Quote,
  GetQuotesParams,
  RampsToken,
} from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
  RampsServiceGetPaymentMethodsAction,
  RampsServiceGetQuotesAction,
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
  RequestStatus,
} from './RequestCache';

// === GENERAL ===

/**
 * The name of the {@link RampsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'RampsController';

/**
 * Default TTL for quotes requests (15 seconds).
 * Quotes are time-sensitive and should have a shorter cache duration.
 */
const DEFAULT_QUOTES_TTL = 15000;

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
   * The user's selected provider.
   * Can be manually set by the user.
   */
  selectedProvider: Provider | null;
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
   * The user's selected token.
   * When set, automatically fetches and sets payment methods for that token.
   */
  selectedToken: RampsToken | null;
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
   * Quotes fetched for the current context.
   * Contains quotes from multiple providers for the given parameters.
   */
  quotes: QuotesResponse | null;
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
  selectedProvider: {
    persist: false,
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
  selectedToken: {
    persist: false,
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
  quotes: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: false,
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
    selectedProvider: null,
    countries: [],
    providers: [],
    tokens: null,
    selectedToken: null,
    paymentMethods: [],
    selectedPaymentMethod: null,
    quotes: null,
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
  | RampsServiceGetPaymentMethodsAction
  | RampsServiceGetQuotesAction;

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

  #cleanupState(): void {
    this.update((state) => {
      state.userRegion = null;
      state.selectedProvider = null;
      state.selectedToken = null;
      state.tokens = null;
      state.providers = [];
      state.paymentMethods = [];
      state.selectedPaymentMethod = null;
      state.quotes = null;
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
          entry?.status === RequestStatus.SUCCESS &&
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
   * @param options - Options for cache behavior.
   * @returns The user region object.
   */
  async setUserRegion(
    region: string,
    options?: ExecuteRequestOptions,
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

      // Only cleanup state if region is actually changing
      const regionChanged =
        normalizedRegion !== this.state.userRegion?.regionCode;

      // Set the new region atomically with cleanup to avoid intermediate null state
      this.update((state) => {
        if (regionChanged) {
          state.selectedProvider = null;
          state.selectedToken = null;
          state.tokens = null;
          state.providers = [];
          state.paymentMethods = [];
          state.selectedPaymentMethod = null;
          state.quotes = null;
        }
        state.userRegion = userRegion;
      });

      // Only trigger fetches if region changed or if data is missing
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
   * Sets the user's selected provider by ID, or clears the selection.
   * Looks up the provider from the current providers in state and automatically
   * fetches payment methods for that provider.
   *
   * @param providerId - The provider ID (e.g., "/providers/moonpay"), or null to clear.
   * @throws If region is not set, providers are not loaded, or provider is not found.
   */
  setSelectedProvider(providerId: string | null): void {
    if (providerId === null) {
      this.update((state) => {
        state.selectedProvider = null;
        state.paymentMethods = [];
        state.selectedPaymentMethod = null;
      });
      return;
    }

    const regionCode = this.state.userRegion?.regionCode;
    if (!regionCode) {
      throw new Error(
        'Region is required. Cannot set selected provider without valid region information.',
      );
    }

    const { providers } = this.state;
    if (!providers || providers.length === 0) {
      throw new Error(
        'Providers not loaded. Cannot set selected provider before providers are fetched.',
      );
    }

    const provider = providers.find((prov) => prov.id === providerId);
    if (!provider) {
      throw new Error(
        `Provider with ID "${providerId}" not found in available providers.`,
      );
    }

    this.update((state) => {
      state.selectedProvider = provider;
      state.paymentMethods = [];
      state.selectedPaymentMethod = null;
    });

    // fetch payment methods for the new provider
    // this is needed because you can change providers without changing the token
    // (getPaymentMethods will use state as its default)
    this.triggerGetPaymentMethods(regionCode, {
      provider: provider.id,
    });
  }

  /**
   * Initializes the controller by fetching the user's region from geolocation.
   * This should be called once at app startup to set up the initial region.
   *
   * If a userRegion already exists (from persistence or manual selection),
   * this method will skip geolocation fetch and use the existing region.
   *
   * @param options - Options for cache behavior.
   * @returns Promise that resolves when initialization is complete.
   */
  async init(options?: ExecuteRequestOptions): Promise<void> {
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

  hydrateState(options?: ExecuteRequestOptions): void {
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

    this.update((state) => {
      state.countries = countries;
    });

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

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.tokens = tokens;
      }
    });

    return tokens;
  }

  /**
   * Sets the user's selected token by asset ID.
   * Looks up the token from the current tokens in state and automatically
   * fetches payment methods for that token.
   *
   * @param assetId - The asset identifier in CAIP-19 format (e.g., "eip155:1/erc20:0x..."), or undefined to clear.
   * @throws If region is not set, tokens are not loaded, or token is not found.
   */
  setSelectedToken(assetId?: string): void {
    if (!assetId) {
      this.update((state) => {
        state.selectedToken = null;
        state.paymentMethods = [];
        state.selectedPaymentMethod = null;
      });
      return;
    }

    const regionCode = this.state.userRegion?.regionCode;
    if (!regionCode) {
      throw new Error(
        'Region is required. Cannot set selected token without valid region information.',
      );
    }

    const { tokens } = this.state;
    if (!tokens) {
      throw new Error(
        'Tokens not loaded. Cannot set selected token before tokens are fetched.',
      );
    }

    const token =
      tokens.allTokens.find((tok) => tok.assetId === assetId) ??
      tokens.topTokens.find((tok) => tok.assetId === assetId);

    if (!token) {
      throw new Error(
        `Token with asset ID "${assetId}" not found in available tokens.`,
      );
    }

    this.update((state) => {
      state.selectedToken = token;
      state.paymentMethods = [];
      state.selectedPaymentMethod = null;
    });

    this.triggerGetPaymentMethods(regionCode, {
      assetId: token.assetId,
    });
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

  /**
   * Fetches the list of payment methods for a given context.
   * The payment methods are saved in the controller state once fetched.
   *
   * @param region - User's region code (e.g. "fr", "us-ny").
   * @param options - Query parameters for filtering payment methods.
   * @param options.fiat - Fiat currency code (e.g., "usd"). If not provided, uses the user's region currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.provider - Provider ID path.
   * @returns The payment methods response containing payments array.
   */
  async getPaymentMethods(
    region?: string,
    options?: ExecuteRequestOptions & {
      fiat?: string;
      assetId?: string;
      provider?: string;
    },
  ): Promise<PaymentMethodsResponse> {
    const regionCode = region ?? this.state.userRegion?.regionCode ?? null;
    const fiatToUse =
      options?.fiat ?? this.state.userRegion?.country?.currency ?? null;
    const assetIdToUse =
      options?.assetId ?? this.state.selectedToken?.assetId ?? '';
    const providerToUse =
      options?.provider ?? this.state.selectedProvider?.id ?? '';

    if (!regionCode) {
      throw new Error(
        'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
      );
    }

    if (!fiatToUse) {
      throw new Error(
        'Fiat currency is required. Either provide a fiat parameter or ensure userRegion is set in controller state.',
      );
    }

    const normalizedRegion = regionCode.toLowerCase().trim();
    const normalizedFiat = fiatToUse.toLowerCase().trim();
    const cacheKey = createCacheKey('getPaymentMethods', [
      normalizedRegion,
      normalizedFiat,
      assetIdToUse,
      providerToUse,
    ]);

    const response = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getPaymentMethods', {
          region: normalizedRegion,
          fiat: normalizedFiat,
          assetId: assetIdToUse,
          provider: providerToUse,
        });
      },
      options,
    );

    this.update((state) => {
      const currentAssetId = state.selectedToken?.assetId ?? '';
      const currentProviderId = state.selectedProvider?.id ?? '';

      const tokenSelectionUnchanged = assetIdToUse === currentAssetId;
      const providerSelectionUnchanged = providerToUse === currentProviderId;

      // this is a race condition check to ensure that the selected token and provider in state are the same as the tokens we're requesting for
      // ex: if the user rapidly changes the token or provider, the in-flight payment methods might not be valid
      // so this check will ensure that the payment methods are still valid for the token and provider that were requested
      if (tokenSelectionUnchanged && providerSelectionUnchanged) {
        state.paymentMethods = response.payments;

        // this will auto-select the first payment method if the selected payment method is not in the new payment methods
        const currentSelectionStillValid = response.payments.some(
          (pm: PaymentMethod) => pm.id === state.selectedPaymentMethod?.id,
        );
        if (!currentSelectionStillValid) {
          state.selectedPaymentMethod = response.payments[0] ?? null;
        }
      }
    });

    return response;
  }

  /**
   * Sets the user's selected payment method by ID.
   * Looks up the payment method from the current payment methods in state.
   *
   * @param paymentMethodId - The payment method ID (e.g., "/payments/debit-credit-card"), or null to clear.
   * @throws If payment methods are not loaded or payment method is not found.
   */
  setSelectedPaymentMethod(paymentMethodId?: string): void {
    if (!paymentMethodId) {
      this.update((state) => {
        state.selectedPaymentMethod = null;
      });
      return;
    }

    const { paymentMethods } = this.state;
    if (!paymentMethods || paymentMethods.length === 0) {
      throw new Error(
        'Payment methods not loaded. Cannot set selected payment method before payment methods are fetched.',
      );
    }

    const paymentMethod = paymentMethods.find(
      (pm) => pm.id === paymentMethodId,
    );
    if (!paymentMethod) {
      throw new Error(
        `Payment method with ID "${paymentMethodId}" not found in available payment methods.`,
      );
    }

    this.update((state) => {
      state.selectedPaymentMethod = paymentMethod;
    });
  }

  /**
   * Fetches quotes from all providers for a given set of parameters.
   * The quotes are saved in the controller state once fetched.
   *
   * @param options - The parameters for fetching quotes.
   * @param options.region - User's region code. If not provided, uses userRegion from state.
   * @param options.fiat - Fiat currency code. If not provided, uses userRegion currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.amount - The amount (in fiat for buy, crypto for sell).
   * @param options.walletAddress - The destination wallet address.
   * @param options.paymentMethods - Array of payment method IDs. If not provided, uses paymentMethods from state.
   * @param options.provider - Optional provider ID to filter quotes.
   * @param options.redirectUrl - Optional redirect URL after order completion.
   * @param options.action - The ramp action type. Defaults to 'buy'.
   * @param options.forceRefresh - Whether to bypass cache.
   * @param options.ttl - Custom TTL for this request.
   * @returns The quotes response containing success, sorted, error, and customActions.
   */
  async getQuotes(options: {
    region?: string;
    fiat?: string;
    assetId: string;
    amount: number;
    walletAddress: string;
    paymentMethods?: string[];
    provider?: string;
    redirectUrl?: string;
    action?: RampAction;
    forceRefresh?: boolean;
    ttl?: number;
  }): Promise<QuotesResponse> {
    const regionToUse = options.region ?? this.state.userRegion?.regionCode;
    const fiatToUse = options.fiat ?? this.state.userRegion?.country?.currency;
    const paymentMethodsToUse =
      options.paymentMethods ??
      this.state.paymentMethods.map((pm: PaymentMethod) => pm.id);
    const action = options.action ?? 'buy';

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

    if (!paymentMethodsToUse || paymentMethodsToUse.length === 0) {
      throw new Error(
        'Payment methods are required. Either provide paymentMethods parameter or ensure paymentMethods are set in controller state.',
      );
    }

    if (options.amount <= 0 || !Number.isFinite(options.amount)) {
      throw new Error('Amount must be a positive finite number.');
    }

    if (!options.assetId || options.assetId.trim() === '') {
      throw new Error('assetId is required.');
    }

    if (!options.walletAddress || options.walletAddress.trim() === '') {
      throw new Error('walletAddress is required.');
    }

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const normalizedFiat = fiatToUse.toLowerCase().trim();
    const normalizedAssetId = options.assetId.trim();
    const normalizedWalletAddress = options.walletAddress.trim();

    const cacheKey = createCacheKey('getQuotes', [
      normalizedRegion,
      normalizedFiat,
      normalizedAssetId,
      options.amount,
      normalizedWalletAddress,
      [...paymentMethodsToUse].sort().join(','),
      options.provider,
      options.redirectUrl,
      action,
    ]);

    const params: GetQuotesParams = {
      region: normalizedRegion,
      fiat: normalizedFiat,
      assetId: normalizedAssetId,
      amount: options.amount,
      walletAddress: normalizedWalletAddress,
      paymentMethods: paymentMethodsToUse,
      provider: options.provider,
      redirectUrl: options.redirectUrl,
      action,
    };

    const response = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getQuotes', params);
      },
      {
        forceRefresh: options.forceRefresh,
        ttl: options.ttl ?? DEFAULT_QUOTES_TTL,
      },
    );

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.quotes = response;
      }
    });

    return response;
  }

  /**
   * Extracts the widget URL from a quote for redirect providers.
   * Returns the widget URL if available, or null if the quote doesn't have one.
   *
   * @param quote - The quote to extract the widget URL from.
   * @returns The widget URL string, or null if not available.
   */
  getWidgetUrl(quote: Quote): string | null {
    return quote.quote?.widgetUrl ?? null;
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
   * @param region - User's region code (e.g., "us", "fr", "us-ny").
   * @param options - Query parameters for filtering payment methods.
   * @param options.fiat - Fiat currency code. If not provided, uses userRegion currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.provider - Provider ID path.
   */
  triggerGetPaymentMethods(
    region?: string,
    options?: ExecuteRequestOptions & {
      fiat?: string;
      assetId?: string;
      provider?: string;
    },
  ): void {
    this.getPaymentMethods(region, options).catch(() => {
      // Error stored in state
    });
  }

  /**
   * Triggers fetching quotes without throwing.
   *
   * @param options - The parameters for fetching quotes.
   * @param options.region - User's region code. If not provided, uses userRegion from state.
   * @param options.fiat - Fiat currency code. If not provided, uses userRegion currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.amount - The amount (in fiat for buy, crypto for sell).
   * @param options.walletAddress - The destination wallet address.
   * @param options.paymentMethods - Array of payment method IDs. If not provided, uses paymentMethods from state.
   * @param options.provider - Optional provider ID to filter quotes.
   * @param options.redirectUrl - Optional redirect URL after order completion.
   * @param options.action - The ramp action type. Defaults to 'buy'.
   * @param options.forceRefresh - Whether to bypass cache.
   * @param options.ttl - Custom TTL for this request.
   */
  triggerGetQuotes(options: {
    region?: string;
    fiat?: string;
    assetId: string;
    amount: number;
    walletAddress: string;
    paymentMethods?: string[];
    provider?: string;
    redirectUrl?: string;
    action?: RampAction;
    forceRefresh?: boolean;
    ttl?: number;
  }): void {
    this.getQuotes(options).catch(() => {
      // Error stored in state
    });
  }
}
