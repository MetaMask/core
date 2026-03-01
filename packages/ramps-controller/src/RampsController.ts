import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';
import type { Draft } from 'immer';

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
  RampsToken,
  RampsServiceActions,
  RampsOrder,
} from './RampsService';
import { RampsOrderStatus } from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
  RampsServiceGetPaymentMethodsAction,
  RampsServiceGetQuotesAction,
  RampsServiceGetBuyWidgetUrlAction,
  RampsServiceGetOrderAction,
  RampsServiceGetOrderFromCallbackAction,
} from './RampsService-method-action-types';
import type {
  RequestCache as RequestCacheType,
  RequestState,
  ExecuteRequestOptions,
  PendingRequest,
  ResourceType,
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
import type {
  TransakAccessToken,
  TransakUserDetails,
  TransakBuyQuote,
  TransakKycRequirement,
  TransakAdditionalRequirementsResponse,
  TransakDepositOrder,
  TransakUserLimits,
  TransakOttResponse,
  TransakQuoteTranslation,
  TransakTranslationRequest,
  TransakIdProofStatus,
  TransakOrderPaymentMethod,
  PatchUserRequestBody,
  TransakOrder,
} from './TransakService';
import type { TransakServiceActions } from './TransakService';
import type {
  TransakServiceSetApiKeyAction,
  TransakServiceSetAccessTokenAction,
  TransakServiceClearAccessTokenAction,
  TransakServiceSendUserOtpAction,
  TransakServiceVerifyUserOtpAction,
  TransakServiceLogoutAction,
  TransakServiceGetUserDetailsAction,
  TransakServiceGetBuyQuoteAction,
  TransakServiceGetKycRequirementAction,
  TransakServiceGetAdditionalRequirementsAction,
  TransakServiceCreateOrderAction,
  TransakServiceGetOrderAction,
  TransakServiceGetUserLimitsAction,
  TransakServiceRequestOttAction,
  TransakServiceGeneratePaymentWidgetUrlAction,
  TransakServiceSubmitPurposeOfUsageFormAction,
  TransakServicePatchUserAction,
  TransakServiceSubmitSsnDetailsAction,
  TransakServiceConfirmPaymentAction,
  TransakServiceGetTranslationAction,
  TransakServiceGetIdProofStatusAction,
  TransakServiceCancelOrderAction,
  TransakServiceCancelAllActiveOrdersAction,
  TransakServiceGetActiveOrdersAction,
} from './TransakService-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link RampsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'RampsController';

/**
 * RampsService action types that RampsController calls via the messenger.
 * Any host (e.g. mobile) that creates a RampsController messenger must delegate
 * these actions from the root messenger so the controller can function.
 */
export const RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS: readonly (
  | RampsServiceActions['type']
  | TransakServiceActions['type']
)[] = [
  'RampsService:getGeolocation',
  'RampsService:getCountries',
  'RampsService:getTokens',
  'RampsService:getProviders',
  'RampsService:getPaymentMethods',
  'RampsService:getQuotes',
  'RampsService:getBuyWidgetUrl',
  'RampsService:getOrder',
  'RampsService:getOrderFromCallback',
  'TransakService:setApiKey',
  'TransakService:setAccessToken',
  'TransakService:clearAccessToken',
  'TransakService:sendUserOtp',
  'TransakService:verifyUserOtp',
  'TransakService:logout',
  'TransakService:getUserDetails',
  'TransakService:getBuyQuote',
  'TransakService:getKycRequirement',
  'TransakService:getAdditionalRequirements',
  'TransakService:createOrder',
  'TransakService:getOrder',
  'TransakService:getUserLimits',
  'TransakService:requestOtt',
  'TransakService:generatePaymentWidgetUrl',
  'TransakService:submitPurposeOfUsageForm',
  'TransakService:patchUser',
  'TransakService:submitSsnDetails',
  'TransakService:confirmPayment',
  'TransakService:getTranslation',
  'TransakService:getIdProofStatus',
  'TransakService:cancelOrder',
  'TransakService:cancelAllActiveOrders',
  'TransakService:getActiveOrders',
];

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
 * Generic type for resource state that bundles data with loading/error states.
 *
 * @template TData - The type of the resource data
 * @template TSelected - The type of the selected item (defaults to null for resources without selection)
 */
export type ResourceState<TData, TSelected = null> = {
  /**
   * The resource data.
   */
  data: TData;
  /**
   * The currently selected item, or null if none selected.
   */
  selected: TSelected;
  /**
   * Whether the resource is currently being fetched.
   */
  isLoading: boolean;
  /**
   * Error message if the fetch failed, or null.
   */
  error: string | null;
};

/**
 * Describes the transak-specific state managed by the RampsController.
 * This state is used by the unified V2 native flow.
 */
export type TransakState = {
  isAuthenticated: boolean;
  userDetails: ResourceState<TransakUserDetails | null>;
  buyQuote: ResourceState<TransakBuyQuote | null>;
  kycRequirement: ResourceState<TransakKycRequirement | null>;
};

/**
 * Describes the state for all native providers managed by the RampsController.
 * Each native provider has its own nested state object.
 */
export type NativeProvidersState = {
  transak: TransakState;
};

/**
 * Describes the shape of the state object for {@link RampsController}.
 */
export type RampsControllerState = {
  /**
   * The user's region (full country and state objects).
   * Initially set via geolocation fetch, but can be manually changed by the user.
   */
  userRegion: UserRegion | null;
  /**
   * Countries resource state with data, loading, and error.
   * Data contains the list of countries available for ramp actions.
   */
  countries: ResourceState<Country[]>;
  /**
   * Providers resource state with data, selected, loading, and error.
   * Data contains the list of providers available for the current region.
   */
  providers: ResourceState<Provider[], Provider | null>;
  /**
   * Tokens resource state with data, selected, loading, and error.
   * Data contains topTokens and allTokens arrays.
   */
  tokens: ResourceState<TokensResponse | null, RampsToken | null>;
  /**
   * Payment methods resource state with data, selected, loading, and error.
   * Data contains payment methods filtered by region, fiat, asset, and provider.
   */
  paymentMethods: ResourceState<PaymentMethod[], PaymentMethod | null>;
  /**
   * Cache of request states, keyed by cache key.
   * This stores loading, success, and error states for API requests.
   */
  requests: RequestCacheType;
  /**
   * State for native providers in the unified V2 flow.
   * Each provider has its own nested state containing authentication,
   * user details, quote, and KYC data.
   */
  nativeProviders: NativeProvidersState;
  /**
   * V2 orders stored directly as RampsOrder[].
   * The controller is the authority for V2 orders — it polls, updates,
   * and persists them. No FiatOrder wrapper needed.
   */
  orders: RampsOrder[];
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
  requests: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: false,
    usedInUi: true,
  },
  nativeProviders: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: false,
    usedInUi: true,
  },
  orders: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
} satisfies StateMetadata<RampsControllerState>;

