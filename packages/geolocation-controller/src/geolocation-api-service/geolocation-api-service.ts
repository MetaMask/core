import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { IDisposable } from 'cockatiel';

import { Env } from '../types.js';
import type { GeolocationApiServiceMethodActions } from './geolocation-api-service-method-action-types.js';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const ENDPOINT_PATH = '/v2/geolocation';

const COUNTRY_PATTERN = /^[A-Z]{2}$/u;

const REGION_PATTERN = /^[A-Z0-9]{1,3}$/u;

const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/u;

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

/**
 * Geolocation details returned by the geolocation API.
 *
 * Each field is `null` when the API omits it or returns a value that fails
 * validation.
 */
export type GeolocationData = {
  /** ISO 3166-1 alpha-2 country code (e.g. `US`, `FR`). */
  country: string | null;
  /** ISO 3166-2 subdivision code without the country prefix (e.g. `WA`). */
  region: string | null;
  /** IANA time zone name (e.g. `America/Los_Angeles`). */
  timezone: string | null;
};

/**
 * Constructs a {@link GeolocationData} with no known fields.
 *
 * @returns Geolocation data where every field is `null`.
 */
export function getUnknownGeolocationData(): GeolocationData {
  return { country: null, region: null, timezone: null };
}

/**
 * Country codes for which the location code includes the region. This mirrors
 * the legacy `v1` geolocation endpoint, which only appended the subdivision for
 * the United States and Canada (e.g. `US-NY`, `CA-ON`) and returned the country
 * alone for everywhere else.
 */
const REGION_APPENDED_COUNTRIES = new Set(['US', 'CA']);

/**
 * Converts geolocation data to a location code.
 *
 * To preserve backwards compatibility with the legacy `v1` endpoint, the region
 * is appended only for {@link REGION_APPENDED_COUNTRIES} (e.g. `US-NY`,
 * `CA-ON`); all other countries return the country code alone (e.g. `FR`), even
 * when a region is known.
 *
 * @param data - The geolocation data to convert.
 * @returns The location code (e.g. `US-NY`, `FR`), or
 * {@link UNKNOWN_LOCATION} when the country is unknown.
 */
export function toLocationCode(data: GeolocationData): string {
  if (data.country === null) {
    return UNKNOWN_LOCATION;
  }

  if (data.region !== null && REGION_APPENDED_COUNTRIES.has(data.country)) {
    return `${data.country}-${data.region}`;
  }

  return data.country;
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'fetchGeolocation',
  'fetchGeolocationData',
] as const;

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
 * Served by API Platform's `geolocation-api` service, not the legacy
 * Ramps-owned `on-ramp` endpoint this previously pointed to. API Platform has
 * not yet provisioned a dedicated UAT deployment for this service, so UAT
 * temporarily resolves to the production URL until one exists.
 *
 * @param env - The environment to get the URL for.
 * @returns The full URL for the geolocation endpoint.
 */
function getGeolocationUrl(env: Env): string {
  const envPrefix = env === Env.DEV ? 'dev-' : '';
  return `https://geolocation.${envPrefix}api.cx.metamask.io${ENDPOINT_PATH}`;
}

/**
 * Reads a string field from a parsed response body, keeping it only when it
 * matches the expected format.
 *
 * @param body - The parsed response body.
 * @param field - The name of the field to read.
 * @param pattern - The pattern the field value must match.
 * @returns The trimmed field value, or `null` when it is missing or invalid.
 */
function readValidatedField(
  body: Record<string, unknown>,
  field: string,
  pattern: RegExp,
): string | null {
  const value = body[field];

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return pattern.test(trimmed) ? trimmed : null;
}

/**
 * Parses and validates the geolocation API response body.
 *
 * The endpoint is expected to return JSON such as
 * `{"country":"US","region":"WA","timezone":"America/Los_Angeles"}`. Anything
 * that cannot be parsed, or any individual field that fails validation, is
 * reported as unknown rather than throwing, so that consumers can keep working
 * with partial or missing data.
 *
 * @param raw - The raw response body.
 * @returns The validated geolocation data.
 */
