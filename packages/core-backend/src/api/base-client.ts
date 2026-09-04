/**
 * Base API Client - Shared HTTP functionality for all API clients.
 */

import { QueryClient } from '@tanstack/query-core';
import type { QueryKey } from '@tanstack/query-core';

import {
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  DEFAULT_AUTH_TOKEN_TIMEOUT,
  calculateRetryDelay,
  shouldRetry,
  HttpError,
} from './shared-types.js';
import type { ApiPlatformClientOptions } from './shared-types.js';

// Auth query keys - shared for token management across clients
export const authQueryKeys = {
  bearerToken: (): QueryKey => ['auth', 'bearerToken'],
} as const;

export type { ApiPlatformClientOptions };

/**
 * Internal fetch options for HTTP requests.
 */
export type InternalFetchOptions = {
  signal?: AbortSignal;
  params?: Record<
    string,
    string | string[] | number | number[] | boolean | undefined
  >;
};

/**
 * Base API Client with shared HTTP and caching functionality.
 * Extended by all specific API clients.
 */
export class BaseApiClient {
  protected readonly clientProduct: string;

  protected readonly clientVersion?: string;

  protected readonly getBearerToken?: () => Promise<string | undefined>;

  protected readonly authTokenTimeout: number;

  readonly #queryClientInstance: QueryClient;

  /**
   * Get the underlying QueryClient instance.
   * Exposed for cache management operations.
   *
   * @returns The QueryClient instance.
   */
  get queryClient(): QueryClient {
    return this.#queryClientInstance;
  }

  /**
   * Invalidate the cached auth token.
   * Call this when the user logs out or the token expires.
   *
   * Uses resetQueries() instead of invalidateQueries() to completely remove
   * the cached value, ensuring the next request fetches a fresh token immediately.
   */
  async invalidateAuthToken(): Promise<void> {
    await this.#queryClientInstance.resetQueries({
      queryKey: authQueryKeys.bearerToken(),
    });
  }

  constructor(options: ApiPlatformClientOptions) {
    this.clientProduct = options.clientProduct;
    this.clientVersion = options.clientVersion;
    this.getBearerToken = options.getBearerToken;
    this.authTokenTimeout =
      options.authTokenTimeout ?? DEFAULT_AUTH_TOKEN_TIMEOUT;

    this.#queryClientInstance =
      options.queryClient ??
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIMES.DEFAULT,
            gcTime: GC_TIMES.DEFAULT,
            retry: shouldRetry,
            retryDelay: calculateRetryDelay,
            refetchOnWindowFocus: false,
            networkMode: 'always',
          },
        },
      });
  }

  /**
   * Resolve the bearer token, giving up after `authTokenTimeout` so that a slow
   * token provider does not delay the request. When the wait times out the
   * request goes out unauthenticated (lower rate limit) while the in-flight
   * `fetchQuery` keeps resolving `getBearerToken` for later requests.
   *
   * @returns The bearer token, or undefined if unavailable in time.
   */
  async #fetchBearerToken(): Promise<string | undefined> {
    const { getBearerToken } = this;
    if (!getBearerToken) {
      return undefined;
    }

    // fetchQuery de-duplicates concurrent callers. staleTime is 0 so we do not
    // cache the JWT here — AuthenticationController already owns token lifetime.
    const tokenPromise = this.#queryClientInstance
      .fetchQuery({
        queryKey: authQueryKeys.bearerToken(),
        queryFn: async () => {
          const result = await getBearerToken();
          // Throw if no token - prevents caching null/undefined
          // so subsequent requests can retry (e.g., after user logs in)
          if (!result) {
            throw new Error('No bearer token available');
          }
          return result;
        },
        staleTime: 0,
        retry: false, // Don't retry auth failures
      })
      .catch(() => undefined);

    if (this.authTokenTimeout <= 0) {
      return await tokenPromise;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<undefined>((resolve) => {
      timeoutId = setTimeout(() => resolve(undefined), this.authTokenTimeout);
    });

    try {
      return await Promise.race([tokenPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Internal HTTP fetch method with authentication and error handling.
   *
   * @param baseUrl - The base URL for the API.
   * @param path - The API endpoint path.
   * @param options - Optional fetch configuration.
   * @returns The parsed JSON response.
   */
  protected async fetch<ResponseType>(
    baseUrl: string,
    path: string,
    options?: InternalFetchOptions,
  ): Promise<ResponseType> {
    const url = new URL(path, baseUrl);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined) {
          continue;
        }
        if (Array.isArray(value)) {
          // Convert array values (including number[]) to comma-separated string
          url.searchParams.set(key, value.map(String).join(','));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-metamask-clientproduct': this.clientProduct,
    };

    if (this.clientVersion) {
      headers['x-metamask-clientversion'] = this.clientVersion;
    }

    const token = await this.#fetchBearerToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: options?.signal,
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        // Response body is not JSON or is empty, leave body as undefined
      }
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        response.statusText,
        url.toString(),
        body,
      );
    }

    return response.json() as Promise<ResponseType>;
  }
}

// Re-export constants for use by API clients
export { API_URLS, STALE_TIMES, GC_TIMES, HttpError };