/**
 * Creates a default resource state object.
 *
 * @template TData - The type of the resource data.
 * @template TSelected - The type of the selected item.
 * @param data - The initial data value.
 * @param selected - The initial selected value.
 * @returns A ResourceState object with default loading and error values.
 */
function createDefaultResourceState<TData, TSelected = null>(
  data: TData,
  selected: TSelected = null as TSelected,
): ResourceState<TData, TSelected> {
  return {
    data,
    selected,
    isLoading: false,
    error: null,
  };
}

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
    countries: createDefaultResourceState<Country[]>([]),
    providers: createDefaultResourceState<Provider[], Provider | null>(
      [],
      null,
    ),
    tokens: createDefaultResourceState<
      TokensResponse | null,
      RampsToken | null
    >(null, null),
    paymentMethods: createDefaultResourceState<
      PaymentMethod[],
      PaymentMethod | null
    >([], null),
    requests: {},
    nativeProviders: {
      transak: {
        isAuthenticated: false,
        userDetails: createDefaultResourceState<TransakUserDetails | null>(
          null,
        ),
        buyQuote: createDefaultResourceState<TransakBuyQuote | null>(null),
        kycRequirement:
          createDefaultResourceState<TransakKycRequirement | null>(null),
      },
    },
    orders: [],
  };
}

const DEPENDENT_RESOURCE_KEYS = [
  'providers',
  'tokens',
  'paymentMethods',
] as const;

type DependentResourceKey = (typeof DEPENDENT_RESOURCE_KEYS)[number];

const DEPENDENT_RESOURCE_KEYS_SET = new Set<string>(DEPENDENT_RESOURCE_KEYS);

function resetResource(
  state: Draft<RampsControllerState>,
  resourceType: DependentResourceKey,
  defaultResource?: RampsControllerState[DependentResourceKey],
): void {
  const def = defaultResource ?? getDefaultRampsControllerState()[resourceType];
  const resource = state[resourceType];
  resource.data = def.data;
  resource.selected = def.selected;
  resource.isLoading = def.isLoading;
  resource.error = def.error;
}

/**
 * Resets region-dependent resources (userRegion, providers, tokens, paymentMethods).
 * Mutates state in place; use from within controller update() for atomic updates.
 *
 * @param state - The state object to mutate.
 * @param options - Options for the reset.
 * @param options.clearUserRegionData - When true, sets userRegion to null (e.g. for full cleanup).
 */
