import {
  BaseDataService,
  BrokenCircuitError,
  ExponentialBackoff,
  handleWhen,
} from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
  QueryStateChangeHandler,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Struct } from '@metamask/superstruct';

import type { AccountsApiBalancesServiceMethodActions } from './accounts-api-balances-service-method-action-types.js';
import {
  V5BalancesResponseStruct,
  V6BalancesResponseStruct,
} from './structs.js';
import type { BalancesResponse } from './structs.js';

// === GENERAL ===

/**
 * The name of the {@link AccountsApiBalancesService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'AccountsApiBalancesService';

/** The production Accounts API base URL (same as `API_URLS.ACCOUNTS`). */
const DEFAULT_BASE_URL = 'https://accounts.api.cx.metamask.io';

/** How long a balances response is served from cache (`STALE_TIMES.BALANCES`). */
const DEFAULT_STALE_TIME_MS = 60 * 1000;

/** How long an unused balances response stays in memory (`GC_TIMES.DEFAULT`). */
const DEFAULT_GC_TIME_MS = 5 * 60 * 1000;

/** How long to wait for the bearer token (`DEFAULT_AUTH_TOKEN_TIMEOUT`). */
const DEFAULT_AUTH_TOKEN_TIMEOUT_MS = 500;

/** How long the circuit stays open once it breaks. */
const DEFAULT_CIRCUIT_BREAK_DURATION_MS = 60 * 1000;

/**
 * Reads the HTTP status carried by an error, if any.
 *
 * `HttpError` carries `httpStatus`. The `status` fallback is load bearing: an
 * injected `fetch` may reject with its own error type that only carries
 * `status`, and without it such a 4xx would be retried and counted toward the
 * circuit breaker.
 *
 * @param error - The thrown value.
 * @returns The `httpStatus` (or `status`) of the error, if present.
 */
function getErrorStatus(error: unknown): unknown {
  const candidate = error as
    | { httpStatus?: unknown; status?: unknown }
    | null
    | undefined;
  return candidate?.httpStatus ?? candidate?.status;
}

/**
 * Whether an error is a client error that a retry cannot fix (any 4xx other
 * than 408 and 429).
 *
 * @param error - The thrown value.
 * @returns True if the error should not be retried.
 */
function isNonRetryableClientError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

/**
 * Builds the default policy options. Errors without a numeric status (network
 * errors), 5xx, 408 and 429 count toward the circuit breaker and are retried;
 * other 4xx and `BrokenCircuitError` are neither.
 *
 * @returns The default policy options.
 */
function getDefaultPolicyOptions(): CreateServicePolicyOptions {
  return {
    maxRetries: 3,
    retryFilterPolicy: handleWhen(
      (error) =>
        !(error instanceof BrokenCircuitError) &&
        !isNonRetryableClientError(error),
    ),
    backoff: new ExponentialBackoff({ initialDelay: 1000, maxDelay: 5000 }),
    isServiceFailure: (error) => {
      const status = getErrorStatus(error);
      return (
        typeof status !== 'number' ||
        status >= 500 ||
        status === 408 ||
        status === 429
      );
    },
    circuitBreakDuration: DEFAULT_CIRCUIT_BREAK_DURATION_MS,
  };
}

/**
 * Generates a short random value for the `bypassServerCache` query parameter,
 * exactly as the core backend Accounts API client does. The API's server side
 * cache keys on the full URL, so a unique value forces a cache miss.
 *
 * @returns An 8 character alphanumeric string.
 */
function generateBypassServerCache(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

/**
 * Returns a sorted copy of a list, or `null` when it is absent, so it can be
 * used in a query key.
 *
 * @param list - The list to sort.
 * @returns The sorted copy, or `null`.
 */
function sortedOrNull(list: string[] | undefined): string[] | null {
  return list ? [...list].sort() : null;
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['fetchBalances'] as const;

/**
 * Invalidates cached queries for {@link AccountsApiBalancesService}.
 */
export type AccountsApiBalancesServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link AccountsApiBalancesService} exposes to other consumers.
 */
export type AccountsApiBalancesServiceActions =
  | AccountsApiBalancesServiceMethodActions
  | AccountsApiBalancesServiceInvalidateQueriesAction;

/**
 * Retrieves a bearer token from the `AuthenticationController`.
 */
type AuthenticationControllerGetBearerTokenAction = {
  type: 'AuthenticationController:getBearerToken';
  handler: (entropySourceId?: string) => Promise<string>;
};

/**
 * Actions from other messengers that {@link AccountsApiBalancesService}
 * calls.
 */
type AllowedActions = AuthenticationControllerGetBearerTokenAction;

/**
 * Published when {@link AccountsApiBalancesService}'s cache is updated.
 */
export type AccountsApiBalancesServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link AccountsApiBalancesService}'s cache is
 * updated.
 */
