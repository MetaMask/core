/**
 * Base API Client - Shared HTTP functionality for all API clients.
 */

import { QueryClient } from '@tanstack/query-core';
import type { QueryKey } from '@tanstack/query-core';

import {
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  calculateRetryDelay,
  shouldRetry,
  HttpError,
} from './shared-types';
import type { ApiPlatformClientOptions } from './shared-types';

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

  protected readonly clientVersion: string;

  protected readonly getBearerToken?: () => Promise<string | undefined>;

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
    this.clientVersion = options.clientVersion ?? '1.0.0';
    this.getBearerToken = options.getBearerToken;

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
      'X-Client-Product': this.clientProduct,
      'X-Client-Version': this.clientVersion,
    };

    // Get bearer token using fetchQuery for automatic deduplication
    if (this.getBearerToken) {
      const queryKey = authQueryKeys.bearerToken();
      const { getBearerToken } = this;

      try {
        // fetchQuery handles caching and deduplicates concurrent requests
        const token = await this.#queryClientInstance.fetchQuery({
          queryKey,
          queryFn: async () => {
            const result = await getBearerToken();
            // Throw if no token - prevents caching null/undefined
            // so subsequent requests can retry (e.g., after user logs in)
            if (!result) {
              throw new Error('No bearer token available');
            }
            return result;
          },
          staleTime: STALE_TIMES.AUTH_TOKEN,
          retry: false, // Don't retry auth failures
        });

        headers.Authorization = `Bearer ${token}`;
      } catch {
        // No token available - continue without auth header
      }
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
