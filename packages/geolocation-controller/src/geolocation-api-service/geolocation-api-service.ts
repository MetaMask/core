const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Sentinel value used when the geolocation has not been determined yet or when
 * the API returns an empty / invalid response.
 */
export const UNKNOWN_LOCATION = 'UNKNOWN';

/**
 * Options for constructing the {@link GeolocationApiService}.
 */
export type GeolocationApiServiceOptions = {
  /** Injectable fetch function. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Callback returning the geolocation API URL for the current environment. */
  getGeolocationUrl: () => string;
  /** Cache time-to-live in milliseconds. Defaults to 5 minutes. */
  ttlMs?: number;
};

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
 * - HTTP request to the geolocation endpoint
 * - ISO 3166-1 alpha-2 response validation
 * - TTL-based in-memory cache
 * - Promise deduplication (concurrent callers share a single in-flight request)
 * - Race-condition prevention via a generation counter
 *
 * This class is intentionally not a controller: it does not manage UI state.
 * Register its {@link fetchGeolocation} method on the messenger so that
 * controllers and other packages can call it directly.
 */
export class GeolocationApiService {
  readonly #fetch: typeof globalThis.fetch;

  readonly #getGeolocationUrl: () => string;

  readonly #ttlMs: number;

  #cachedLocation: string = UNKNOWN_LOCATION;

  #lastFetchedAt: number | null = null;

  #fetchPromise: Promise<string> | null = null;

  #fetchGeneration = 0;

  /**
   * Constructs a new {@link GeolocationApiService}.
   *
   * @param options - Service configuration.
   * @param options.fetch - Injectable fetch function. Defaults to
   * `globalThis.fetch`.
   * @param options.getGeolocationUrl - Callback returning the API URL.
   * @param options.ttlMs - Cache TTL in milliseconds. Defaults to 5 minutes.
   */
  constructor({
    fetch: fetchFunction,
    getGeolocationUrl,
    ttlMs,
  }: GeolocationApiServiceOptions) {
    this.#fetch = fetchFunction ?? globalThis.fetch.bind(globalThis);
    this.#getGeolocationUrl = getGeolocationUrl;
    this.#ttlMs = ttlMs ?? DEFAULT_TTL_MS;
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
   * Performs the actual HTTP fetch and validates the response.
   *
   * @returns The ISO country code string.
   */
  async #performFetch(): Promise<string> {
    const generation = this.#fetchGeneration;

    const url = this.#getGeolocationUrl();
    const response = await this.#fetch(url);

    if (!response.ok) {
      throw new Error(`Geolocation fetch failed: ${response.status}`);
    }

    const raw = (await response.text()).trim();
    const location = /^[A-Z]{2}$/u.test(raw) ? raw : UNKNOWN_LOCATION;

    if (generation === this.#fetchGeneration && location !== UNKNOWN_LOCATION) {
      this.#cachedLocation = location;
      this.#lastFetchedAt = Date.now();
    }

    return location;
  }
}