export type AccountsApiBalancesServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link AccountsApiBalancesService} exposes to other consumers.
 */
export type AccountsApiBalancesServiceEvents =
  | AccountsApiBalancesServiceCacheUpdatedEvent
  | AccountsApiBalancesServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link AccountsApiBalancesService}
 * subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link AccountsApiBalancesService}.
 */
export type AccountsApiBalancesServiceMessenger = Messenger<
  typeof serviceName,
  AccountsApiBalancesServiceActions | AllowedActions,
  AccountsApiBalancesServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Options accepted by {@link AccountsApiBalancesService.fetchBalances}.
 */
export type FetchBalancesOptions = {
  /** Which multi account balances endpoint to call. */
  version: 'v5' | 'v6';
  /** CAIP-10 account IDs to fetch balances for. */
  accountIds: string[];
  /** CAIP-19 asset IDs the backend must always return (v6 only). */
  includeAssetIds?: string[];
  /** CAIP-19 asset IDs the backend must drop (v6 only). */
  excludeAssetIds?: string[];
  /** CAIP-2 chain IDs to restrict the response to. */
  networks?: string[];
  /** When true, ignores any cached result and fetches fresh data. */
  forceUpdate?: boolean;
  /**
   * When true, adds a random `bypassServerCache` query parameter so the API's
   * own cache is skipped too. Such fetches use their own cache entry and are
   * never served from the cache.
   */
  bypassServerCache?: boolean;
  /**
   * Called with the state of the underlying query as it changes. See
   * {@link QueryStateChangeHandler}.
   */
  onQueryStateChange?: QueryStateChangeHandler;
};

/**
 * Data service that fetches multi account balances from the Accounts API v5
 * and v6 endpoints.
 *
 * It sends the same request as the core backend `ApiPlatformClient` (URL,
 * query parameters and headers), wraps it in a service policy, and validates
 * the response before returning it. It has no persistence.
 */
export class AccountsApiBalancesService extends BaseDataService<
  typeof serviceName,
  AccountsApiBalancesServiceMessenger
