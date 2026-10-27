import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';

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
 * Invalidates cached queries for {@link GeolocationApiService}.
 */
export type GeolocationApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link GeolocationApiService} exposes to other consumers.
 */
export type GeolocationApiServiceActions =
  | GeolocationApiServiceMethodActions
  | GeolocationApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link GeolocationApiServiceMessenger}
 * calls.
 */
type AllowedActions = never;

/**
 * Published when {@link GeolocationApiService}'s cache is updated.
 */
export type GeolocationApiServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link GeolocationApiService}'s cache is
 * updated.
 */
export type GeolocationApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link GeolocationApiService} exposes to other consumers.
 */
export type GeolocationApiServiceEvents =
  | GeolocationApiServiceCacheUpdatedEvent
  | GeolocationApiServiceGranularCacheUpdatedEvent;

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
  /** When true, ignores any cached result and fetches fresh data. */
  bypassCache?: boolean;
};

/**
 * Low-level data service that fetches geolocation details from the geolocation
 * API.
 *
 * Responsibilities:
 * - HTTP request to the geolocation endpoint (wrapped in a service policy)
 * - Response validation of the country, region, and timezone fields
 *
 * This class is intentionally not a controller: it does not manage UI state.
 * Its {@link fetchGeolocation} and {@link fetchGeolocationData} methods are
 * automatically registered on the messenger so that controllers and other
 * packages can call them directly.
 */
export class GeolocationApiService extends BaseDataService<
  typeof serviceName,
  GeolocationApiServiceMessenger
> {
  readonly #fetch: typeof globalThis.fetch;

  readonly #url: string;

  readonly #ttlMs: number;

  /**
   * Constructs a new {@link GeolocationApiService}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.env - The environment to determine the correct API endpoint.
   * Defaults to PRD.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * Defaults to the global fetch.
   * @param args.ttlMs - How long a fetched result is served from cache, in
   * milliseconds. Defaults to 5 minutes.
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
    super({ name: serviceName, messenger, policyOptions });
    this.#url = getGeolocationUrl(env);
    this.#fetch = fetchFunction;
    this.#ttlMs = ttlMs ?? DEFAULT_TTL_MS;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Returns the geolocation code. Serves from cache when the TTL has not
   * expired, otherwise performs a network fetch.
   *
   * @param options - Optional fetch options.
   * @param options.bypassCache - When true, ignores any cached result and
   * fetches fresh data.
   * @returns An ISO 3166-2 location code (e.g. `US`, `US-NY`, `CA-ON`), or
   * {@link UNKNOWN_LOCATION} when the API returns an empty or invalid body.
   */
  async fetchGeolocation(options?: FetchGeolocationOptions): Promise<string> {
    return toLocationCode(await this.fetchGeolocationData(options));
  }

  /**
   * Returns the country, region, and timezone for the current client. Serves
   * from cache when the TTL has not expired, otherwise performs a network
   * fetch.
   *
   * @param options - Optional fetch options.
   * @param options.bypassCache - When true, ignores any cached result and
   * fetches fresh data.
   * @returns The geolocation data, where each field is `null` when the API
   * omits it or returns a value that fails validation.
   */
  async fetchGeolocationData(
    options?: FetchGeolocationOptions,
  ): Promise<GeolocationData> {
    const queryKey = [`${this.name}:fetchGeolocationData`] as const;

    if (options?.bypassCache) {
      // The query stays stale if the refresh fails, so the next call refetches.
      await this.invalidateQueries({ queryKey, refetchType: 'none' });
    }

    const geolocation = await this.fetchQuery({
      queryKey,
      staleTime: this.#ttlMs,
      // Retain the result for as long as it is considered fresh.
      gcTime: this.#ttlMs,
      queryFn: async () => {
        const response = await this.#fetch(this.#url);
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Geolocation fetch failed: ${response.status}`,
          );
        }
        return parseGeolocationResponse((await response.text()).trim());
      },
    });

    // A partially-known result is worth keeping for the whole TTL. A
    // fully-unknown one is marked stale so the next call retries it.
    if (
      geolocation.country === null &&
      geolocation.region === null &&
      geolocation.timezone === null
    ) {
      await this.invalidateQueries({ queryKey, refetchType: 'none' });
    }

    return geolocation;
  }
}
