import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { SDK } from '@metamask/profile-sync-controller';
import type { IDisposable } from 'cockatiel';

import type { GeolocationApiServiceMethodActions } from './geolocation-api-service-method-action-types';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const ENDPOINT_PATH = '/geolocation';

// === GENERAL ===

/**
 * The name of the {@link GeolocationApiService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'GeolocationApiService';

/**
 * Sentinel value used when the geolocation has not been determined yet or when
 * the API returns an empty / invalid response.
 */
export const UNKNOWN_LOCATION = 'UNKNOWN';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['fetchGeolocation'] as const;

/**
 * Actions that {@link GeolocationApiService} exposes to other consumers.
 */
export type GeolocationApiServiceActions = GeolocationApiServiceMethodActions;

/**
 * Actions from other messengers that {@link GeolocationApiServiceMessenger}
 * calls.
 */
type AllowedActions = never;

/**
 * Events that {@link GeolocationApiService} exposes to other consumers.
 */
export type GeolocationApiServiceEvents = never;

/**
 * Events from other messengers that {@link GeolocationApiService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link GeolocationApiService}.
 */
export type GeolocationApiServiceMessenger = Messenger<
  typeof serviceName,
  GeolocationApiServiceActions | AllowedActions,
  GeolocationApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Returns the base URL for the geolocation API for the given environment.
 *
 * @param env - The environment to get the URL for.
 * @returns The full URL for the geolocation endpoint.
 */
function getGeolocationUrl(env: SDK.Env): string {
  const envPrefix = env === SDK.Env.PRD ? '' : `${env}-`;
  return `https://on-ramp.${envPrefix}api.cx.metamask.io${ENDPOINT_PATH}`;
}

/**
 * Options accepted by {@link GeolocationApiService.fetchGeolocation}.
 */
export type FetchGeolocationOptions = {
  /** When true, the TTL cache is bypassed and a fresh network request is made. */
  bypassCache?: boolean;
};

/**
 * Low-level data service that fetches a country code from the geolocation API.
 *
 * Responsibilities:
 * - HTTP request to the geolocation endpoint (wrapped in a service policy)
 * - ISO 3166-1 alpha-2 response validation
 * - TTL-based in-memory cache
 * - Promise deduplication (concurrent callers share a single in-flight request)
 * - Race-condition prevention via a generation counter
 *
 * This class is intentionally not a controller: it does not manage UI state.
 * Its {@link fetchGeolocation} method is automatically registered on the
 * messenger so that controllers and other packages can call it directly.
 */
export class GeolocationApiService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  readonly #messenger: GeolocationApiServiceMessenger;

  readonly #fetch: typeof globalThis.fetch;

  readonly #url: string;

  readonly #ttlMs: number;

  /**
   * The policy that wraps each HTTP request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  #cachedLocation: string = UNKNOWN_LOCATION;

  #lastFetchedAt: number | null = null;

  #fetchPromise: Promise<string> | null = null;

  #fetchGeneration = 0;

  /**
   * Constructs a new {@link GeolocationApiService}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.env - The environment to determine the correct API endpoint.
   * Defaults to PRD.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * Defaults to the global fetch.
   * @param args.ttlMs - Cache TTL in milliseconds. Defaults to 5 minutes.
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    env = SDK.Env.PRD,
    fetch: fetchFunction = globalThis.fetch,
    ttlMs,
    policyOptions = {},
  }: {
    messenger: GeolocationApiServiceMessenger;
    env?: SDK.Env;
    fetch?: typeof fetch;
    ttlMs?: number;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#url = getGeolocationUrl(env);
    this.#fetch = fetchFunction;
    this.#ttlMs = ttlMs ?? DEFAULT_TTL_MS;
    this.#policy = createServicePolicy(policyOptions);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers a handler that will be called after a request returns a 5xx
   * response, causing a retry.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]): IDisposable {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   * @see {@link createServicePolicy}
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]): IDisposable {
    return this.#policy.onBreak(listener);
  }

  /**
   * Registers a handler that will be called when requests are consistently
   * failing or when a successful request takes longer than the degraded
   * threshold.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   */
  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): IDisposable {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Returns the geolocation country code. Serves from cache when the TTL has
   * not expired, otherwise performs a network fetch. Concurrent callers are
   * deduplicated to a single in-flight request.
   *
   * @param options - Optional fetch options.
   * @param options.bypassCache - When true, invalidates the cache and forces a
   * fresh network request.
   * @returns The ISO 3166-1 alpha-2 country code, or {@link UNKNOWN_LOCATION}
   * when the API returns an empty or invalid body.
   */
  async fetchGeolocation(options?: FetchGeolocationOptions): Promise<string> {
    if (options?.bypassCache) {
      this.#fetchGeneration += 1;
      this.#fetchPromise = null;
      this.#lastFetchedAt = null;
    }

    if (this.#isCacheValid()) {
      return this.#cachedLocation;
    }

    if (this.#fetchPromise) {
      return this.#fetchPromise;
    }

    const promise = this.#performFetch();
    this.#fetchPromise = promise;

    try {
      return await promise;
    } finally {
      if (this.#fetchPromise === promise) {
        this.#fetchPromise = null;
      }
    }
  }

  /**
   * Checks whether the cached geolocation is still within the TTL window.
   *
   * @returns True if the cache is valid.
   */
  #isCacheValid(): boolean {
    return (
      this.#lastFetchedAt !== null &&
      Date.now() - this.#lastFetchedAt < this.#ttlMs
    );
  }

  /**
   * Performs the actual HTTP fetch, wrapped in the service policy for automatic
   * retry and circuit-breaking, and validates the response.
   *
   * @returns The ISO country code string.
   */
  async #performFetch(): Promise<string> {
    const generation = this.#fetchGeneration;

    const response = await this.#policy.execute(async () => {
      const localResponse = await this.#fetch(this.#url);
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Geolocation fetch failed: ${localResponse.status}`,
        );
      }
      return localResponse;
    });

    const raw = (await response.text()).trim();
    const location = /^[A-Z]{2}$/u.test(raw) ? raw : UNKNOWN_LOCATION;

    if (generation === this.#fetchGeneration && location !== UNKNOWN_LOCATION) {
      this.#cachedLocation = location;
      this.#lastFetchedAt = Date.now();
    }

    return location;
  }
}