> {
  readonly #fetch: typeof globalThis.fetch;

  readonly #baseUrl: string;

  readonly #clientProduct: string;

  readonly #clientVersion: string | undefined;

  readonly #authTokenTimeout: number;

  readonly #staleTime: number;

  readonly #gcTime: number;

  /**
   * Constructs a new {@link AccountsApiBalancesService}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * @param args.clientProduct - Sent as the `x-metamask-clientproduct` header.
   * @param args.clientVersion - Sent as the `x-metamask-clientversion` header
   * when set.
   * @param args.baseUrl - The Accounts API base URL. Defaults to production.
   * @param args.authTokenTimeout - How long to wait for the bearer token, in
   * milliseconds, before sending the request without it. 0 waits forever.
   * Defaults to 500.
   * @param args.staleTime - How long a response is served from cache, in
   * milliseconds. Defaults to 1 minute.
   * @param args.gcTime - How long an unused response stays in memory, in
   * milliseconds. Defaults to 5 minutes.
   * @param args.policyOptions - Overrides for the default policy options
   * passed to `createServicePolicy`. See {@link CreateServicePolicyOptions}.
   * Each override replaces the default for that key as a whole, so passing
   * `retryFilterPolicy` or `isServiceFailure` drops the default
   * `BrokenCircuitError` and 4xx handling. One policy, and so one circuit
   * breaker, is shared by v5, v6 and every query key of a service instance:
   * once it trips, both versions fail fast for the break duration (balances
   * then fall back to RPC).
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    clientProduct,
    clientVersion,
    baseUrl = DEFAULT_BASE_URL,
    authTokenTimeout = DEFAULT_AUTH_TOKEN_TIMEOUT_MS,
    staleTime = DEFAULT_STALE_TIME_MS,
    gcTime = DEFAULT_GC_TIME_MS,
    policyOptions = {},
  }: {
    messenger: AccountsApiBalancesServiceMessenger;
    fetch: typeof globalThis.fetch;
    clientProduct: string;
    clientVersion?: string;
    baseUrl?: string;
    authTokenTimeout?: number;
    staleTime?: number;
    gcTime?: number;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      policyOptions: { ...getDefaultPolicyOptions(), ...policyOptions },
    });
    this.#fetch = fetchFunction;
    this.#baseUrl = baseUrl;
    this.#clientProduct = clientProduct;
    this.#clientVersion = clientVersion;
    this.#authTokenTimeout = authTokenTimeout;
    this.#staleTime = staleTime;
    this.#gcTime = gcTime;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches balances for the given accounts from the Accounts API v5 or v6
   * multi account balances endpoint. Serves from cache when fresh, and shares
   * one request between concurrent identical calls.
   *
   * @param options - The fetch options. See {@link FetchBalancesOptions}.
   * @returns The validated balances response.
   */
  async fetchBalances(
    options: FetchBalancesOptions,
  ): Promise<BalancesResponse> {
    const {
      version,
      accountIds,
      includeAssetIds,
      excludeAssetIds,
      networks,
      forceUpdate = false,
      bypassServerCache = false,
      onQueryStateChange,
    } = options;

    if (accountIds.length === 0) {
      return version === 'v6'
        ? {
            unprocessedNetworks: [],
            unprocessedIncludeAssetIds: [],
            balances: [],
          }
        : { count: 0, unprocessedNetworks: [], balances: [] };
    }

    const queryKey = [
      `${this.name}:fetchBalances`,
      version,
      [...accountIds].sort(),
      {
        // v5 never sends these lists, so they stay out of its key.
        includeAssetIds:
          version === 'v6' ? sortedOrNull(includeAssetIds) : null,
        excludeAssetIds:
          version === 'v6' ? sortedOrNull(excludeAssetIds) : null,
        networks: sortedOrNull(networks),
        bypassServerCache,
      },
    ] as const;

    if (forceUpdate) {
      await this.invalidateQueries({
        queryKey,
        exact: true,
        refetchType: 'none',
      });
    }

    const responseStruct = (version === 'v6'
      ? V6BalancesResponseStruct
      : V5BalancesResponseStruct) as unknown as Struct<BalancesResponse>;

    return await this.fetchQuery({
      queryKey,
      responseStruct,
      staleTime: bypassServerCache ? 0 : this.#staleTime,
      gcTime: this.#gcTime,
      onQueryStateChange,
      queryFn: async () => {
        const url = this.#buildUrl(version, {
          accountIds,
          networks,
          ...(version === 'v6' ? { includeAssetIds, excludeAssetIds } : {}),
          bypassServerCache: bypassServerCache
            ? generateBypassServerCache()
            : undefined,
        });
        const response = await this.#fetch(url, {
          method: 'GET',
          headers: await this.#buildHeaders(),
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Accounts API ${version} balances request failed with status '${response.status}'`,
          );
        }
        return (await response.json()) as BalancesResponse;
      },
    });
  }

  /**
   * Builds the request URL. Mirrors the core backend client: undefined
   * parameters are skipped and arrays are joined with commas.
   *
   * @param version - The endpoint version.
   * @param params - The query parameters, in the order the client sends them.
   * @returns The request URL.
   */
  #buildUrl(
    version: 'v5' | 'v6',
    params: Record<string, string | string[] | undefined>,
  ): string {
    const url = new URL(`/${version}/multiaccount/balances`, this.#baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    return url.toString();
  }

  /**
   * Builds the request headers, as the core backend client does.
   *
   * @returns The request headers.
   */
  async #buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-metamask-clientproduct': this.#clientProduct,
    };
    if (this.#clientVersion) {
      headers['x-metamask-clientversion'] = this.#clientVersion;
    }
    const token = await this.#getBearerToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Resolves the bearer token, giving up after `authTokenTimeout` so a slow
   * token provider does not delay the request. Without a token in time, the
   * request goes out unauthenticated, as with the core backend client.
   *
   * @returns The bearer token, or undefined if unavailable in time.
   */
  async #getBearerToken(): Promise<string | undefined> {
    const tokenPromise = (async (): Promise<string | undefined> =>
      this.messenger.call('AuthenticationController:getBearerToken'))().catch(
      () => undefined,
    );

    if (this.#authTokenTimeout <= 0) {
      return await tokenPromise;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<undefined>((resolve) => {
      timeoutId = setTimeout(() => resolve(undefined), this.#authTokenTimeout);
    });

    try {
      return await Promise.race([tokenPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