function resetDependentResources(
  state: Draft<RampsControllerState>,
  options?: { clearUserRegionData?: boolean },
): void {
  if (options?.clearUserRegionData) {
    state.userRegion = null;
  }
  const defaultState = getDefaultRampsControllerState();
  for (const key of DEPENDENT_RESOURCE_KEYS) {
    resetResource(state, key, defaultState[key]);
  }
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
 * Sets the selected token by asset ID.
 */
export type RampsControllerSetSelectedTokenAction = {
  type: `${typeof controllerName}:setSelectedToken`;
  handler: (assetId?: string) => void;
};

/**
 * Fetches buy quotes using the current controller context and provided inputs.
 */
export type RampsControllerGetQuotesAction = {
  type: `${typeof controllerName}:getQuotes`;
  handler: (options: {
    region?: string;
    fiat?: string;
    assetId?: string;
    amount: number;
    walletAddress: string;
    paymentMethods?: string[];
    providers?: string[];
    redirectUrl?: string;
    action?: RampAction;
    forceRefresh?: boolean;
    ttl?: number;
  }) => Promise<QuotesResponse>;
};

/**
 * Actions that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerActions =
  | RampsControllerGetStateAction
  | RampsControllerGetQuotesAction
  | RampsControllerSetSelectedTokenAction;

/**
 * Actions from other messengers that {@link RampsController} calls.
 */
type AllowedActions =
  | RampsServiceGetGeolocationAction
  | RampsServiceGetCountriesAction
  | RampsServiceGetTokensAction
  | RampsServiceGetProvidersAction
  | RampsServiceGetPaymentMethodsAction
  | RampsServiceGetQuotesAction
  | RampsServiceGetBuyWidgetUrlAction
  | RampsServiceGetOrderAction
  | RampsServiceGetOrderFromCallbackAction
  | TransakServiceSetApiKeyAction
  | TransakServiceSetAccessTokenAction
  | TransakServiceClearAccessTokenAction
  | TransakServiceSendUserOtpAction
  | TransakServiceVerifyUserOtpAction
  | TransakServiceLogoutAction
  | TransakServiceGetUserDetailsAction
  | TransakServiceGetBuyQuoteAction
  | TransakServiceGetKycRequirementAction
  | TransakServiceGetAdditionalRequirementsAction
  | TransakServiceCreateOrderAction
  | TransakServiceGetOrderAction
  | TransakServiceGetUserLimitsAction
  | TransakServiceRequestOttAction
  | TransakServiceGeneratePaymentWidgetUrlAction
  | TransakServiceSubmitPurposeOfUsageFormAction
  | TransakServicePatchUserAction
  | TransakServiceSubmitSsnDetailsAction
  | TransakServiceConfirmPaymentAction
  | TransakServiceGetTranslationAction
  | TransakServiceGetIdProofStatusAction
  | TransakServiceCancelOrderAction
  | TransakServiceCancelAllActiveOrdersAction
  | TransakServiceGetActiveOrdersAction;

/**
 * Published when the state of {@link RampsController} changes.
 */
export type RampsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  RampsControllerState
>;

/**
 * Published when a V2 order's status transitions.
 * Consumed by mobile's init layer for notifications and analytics.
 */
export type RampsControllerOrderStatusChangedEvent = {
  type: `${typeof controllerName}:orderStatusChanged`;
  payload: [{ order: RampsOrder; previousStatus: RampsOrderStatus }];
};

/**
 * Events that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerEvents =
  | RampsControllerStateChangeEvent
  | RampsControllerOrderStatusChangedEvent;

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

// === ORDER POLLING CONSTANTS ===

const TERMINAL_ORDER_STATUSES = new Set<RampsOrderStatus>([
  RampsOrderStatus.Completed,
  RampsOrderStatus.Failed,
  RampsOrderStatus.Cancelled,
  RampsOrderStatus.IdExpired,
]);

const PENDING_ORDER_STATUSES = new Set<RampsOrderStatus>([
  RampsOrderStatus.Pending,
  RampsOrderStatus.Created,
  RampsOrderStatus.Unknown,
  RampsOrderStatus.Precreated,
]);

const DEFAULT_POLLING_INTERVAL_MS = 30_000;
const MAX_ERROR_COUNT = 5;

type OrderPollingMetadata = {
  lastTimeFetched: number;
  errorCount: number;
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
   * Count of in-flight requests per resource type.
   * Used so isLoading is only cleared when the last request for that resource finishes.
   */
  readonly #pendingResourceCount: Map<ResourceType, number> = new Map();

  readonly #orderPollingMeta: Map<string, OrderPollingMetadata> = new Map();

  #orderPollingTimer: ReturnType<typeof setInterval> | null = null;

  #isPolling = false;

  /**
   * Clears the pending resource count map. Used only in tests to exercise the
   * defensive path when get() returns undefined in the finally block.
   *
   * @internal
   */
  clearPendingResourceCountForTest(): void {
    this.#pendingResourceCount.clear();
  }

  #clearPendingResourceCountForDependentResources(): void {
    for (const resourceType of DEPENDENT_RESOURCE_KEYS) {
      this.#pendingResourceCount.delete(resourceType);
    }
  }

  #abortDependentRequests(): void {
    for (const [cacheKey, pending] of this.#pendingRequests.entries()) {
      if (
        pending.resourceType &&
        DEPENDENT_RESOURCE_KEYS_SET.has(pending.resourceType)
      ) {
        pending.abortController.abort();
        this.#pendingRequests.delete(cacheKey);
        this.#removeRequestState(cacheKey);
      }
    }
  }

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

    this.messenger.registerActionHandler(
      'RampsController:setSelectedToken',
      this.setSelectedToken.bind(this),
    );

    this.messenger.registerActionHandler(
      'RampsController:getQuotes',
      this.getQuotes.bind(this),
    );
  }

  /**
   * Executes a request with caching, deduplication, and at most one in-flight
   * request per resource type.
   *
   * 1. **Same cache key in flight** – If a request with this cache key is
   *    already pending, returns that promise (deduplication; no second request).
   *
   * 2. **Cache hit** – If valid, non-expired data exists in state.requests for
   *    this key and forceRefresh is not set, returns that data without fetching.
   *
   * 3. **New request** – Creates an AbortController and fires the fetcher.
   *    If options.resourceType is set, tags the pending request with that
   *    resource type (so #abortDependentRequests can cancel it on region
   *    change or cleanup) and ref-counts resource-level loading state.
   *    On success or error, updates request state and resource error;
   *    in finally, clears resource loading only if this request was not
   *    aborted.
   *
   * @param cacheKey - Unique identifier for this request (e.g. from createCacheKey).
   * @param fetcher - Async function that performs the fetch. Receives an AbortSignal
   *   that is aborted when this request is superseded by another for the same resource.
   * @param options - Optional forceRefresh, ttl, and resourceType for loading/error state.
   * @returns The result of the request (from cache, joined promise, or fetcher).
   */
  async executeRequest<TResult>(
    cacheKey: string,
    fetcher: (signal: AbortSignal) => Promise<TResult>,
    options?: ExecuteRequestOptions,
  ): Promise<TResult> {
    // Get TTL for verifying cache expiration
    const ttl = options?.ttl ?? this.#requestCacheTTL;

    // DEDUPLICATION:
    // Check if a request is already in flight for this cache key
    // If so, return the original promise for that request
    const pending = this.#pendingRequests.get(cacheKey);
    if (pending) {
      return pending.promise as Promise<TResult>;
    }

    // CACHE HIT:
    // If cache is not expired, return the cached data
    if (!options?.forceRefresh) {
      const cached = this.state.requests[cacheKey];
      if (cached && !isCacheExpired(cached, ttl)) {
        return cached.data as TResult;
      }
    }

    // Create a new abort controller for this request
    // Record the time the request was started
    const abortController = new AbortController();
    const lastFetchedAt = Date.now();
    const { resourceType } = options ?? {};

    // Update state to loading
    this.#updateRequestState(cacheKey, createLoadingState());

    // Set resource-level loading state (only on cache miss). Ref-count so concurrent
    // requests for the same resource type (different cache keys) keep isLoading true.
    if (resourceType) {
      const count = this.#pendingResourceCount.get(resourceType) ?? 0;
      this.#pendingResourceCount.set(resourceType, count + 1);
      if (count === 0) {
        this.#setResourceLoading(resourceType, true);
      }
    }

    // Create the fetch promise
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

        if (resourceType) {
          const isCurrent =
            !options?.isResultCurrent || options.isResultCurrent();
          if (isCurrent) {
            this.#setResourceError(resourceType, null);
          }
        }
        return data;
      } catch (error) {
        if (abortController.signal.aborted) {
          throw error;
        }

        const errorMessage = (error as Error)?.message ?? 'Unknown error';
        this.#updateRequestState(
          cacheKey,
          createErrorState(errorMessage, lastFetchedAt),
        );
        if (resourceType) {
          const isCurrent =
            !options?.isResultCurrent || options.isResultCurrent();
          if (isCurrent) {
            this.#setResourceError(resourceType, errorMessage);
          }
        }
        throw error;
      } finally {
        if (
          this.#pendingRequests.get(cacheKey)?.abortController ===
          abortController
        ) {
          this.#pendingRequests.delete(cacheKey);
        }

        // Clear resource-level loading state only when no requests for this resource remain
        if (resourceType && !abortController.signal.aborted) {
          const count = this.#pendingResourceCount.get(resourceType) ?? 0;
          const next = Math.max(0, count - 1);
          if (next === 0) {
            this.#pendingResourceCount.delete(resourceType);
            this.#setResourceLoading(resourceType, false);
          } else {
            this.#pendingResourceCount.set(resourceType, next);
          }
        }
      }
    })();

    this.#pendingRequests.set(cacheKey, {
      promise,
      abortController,
      resourceType,
    });

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
   * Mutates state.requests inside update(); cast is centralized here.
   *
   * @param fn - Callback that mutates the requests record.
   */
  #mutateRequests(
    fn: (requests: Record<string, RequestState | undefined>) => void,
  ): void {
    this.update((state) => {
      const requests = state.requests as unknown as Record<
        string,
        RequestState | undefined
      >;
      fn(requests);
    });
  }

  #removeRequestState(cacheKey: string): void {
    this.#mutateRequests((requests) => {
      delete requests[cacheKey];
    });
  }

  #cleanupState(): void {
    this.#abortDependentRequests();
    this.#clearPendingResourceCountForDependentResources();
    this.update((state) =>
      resetDependentResources(state, { clearUserRegionData: true }),
    );
  }

  /**
   * Executes a promise without awaiting, swallowing errors.
   * Errors are stored in state via executeRequest.
   *
   * @param promise - The promise to execute.
   */
  #fireAndForget<Result>(promise: Promise<Result>): void {
    promise.catch((_error: unknown) => undefined);
  }

  #requireRegion(): string {
    const regionCode = this.state.userRegion?.regionCode;
    if (!regionCode) {
      throw new Error(
        'Region is required. Cannot proceed without valid region information.',
      );
    }
    return regionCode;
  }

  #isRegionCurrent(normalizedRegion: string): boolean {
    const current = this.state.userRegion?.regionCode;
    return current === undefined || current === normalizedRegion;
  }

  #isTokenCurrent(normalizedAssetId: string): boolean {
    const current = this.state.tokens.selected?.assetId ?? '';
    return current === normalizedAssetId;
  }

  #isProviderCurrent(normalizedProviderId: string): boolean {
    const current = this.state.providers.selected?.id ?? '';
    return current === normalizedProviderId;
  }

  /**
   * Updates a single field (isLoading or error) on a resource state.
   * All resources share the same ResourceState structure, so we use
   * dynamic property access to avoid duplicating switch statements.
   *
   * @param resourceType - The type of resource.
   * @param field - The field to update ('isLoading' or 'error').
   * @param value - The value to set.
   */
  #updateResourceField(
    resourceType: ResourceType,
    field: 'isLoading' | 'error',
    value: boolean | string | null,
  ): void {
    this.update((state) => {
      const resource = state[resourceType];
      if (resource) {
        (resource as Record<string, unknown>)[field] = value;
      }
    });
  }

  /**
   * Sets the loading state for a resource type.
   *
   * @param resourceType - The type of resource.
   * @param loading - Whether the resource is loading.
   */
  #setResourceLoading(resourceType: ResourceType, loading: boolean): void {
    this.#updateResourceField(resourceType, 'isLoading', loading);
  }

  /**
   * Sets the error state for a resource type.
   *
   * @param resourceType - The type of resource.
   * @param error - The error message, or null to clear.
   */
  #setResourceError(resourceType: ResourceType, error: string | null): void {
    this.#updateResourceField(resourceType, 'error', error);
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
    this.#mutateRequests((requests) => {
      requests[cacheKey] = requestState;
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
      const remainingKeys = Object.keys(requests);
      if (remainingKeys.length > maxSize) {
        const sortedKeys = remainingKeys.sort((a, b) => {
          const aTime = requests[a]?.timestamp ?? 0;
          const bTime = requests[b]?.timestamp ?? 0;
          return aTime - bTime;
        });
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
      const countriesData = this.state.countries.data;
      if (!countriesData || countriesData.length === 0) {
        this.#cleanupState();
        throw new Error(
          'No countries found. Cannot set user region without valid country information.',
        );
      }

      const userRegion = findRegionFromCode(normalizedRegion, countriesData);

      if (!userRegion) {
        this.#cleanupState();
        throw new Error(
          `Region "${normalizedRegion}" not found in countries data. Cannot set user region without valid country information.`,
        );
      }

      const regionChanged =
        normalizedRegion !== this.state.userRegion?.regionCode;

      const needsRefetch =
        regionChanged ||
        !this.state.tokens.data ||
        this.state.providers.data.length === 0;

      if (regionChanged) {
        this.#abortDependentRequests();
        this.#clearPendingResourceCountForDependentResources();
      }
      this.update((state) => {
        if (regionChanged) {
          resetDependentResources(state);
        }
        state.userRegion = userRegion;
      });

      if (needsRefetch) {
        const refetchPromises: Promise<unknown>[] = [];
        if (regionChanged || !this.state.tokens.data) {
          refetchPromises.push(
            this.getTokens(userRegion.regionCode, 'buy', options),
          );
        }
        if (regionChanged || this.state.providers.data.length === 0) {
          refetchPromises.push(
            this.getProviders(userRegion.regionCode, options),
          );
        }
        if (refetchPromises.length > 0) {
          this.#fireAndForget(Promise.all(refetchPromises));
        }
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
        state.providers.selected = null;
        resetResource(state, 'paymentMethods');
      });
      return;
    }

    const regionCode = this.#requireRegion();
    const providers = this.state.providers.data;
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
      state.providers.selected = provider;
      resetResource(state, 'paymentMethods');
    });

    this.#fireAndForget(
      this.getPaymentMethods(regionCode, { provider: provider.id }),
    );
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
    const regionCode = this.#requireRegion();

    this.#fireAndForget(this.getTokens(regionCode, 'buy', options));
    this.#fireAndForget(this.getProviders(regionCode, options));
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
      { ...options, resourceType: 'countries' },
    );

    this.update((state) => {
      state.countries.data = Array.isArray(countries) ? [...countries] : [];
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
    const regionToUse = region ?? this.#requireRegion();

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
      {
        ...options,
        resourceType: 'tokens',
        isResultCurrent: () => this.#isRegionCurrent(normalizedRegion),
      },
    );

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.tokens.data = tokens;
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
        state.tokens.selected = null;
        resetResource(state, 'paymentMethods');
      });
      return;
    }

    const regionCode = this.#requireRegion();
    const tokens = this.state.tokens.data;
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
      state.tokens.selected = token;
      resetResource(state, 'paymentMethods');
    });

    this.#fireAndForget(
      this.getPaymentMethods(regionCode, { assetId: token.assetId }),
    );
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
    const regionToUse = region ?? this.#requireRegion();

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
      {
        ...options,
        resourceType: 'providers',
        isResultCurrent: () => this.#isRegionCurrent(normalizedRegion),
      },
    );

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.providers.data = providers;
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
    const regionCode = region ?? this.#requireRegion();
    const fiatToUse =
      options?.fiat ?? this.state.userRegion?.country?.currency ?? null;
    const assetIdToUse =
      options?.assetId ?? this.state.tokens.selected?.assetId ?? '';
    const providerToUse =
      options?.provider ?? this.state.providers.selected?.id ?? '';

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
      {
        ...options,
        resourceType: 'paymentMethods',
        isResultCurrent: () => {
          const regionMatch = this.#isRegionCurrent(normalizedRegion);
          const tokenMatch = this.#isTokenCurrent(assetIdToUse);
          const providerMatch = this.#isProviderCurrent(providerToUse);
          return regionMatch && tokenMatch && providerMatch;
        },
      },
    );

    this.update((state) => {
      const currentAssetId = state.tokens.selected?.assetId ?? '';
      const currentProviderId = state.providers.selected?.id ?? '';

      const tokenSelectionUnchanged = assetIdToUse === currentAssetId;
      const providerSelectionUnchanged = providerToUse === currentProviderId;

      // this is a race condition check to ensure that the selected token and provider in state are the same as the tokens we're requesting for
      // ex: if the user rapidly changes the token or provider, the in-flight payment methods might not be valid
      // so this check will ensure that the payment methods are still valid for the token and provider that were requested
      if (tokenSelectionUnchanged && providerSelectionUnchanged) {
        state.paymentMethods.data = response.payments;

        // this will auto-select the first payment method if the selected payment method is not in the new payment methods
        const currentSelectionStillValid = response.payments.some(
          (pm: PaymentMethod) => pm.id === state.paymentMethods.selected?.id,
        );
        if (!currentSelectionStillValid) {
          state.paymentMethods.selected = response.payments[0] ?? null;
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
        state.paymentMethods.selected = null;
      });
      return;
    }

    const paymentMethods = this.state.paymentMethods.data;
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
      state.paymentMethods.selected = paymentMethod;
    });
  }

  /**
   * Fetches quotes from all providers for a given set of parameters.
   * Uses the controller's request cache; callers manage the response in local state.
   *
   * @param options - The parameters for fetching quotes.
   * @param options.region - User's region code. If not provided, uses userRegion from state.
   * @param options.fiat - Fiat currency code. If not provided, uses userRegion currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.amount - The amount (in fiat for buy, crypto for sell).
   * @param options.walletAddress - The destination wallet address.
   * @param options.paymentMethods - Array of payment method IDs. If not provided, uses paymentMethods from state.
   * @param options.providers - Optional provider IDs to filter quotes.
   * @param options.redirectUrl - Optional redirect URL after order completion.
   * @param options.action - The ramp action type. Defaults to 'buy'.
   * @param options.forceRefresh - Whether to bypass cache.
   * @param options.ttl - Custom TTL for this request.
   * @returns The quotes response containing success, sorted, error, and customActions.
   */
  async getQuotes(options: {
    region?: string;
    fiat?: string;
    assetId?: string;
    amount: number;
    walletAddress: string;
    paymentMethods?: string[];
    providers?: string[];
    redirectUrl?: string;
    action?: RampAction;
    forceRefresh?: boolean;
    ttl?: number;
  }): Promise<QuotesResponse> {
    const regionToUse = options.region ?? this.#requireRegion();
    const fiatToUse = options.fiat ?? this.state.userRegion?.country?.currency;
    const paymentMethodsToUse =
      options.paymentMethods ??
      this.state.paymentMethods.data.map((pm: PaymentMethod) => pm.id);
    const providersToUse =
      options.providers ??
      this.state.providers.data.map((provider: Provider) => provider.id);
    const action = options.action ?? 'buy';
    const assetIdToUse = options.assetId ?? this.state.tokens.selected?.assetId;

    if (!fiatToUse) {
      throw new Error(
        'Fiat currency is required. Either provide a fiat parameter or ensure userRegion is set in controller state.',
      );
    }

    const normalizedAssetIdForValidation = (assetIdToUse ?? '').trim();
    if (normalizedAssetIdForValidation === '') {
      throw new Error('assetId is required.');
    }

    if (
      !paymentMethodsToUse ||
      paymentMethodsToUse.length === 0 ||
      paymentMethodsToUse.some((pm) => pm.trim() === '')
    ) {
      throw new Error(
        'Payment methods are required. Either provide paymentMethods parameter or ensure paymentMethods are set in controller state.',
      );
    }

    if (options.amount <= 0 || !Number.isFinite(options.amount)) {
      throw new Error('Amount must be a positive finite number.');
    }

    if (!options.walletAddress || options.walletAddress.trim() === '') {
      throw new Error('walletAddress is required.');
    }

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const normalizedFiat = fiatToUse.toLowerCase().trim();
    const normalizedAssetId = normalizedAssetIdForValidation;
    const normalizedWalletAddress = options.walletAddress.trim();

    const cacheKey = createCacheKey('getQuotes', [
      normalizedRegion,
      normalizedFiat,
      normalizedAssetId,
      options.amount,
      normalizedWalletAddress,
      [...paymentMethodsToUse].sort().join(','),
      [...providersToUse].sort().join(','),
      options.redirectUrl,
      action,
    ]);

    const params = {
      region: normalizedRegion,
      fiat: normalizedFiat,
      assetId: normalizedAssetId,
      amount: options.amount,
      walletAddress: normalizedWalletAddress,
      paymentMethods: paymentMethodsToUse,
      providers: providersToUse,
      redirectUrl: options.redirectUrl,
      action,
    };

    return this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getQuotes', params);
      },
      {
        forceRefresh: options.forceRefresh,
        ttl: options.ttl ?? DEFAULT_QUOTES_TTL,
      },
    );
  }

  // === ORDER MANAGEMENT ===

  /**
   * Adds or updates a V2 order in controller state.
   * If an order with the same providerOrderId already exists, the incoming
   * fields are merged on top of the existing order so that fields not present
   * in the update (e.g. paymentDetails from the Transak API) are preserved.
   *
   * @param order - The RampsOrder to add or update.
   */
  addOrder(order: RampsOrder): void {
    this.update((state) => {
      const idx = state.orders.findIndex(
        (existing) => existing.providerOrderId === order.providerOrderId,
      );
      if (idx === -1) {
        state.orders.push(order as Draft<RampsOrder>);
      } else {
        state.orders[idx] = {
          ...state.orders[idx],
          ...order,
        } as Draft<RampsOrder>;
      }
    });
  }

  /**
   * Removes a V2 order from controller state by providerOrderId.
   *
   * @param providerOrderId - The provider order ID to remove.
   */
  removeOrder(providerOrderId: string): void {
    this.update((state) => {
      state.orders = state.orders.filter(
        (order) => order.providerOrderId !== providerOrderId,
      );
    });

    this.#orderPollingMeta.delete(providerOrderId);
  }

  /**
   * Refreshes a single order via the V2 API and updates it in state.
   * Publishes orderStatusChanged if the status transitioned.
   *
   * @param order - The order to refresh (needs provider and providerOrderId).
   */
  async #refreshOrder(order: RampsOrder): Promise<void> {
    const providerCode = order.provider?.id ?? '';
    if (!providerCode || !order.providerOrderId || !order.walletAddress) {
      return;
    }

    const providerCodeSegment = providerCode.replace('/providers/', '');
    const previousStatus = order.status;

    try {
      const updatedOrder = await this.getOrder(
        providerCodeSegment,
        order.providerOrderId,
        order.walletAddress,
      );

      const meta = this.#orderPollingMeta.get(order.providerOrderId) ?? {
        lastTimeFetched: 0,
        errorCount: 0,
      };

      if (updatedOrder.status === RampsOrderStatus.Unknown) {
        meta.errorCount = Math.min(meta.errorCount + 1, MAX_ERROR_COUNT);
      } else {
        meta.errorCount = 0;
      }

      meta.lastTimeFetched = Date.now();
      this.#orderPollingMeta.set(order.providerOrderId, meta);

      if (
        previousStatus !== updatedOrder.status &&
        previousStatus !== undefined
      ) {
        this.messenger.publish('RampsController:orderStatusChanged', {
          order: updatedOrder,
          previousStatus,
        });
      }

      if (TERMINAL_ORDER_STATUSES.has(updatedOrder.status)) {
        this.#orderPollingMeta.delete(order.providerOrderId);
      }
    } catch {
      const meta = this.#orderPollingMeta.get(order.providerOrderId) ?? {
        lastTimeFetched: 0,
        errorCount: 0,
      };
      meta.errorCount = Math.min(meta.errorCount + 1, MAX_ERROR_COUNT);
      meta.lastTimeFetched = Date.now();
      this.#orderPollingMeta.set(order.providerOrderId, meta);
    }
  }

  /**
   * Starts polling all pending V2 orders at a fixed interval.
   * Each poll cycle iterates orders with non-terminal statuses,
   * respects pollingSecondsMinimum and backoff from error count.
   */
  startOrderPolling(): void {
    if (this.#orderPollingTimer) {
      return;
    }

    this.#orderPollingTimer = setInterval(() => {
      this.#pollPendingOrders().catch(() => undefined);
    }, DEFAULT_POLLING_INTERVAL_MS);

    this.#pollPendingOrders().catch(() => undefined);
  }

  /**
   * Stops order polling and clears the interval.
   */
  stopOrderPolling(): void {
    if (this.#orderPollingTimer) {
      clearInterval(this.#orderPollingTimer);
      this.#orderPollingTimer = null;
    }
  }

  async #pollPendingOrders(): Promise<void> {
    if (this.#isPolling) {
      return;
    }
    this.#isPolling = true;
    try {
      const pendingOrders = this.state.orders.filter((order) =>
        PENDING_ORDER_STATUSES.has(order.status),
      );

      const now = Date.now();

      await Promise.allSettled(
        pendingOrders.map(async (order) => {
          const meta = this.#orderPollingMeta.get(order.providerOrderId);

          if (meta) {
            const backoffMs =
              meta.errorCount > 0
                ? Math.min(
                    DEFAULT_POLLING_INTERVAL_MS *
                      Math.pow(2, meta.errorCount - 1),
                    5 * 60 * 1000,
                  )
                : 0;

            const pollingMinMs = (order.pollingSecondsMinimum ?? 0) * 1000;
            const minWait = Math.max(backoffMs, pollingMinMs);

            if (now - meta.lastTimeFetched < minWait) {
              return;
            }
          }

          await this.#refreshOrder(order);
        }),
      );
    } finally {
      this.#isPolling = false;
    }
  }

  /**
   * Cleans up controller resources.
   * Should be called when the controller is no longer needed.
   */
  override destroy(): void {
    this.stopOrderPolling();
    super.destroy();
  }

  /**
   * Fetches the widget URL from a quote for redirect providers.
   * Makes a request to the buyURL endpoint via the RampsService to get the
   * actual provider widget URL.
   *
   * @param quote - The quote to fetch the widget URL from.
   * @returns Promise resolving to the widget URL string, or null if not available.
   */
  async getWidgetUrl(quote: Quote): Promise<string | null> {
    const buyUrl = quote.quote?.buyURL;
    if (!buyUrl) {
      return null;
    }

    try {
      const buyWidget = await this.messenger.call(
        'RampsService:getBuyWidgetUrl',
        buyUrl,
      );
      return buyWidget.url ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches an order from the unified V2 API endpoint.
   * Returns a normalized RampsOrder for all provider types (aggregator and native).
   *
   * @param providerCode - The provider code (e.g., "transak", "transak-native", "moonpay").
   * @param orderCode - The order identifier.
   * @param wallet - The wallet address associated with the order.
   * @returns The unified order data.
   */
  async getOrder(
    providerCode: string,
    orderCode: string,
    wallet: string,
  ): Promise<RampsOrder> {
    const order = await this.messenger.call(
      'RampsService:getOrder',
      providerCode,
      orderCode,
      wallet,
    );

    this.update((state) => {
      const idx = state.orders.findIndex(
        (existing) => existing.providerOrderId === orderCode,
      );
      if (idx !== -1) {
        state.orders[idx] = {
          ...state.orders[idx],
          ...order,
        } as Draft<RampsOrder>;
      }
    });

    return order;
  }

  /**
   * Extracts an order from a provider callback URL.
   * Sends the callback URL to the V2 backend for provider-specific parsing,
   * then fetches the full order. This is the V2 equivalent of the aggregator
   * SDK's `getOrderFromCallback`.
   *
   * @param providerCode - The provider code (e.g., "transak", "moonpay").
   * @param callbackUrl - The full callback URL the provider redirected to.
   * @param wallet - The wallet address associated with the order.
   * @returns The unified order data.
   */
  async getOrderFromCallback(
    providerCode: string,
    callbackUrl: string,
    wallet: string,
  ): Promise<RampsOrder> {
    return await this.messenger.call(
      'RampsService:getOrderFromCallback',
      providerCode,
      callbackUrl,
      wallet,
    );
  }

  // === TRANSAK METHODS ===
  //
  // Auth state is managed at two levels:
  // - TransakService stores the access token (needed for API calls)
  // - RampsController stores isAuthenticated (needed for UI state)
  // Both are kept in sync by the controller methods below.

  /**
   * Checks whether an error is a 401 HTTP error (expired/missing token) and,
   * if so, marks the Transak session as unauthenticated so the UI stays in
   * sync with the cleared token inside TransakService.
   *
   * @param error - The caught error to inspect.
   */
  #syncTransakAuthOnError(error: unknown): void {
    if (
      error instanceof Error &&
      'httpStatus' in error &&
      (error as Error & { httpStatus: number }).httpStatus === 401
    ) {
      this.transakSetAuthenticated(false);
    }
  }

  /**
   * Sets the Transak API key used for all Transak API requests.
   *
   * @param apiKey - The Transak API key.
   */
  transakSetApiKey(apiKey: string): void {
    this.messenger.call('TransakService:setApiKey', apiKey);
  }

  /**
   * Sets the Transak access token and marks the user as authenticated.
   *
   * @param token - The access token received from Transak auth.
   */
  transakSetAccessToken(token: TransakAccessToken): void {
    this.messenger.call('TransakService:setAccessToken', token);
    this.transakSetAuthenticated(true);
  }

  /**
   * Clears the Transak access token and marks the user as unauthenticated.
   */
  transakClearAccessToken(): void {
    this.messenger.call('TransakService:clearAccessToken');
    this.transakSetAuthenticated(false);
  }

  /**
   * Updates the Transak authentication flag in controller state.
   *
   * @param isAuthenticated - Whether the user is authenticated with Transak.
   */
  transakSetAuthenticated(isAuthenticated: boolean): void {
    this.update((state) => {
      state.nativeProviders.transak.isAuthenticated = isAuthenticated;
    });
  }

  /**
   * Resets all Transak state back to defaults (unauthenticated, no data).
   */
  transakResetState(): void {
    this.messenger.call('TransakService:clearAccessToken');
    this.update((state) => {
      state.nativeProviders.transak =
        getDefaultRampsControllerState().nativeProviders.transak;
    });
  }

  /**
   * Sends a one-time password to the user's email for Transak authentication.
   *
   * @param email - The user's email address.
   * @returns The OTP response containing a state token for verification.
   */
  async transakSendUserOtp(email: string): Promise<{
    isTncAccepted: boolean;
    stateToken: string;
    email: string;
    expiresIn: number;
  }> {
    return this.messenger.call('TransakService:sendUserOtp', email);
  }

  /**
   * Verifies a one-time password and authenticates the user with Transak.
   * Updates the controller's authentication state on success.
   *
   * @param email - The user's email address.
   * @param verificationCode - The OTP code entered by the user.
   * @param stateToken - The state token from the sendUserOtp response.
   * @returns The access token for subsequent authenticated requests.
   */
  async transakVerifyUserOtp(
    email: string,
    verificationCode: string,
    stateToken: string,
  ): Promise<TransakAccessToken> {
    const token = await this.messenger.call(
      'TransakService:verifyUserOtp',
      email,
      verificationCode,
      stateToken,
    );
    this.transakSetAuthenticated(true);
    return token;
  }

  /**
   * Logs the user out of Transak. Clears authentication state and user details
   * regardless of whether the API call succeeds or fails.
   *
   * @returns A message indicating the logout result.
   */
  async transakLogout(): Promise<string> {
    try {
      const result = await this.messenger.call('TransakService:logout');
      return result;
    } finally {
      this.transakClearAccessToken();
      this.update((state) => {
        state.nativeProviders.transak.userDetails.data = null;
      });
    }
  }

  /**
   * Fetches the authenticated user's details from Transak.
   * Updates the userDetails resource state with loading/success/error states.
   *
   * @returns The user's profile and KYC details.
   */
  async transakGetUserDetails(): Promise<TransakUserDetails> {
    this.update((state) => {
      state.nativeProviders.transak.userDetails.isLoading = true;
      state.nativeProviders.transak.userDetails.error = null;
    });
    try {
      const details = await this.messenger.call(
        'TransakService:getUserDetails',
      );
      this.update((state) => {
        state.nativeProviders.transak.userDetails.data = details;
        state.nativeProviders.transak.userDetails.isLoading = false;
      });
      return details;
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      const errorMessage = (error as Error)?.message ?? 'Unknown error';
      this.update((state) => {
        state.nativeProviders.transak.userDetails.isLoading = false;
        state.nativeProviders.transak.userDetails.error = errorMessage;
      });
      throw error;
    }
  }

  /**
   * Fetches a buy quote from Transak for the given parameters.
   * Updates the buyQuote resource state with loading/success/error states.
   *
   * @param fiatCurrency - The fiat currency code (e.g., "USD").
   * @param cryptoCurrency - The cryptocurrency identifier.
   * @param network - The blockchain network identifier.
   * @param paymentMethod - The payment method identifier.
   * @param fiatAmount - The fiat amount as a string.
   * @returns The buy quote with pricing and fee details.
   */
  async transakGetBuyQuote(
    fiatCurrency: string,
    cryptoCurrency: string,
    network: string,
    paymentMethod: string,
    fiatAmount: string,
  ): Promise<TransakBuyQuote> {
    this.update((state) => {
      state.nativeProviders.transak.buyQuote.isLoading = true;
      state.nativeProviders.transak.buyQuote.error = null;
    });
    try {
      const quote = await this.messenger.call(
        'TransakService:getBuyQuote',
        fiatCurrency,
        cryptoCurrency,
        network,
        paymentMethod,
        fiatAmount,
      );
      this.update((state) => {
        state.nativeProviders.transak.buyQuote.data = quote;
        state.nativeProviders.transak.buyQuote.isLoading = false;
      });
      return quote;
    } catch (error) {
      const errorMessage = (error as Error)?.message ?? 'Unknown error';
      this.update((state) => {
        state.nativeProviders.transak.buyQuote.isLoading = false;
        state.nativeProviders.transak.buyQuote.error = errorMessage;
      });
      throw error;
    }
  }

  /**
   * Fetches the KYC requirement for a given quote.
   * Updates the kycRequirement resource state with loading/success/error states.
   *
   * @param quoteId - The quote ID to check KYC requirements for.
   * @returns The KYC requirement status and whether the user can place an order.
   */
  async transakGetKycRequirement(
    quoteId: string,
  ): Promise<TransakKycRequirement> {
    this.update((state) => {
      state.nativeProviders.transak.kycRequirement.isLoading = true;
      state.nativeProviders.transak.kycRequirement.error = null;
    });
    try {
      const requirement = await this.messenger.call(
        'TransakService:getKycRequirement',
        quoteId,
      );
      this.update((state) => {
        state.nativeProviders.transak.kycRequirement.data = requirement;
        state.nativeProviders.transak.kycRequirement.isLoading = false;
      });
      return requirement;
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      const errorMessage = (error as Error)?.message ?? 'Unknown error';
      this.update((state) => {
        state.nativeProviders.transak.kycRequirement.isLoading = false;
        state.nativeProviders.transak.kycRequirement.error = errorMessage;
      });
      throw error;
    }
  }

  /**
   * Fetches additional KYC requirements (e.g., ID proof, address proof) for a quote.
   *
   * @param quoteId - The quote ID to check additional requirements for.
   * @returns The list of additional forms required.
   */
  async transakGetAdditionalRequirements(
    quoteId: string,
  ): Promise<TransakAdditionalRequirementsResponse> {
    try {
      return await this.messenger.call(
        'TransakService:getAdditionalRequirements',
        quoteId,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Creates a new order on Transak. If an existing order conflicts (HTTP 409),
   * active orders are cancelled and the creation is retried.
   *
   * @param quoteId - The quote ID to create an order from.
   * @param walletAddress - The destination wallet address.
   * @param paymentMethodId - The payment method to use.
   * @returns The created deposit order.
   */
  async transakCreateOrder(
    quoteId: string,
    walletAddress: string,
    paymentMethodId: string,
  ): Promise<TransakDepositOrder> {
    try {
      return await this.messenger.call(
        'TransakService:createOrder',
        quoteId,
        walletAddress,
        paymentMethodId,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Fetches an existing order from Transak by order ID.
   *
   * @param orderId - The order ID (deposit format or raw Transak format).
   * @param wallet - The wallet address associated with the order.
   * @param paymentDetails - Optional payment details to attach to the order.
   * @returns The deposit order details.
   */
  async transakGetOrder(
    orderId: string,
    wallet: string,
    paymentDetails?: TransakOrderPaymentMethod[],
  ): Promise<TransakDepositOrder> {
    return this.messenger.call(
      'TransakService:getOrder',
      orderId,
      wallet,
      paymentDetails,
    );
  }

  /**
   * Fetches the user's spending limits for a given currency and payment method.
   *
   * @param fiatCurrency - The fiat currency code.
   * @param paymentMethod - The payment method identifier.
   * @param kycType - The KYC level type.
   * @returns The user's limits, spending, and remaining amounts.
   */
  async transakGetUserLimits(
    fiatCurrency: string,
    paymentMethod: string,
    kycType: string,
  ): Promise<TransakUserLimits> {
    try {
      return await this.messenger.call(
        'TransakService:getUserLimits',
        fiatCurrency,
        paymentMethod,
        kycType,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Requests a one-time token (OTT) for the Transak payment widget.
   *
   * @returns The OTT response containing the token.
   */
  async transakRequestOtt(): Promise<TransakOttResponse> {
    try {
      return await this.messenger.call('TransakService:requestOtt');
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Generates a URL for the Transak payment widget with pre-filled parameters.
   *
   * @param ottToken - The one-time token for widget authentication.
   * @param quote - The buy quote to pre-fill in the widget.
   * @param walletAddress - The destination wallet address.
   * @param extraParams - Optional additional URL parameters.
   * @returns The fully constructed widget URL string.
   */
  transakGeneratePaymentWidgetUrl(
    ottToken: string,
    quote: TransakBuyQuote,
    walletAddress: string,
    extraParams?: Record<string, string>,
  ): string {
    return this.messenger.call(
      'TransakService:generatePaymentWidgetUrl',
      ottToken,
      quote,
      walletAddress,
      extraParams,
    );
  }

  /**
   * Submits the user's purpose of usage form for KYC compliance.
   *
   * @param purpose - Array of purpose strings selected by the user.
   * @returns A promise that resolves when the form is submitted.
   */
  async transakSubmitPurposeOfUsageForm(purpose: string[]): Promise<void> {
    try {
      return await this.messenger.call(
        'TransakService:submitPurposeOfUsageForm',
        purpose,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Updates the user's personal or address details on Transak.
   *
   * @param data - The user data fields to update.
   * @returns The API response data.
   */
  async transakPatchUser(data: PatchUserRequestBody): Promise<unknown> {
    try {
      return await this.messenger.call('TransakService:patchUser', data);
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Submits the user's SSN for identity verification.
   *
   * @param ssn - The Social Security Number.
   * @param quoteId - The quote ID associated with the order requiring SSN.
   * @returns The API response data.
   */
  async transakSubmitSsnDetails(
    ssn: string,
    quoteId: string,
  ): Promise<unknown> {
    try {
      return await this.messenger.call(
        'TransakService:submitSsnDetails',
        ssn,
        quoteId,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Confirms payment for an order after the user has completed payment.
   *
   * @param orderId - The order ID to confirm payment for.
   * @param paymentMethodId - The payment method used.
   * @returns Whether the payment confirmation was successful.
   */
  async transakConfirmPayment(
    orderId: string,
    paymentMethodId: string,
  ): Promise<{ success: boolean }> {
    try {
      return await this.messenger.call(
        'TransakService:confirmPayment',
        orderId,
        paymentMethodId,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Translates generic ramps identifiers to Transak-specific identifiers.
   *
   * @param request - The translation request with optional identifiers to translate.
   * @returns The translated Transak-specific identifiers.
   */
  async transakGetTranslation(
    request: TransakTranslationRequest,
  ): Promise<TransakQuoteTranslation> {
    return this.messenger.call('TransakService:getTranslation', request);
  }

  /**
   * Checks the status of an ID proof submission for KYC.
   *
   * @param workFlowRunId - The workflow run ID to check status for.
   * @returns The current ID proof status.
   */
  async transakGetIdProofStatus(
    workFlowRunId: string,
  ): Promise<TransakIdProofStatus> {
    try {
      return await this.messenger.call(
        'TransakService:getIdProofStatus',
        workFlowRunId,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Cancels a specific Transak order.
   *
   * @param depositOrderId - The deposit order ID to cancel.
   * @returns A promise that resolves when the order is cancelled.
   */
  async transakCancelOrder(depositOrderId: string): Promise<void> {
    try {
      return await this.messenger.call(
        'TransakService:cancelOrder',
        depositOrderId,
      );
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Cancels all active Transak orders. Individual cancellation failures
   * are collected and returned rather than thrown.
   *
   * @returns An array of errors from any failed cancellations (empty if all succeeded).
   */
  async transakCancelAllActiveOrders(): Promise<Error[]> {
    try {
      return await this.messenger.call('TransakService:cancelAllActiveOrders');
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }

  /**
   * Fetches all active Transak orders for the authenticated user.
   *
   * @returns The list of active orders.
   */
  async transakGetActiveOrders(): Promise<TransakOrder[]> {
    try {
      return await this.messenger.call('TransakService:getActiveOrders');
    } catch (error) {
      this.#syncTransakAuthOnError(error);
      throw error;
    }
  }
}