function parseGeolocationResponse(raw: string): GeolocationData {
  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return getUnknownGeolocationData();
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return getUnknownGeolocationData();
  }

  const record = body as Record<string, unknown>;

  return {
    country: readValidatedField(record, 'country', COUNTRY_PATTERN),
    region: readValidatedField(record, 'region', REGION_PATTERN),
    timezone: readValidatedField(record, 'timezone', TIMEZONE_PATTERN),
  };
}

/**
 * Options accepted by {@link GeolocationApiService.fetchGeolocation}.
 */
export type FetchGeolocationOptions = {
  /** When true, the TTL cache is invalidated so the next request fetches fresh data. */
  bypassCache?: boolean;
};

/**
 * Low-level data service that fetches geolocation details from the geolocation
 * API.
 *
 * Responsibilities:
 * - HTTP request to the geolocation endpoint (wrapped in a service policy)
 * - Response validation of the country, region, and timezone fields
 * - TTL-based in-memory cache
 * - Promise deduplication (concurrent callers share a single in-flight request)
 *
 * This class is intentionally not a controller: it does not manage UI state.
 * Its {@link fetchGeolocation} and {@link fetchGeolocationData} methods are
 * automatically registered on the messenger so that controllers and other
 * packages can call them directly.
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

  #cachedGeolocation: GeolocationData = getUnknownGeolocationData();

  #lastFetchedAt: number | null = null;

  #fetchPromise: Promise<GeolocationData> | null = null;

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
    env = Env.PRD,
    fetch: fetchFunction = globalThis.fetch,
    ttlMs,
    policyOptions = {},
  }: {
    messenger: GeolocationApiServiceMessenger;
    env?: Env;
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
   * Returns the geolocation code. Serves from cache when the TTL has not
   * expired, otherwise performs a network fetch. Concurrent callers are
   * deduplicated to a single in-flight request.
   *
   * @param options - Optional fetch options.
   * @param options.bypassCache - When true, invalidates the TTL cache. If a
   * request is already in-flight it will be reused (deduplication always
   * applies).
   * @returns An ISO 3166-2 location code (e.g. `US`, `US-NY`, `CA-ON`), or
   * {@link UNKNOWN_LOCATION} when the API returns an empty or invalid body.
   */
  async fetchGeolocation(options?: FetchGeolocationOptions): Promise<string> {
    return toLocationCode(await this.fetchGeolocationData(options));
  }

  /**
   * Returns the country, region, and timezone for the current client. Serves
   * from cache when the TTL has not expired, otherwise performs a network
   * fetch. Concurrent callers are deduplicated to a single in-flight request.
   *
   * @param options - Optional fetch options.
   * @param options.bypassCache - When true, invalidates the TTL cache. If a
   * request is already in-flight it will be reused (deduplication always
   * applies).
   * @returns The geolocation data, where each field is `null` when the API
   * omits it or returns a value that fails validation.
   */
  async fetchGeolocationData(
    options?: FetchGeolocationOptions,
  ): Promise<GeolocationData> {
    if (options?.bypassCache) {
      this.#lastFetchedAt = null;
    }

    if (this.#isCacheValid()) {
      return this.#cachedGeolocation;
    }

    if (this.#fetchPromise) {
      return this.#fetchPromise;
    }

    const promise = this.#performFetch();
    this.#fetchPromise = promise;

    try {
      return await promise;
    } finally {
      this.#fetchPromise = null;
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
   * @returns The validated geolocation data.
   */
  async #performFetch(): Promise<GeolocationData> {
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

    const geolocation = parseGeolocationResponse(
      (await response.text()).trim(),
    );

    // Cache whenever at least one field resolved. A partially-known result
    // (e.g. timezone without a valid country) is still worth caching so we do
    // not re-fetch it within the TTL window; only a fully-unknown response is
    // left uncached so it can be retried.
    const hasKnownField =
      geolocation.country !== null ||
      geolocation.region !== null ||
      geolocation.timezone !== null;

    if (hasKnownField) {
      this.#cachedGeolocation = geolocation;
      this.#lastFetchedAt = Date.now();
    }

    return geolocation;
  }
}
