/**
 * HTTP Client for MetaMask internal API services
 *
 * Provides a consistent interface for making authenticated HTTP requests
 * to MetaMask backend services with proper error handling, timeouts,
 * and request deduplication.
 */

import type { BaseApiServiceOptions, ApiErrorResponse } from './types';

/**
 * HTTP request options
 */
export type HttpRequestOptions = {
  /** Request method */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: unknown;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to include authentication header */
  authenticate?: boolean;
  /** Abort signal for request cancellation */
  signal?: AbortSignal;
  /**
   * Whether to deduplicate this request.
   * When enabled, concurrent identical GET requests will share the same response.
   * Defaults to true for GET requests, false for others.
   */
  dedupe?: boolean;
};

/**
 * HTTP error with status code and response body
 */
export class HttpError extends Error {
  readonly status: number;

  readonly statusText: string;

  readonly body?: unknown;

  constructor(status: number, statusText: string, body?: unknown) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

/**
 * In-flight request entry for deduplication
 */
type InFlightRequest<TResponse> = {
  promise: Promise<TResponse>;
  subscriberCount: number;
};

/**
 * HTTP Client for making requests to MetaMask internal APIs
 *
 * Features:
 * - Automatic request deduplication for GET requests
 * - Bearer token authentication
 * - Configurable timeouts
 * - Request cancellation via AbortSignal
 */
export class HttpClient {
  readonly #baseUrl: string;

  readonly #timeout: number;

  readonly #getBearerToken?: () => Promise<string | undefined>;

  readonly #clientProduct: string;

  /** Map of in-flight requests for deduplication */
  readonly #inFlightRequests: Map<string, InFlightRequest<unknown>> = new Map();

  /**
   * Creates a new HTTP client instance
   *
   * @param baseUrl - Base URL for all requests
   * @param options - Client configuration options
   */
  constructor(
    baseUrl: string,
    options: Omit<BaseApiServiceOptions, 'baseUrl'> = {},
  ) {
    this.#baseUrl = baseUrl;
    this.#timeout = options.timeout ?? 10000;
    this.#getBearerToken = options.getBearerToken;
    this.#clientProduct = options.clientProduct ?? 'metamask-core-backend';
  }

  /**
   * Generates a cache key for request deduplication
   *
   * @param method - HTTP method
   * @param path - Request path
   * @param authenticate - Whether request is authenticated
   * @returns Cache key string
   */
  #getCacheKey(method: string, path: string, authenticate: boolean): string {
    return `${method}:${authenticate ? 'auth' : 'noauth'}:${this.#baseUrl}${path}`;
  }

  /**
   * Makes an HTTP request with optional deduplication
   *
   * @param path - Request path (will be appended to base URL)
   * @param options - Request options
   * @returns Parsed JSON response
   */
  async request<TResponse>(
    path: string,
    options: HttpRequestOptions = {},
  ): Promise<TResponse> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.#timeout,
      authenticate = false,
      signal,
      dedupe,
    } = options;

    // Determine if we should deduplicate this request
    // Default: dedupe GET requests, don't dedupe others
    const shouldDedupe = dedupe ?? (method === 'GET' && !body);

    if (shouldDedupe) {
      const cacheKey = this.#getCacheKey(method, path, authenticate);
      const inFlight = this.#inFlightRequests.get(cacheKey);

      if (inFlight) {
        // Return existing in-flight request
        inFlight.subscriberCount += 1;
        return inFlight.promise as Promise<TResponse>;
      }

      // Create new request and track it
      const requestPromise = this.#executeRequest<TResponse>(
        path,
        method,
        headers,
        body,
        timeout,
        authenticate,
        signal,
      );

      const trackedRequest: InFlightRequest<TResponse> = {
        promise: requestPromise,
        subscriberCount: 1,
      };

      this.#inFlightRequests.set(
        cacheKey,
        trackedRequest as InFlightRequest<unknown>,
      );

      // Clean up after request completes (success or failure)
      requestPromise
        .finally(() => {
          this.#inFlightRequests.delete(cacheKey);
        })
        .catch(() => {
          // Prevent unhandled promise rejection
        });

      return requestPromise;
    }

    // Non-deduplicated request
    return this.#executeRequest<TResponse>(
      path,
      method,
      headers,
      body,
      timeout,
      authenticate,
      signal,
    );
  }

  /**
   * Executes the actual HTTP request
   *
   * @param path - Request path
   * @param method - HTTP method
   * @param headers - Request headers
   * @param body - Request body
   * @param timeout - Request timeout in milliseconds
   * @param authenticate - Whether to authenticate the request
   * @param signal - Optional abort signal
   * @returns Parsed JSON response
   */
  async #executeRequest<TResponse>(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    timeout: number,
    authenticate: boolean,
    signal?: AbortSignal,
  ): Promise<TResponse> {
    const url = `${this.#baseUrl}${path}`;

    // Build headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-metamask-clientproduct': this.#clientProduct,
      ...headers,
    };

    // Add authentication header if requested
    if (authenticate && this.#getBearerToken) {
      const token = await this.#getBearerToken();
      if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine with external signal if provided
    const combinedSignal = signal
      ? this.#combineAbortSignals(signal, controller.signal)
      : controller.signal;

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          // Response body is not JSON
        }
        throw new HttpError(response.status, response.statusText, errorBody);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as TResponse;
      }

      const data = await response.json();

      // Check for API-level errors
      if (this.#isApiError(data)) {
        throw new HttpError(
          400,
          data.error?.message ?? 'Unknown API error',
          data,
        );
      }

      return data as TResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof HttpError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }

      throw new Error(String(error));
    }
  }

  /**
   * Makes a GET request
   *
   * GET requests are automatically deduplicated by default.
   * Concurrent requests to the same URL will share the same response.
   *
   * @param path - Request path
   * @param options - Request options
   * @returns Parsed JSON response
   */
  async get<TResponse>(
    path: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: 'GET' });
  }

  /**
   * Makes a POST request
   *
   * POST requests are NOT deduplicated by default.
   *
   * @param path - Request path
   * @param body - Request body
   * @param options - Request options
   * @returns Parsed JSON response
   */
  async post<TResponse>(
    path: string,
    body?: unknown,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: 'POST', body });
  }

  /**
   * Makes a PUT request
   *
   * @param path - Request path
   * @param body - Request body
   * @param options - Request options
   * @returns Parsed JSON response
   */
  async put<TResponse>(
    path: string,
    body?: unknown,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: 'PUT', body });
  }

  /**
   * Makes a DELETE request
   *
   * @param path - Request path
   * @param options - Request options
   * @returns Parsed JSON response
   */
  async delete<TResponse>(
    path: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Clears all in-flight request tracking.
   * Useful for testing or when resetting client state.
   */
  clearInFlightRequests(): void {
    this.#inFlightRequests.clear();
  }

  /**
   * Gets the number of in-flight requests.
   * Useful for debugging and testing.
   *
   * @returns The number of in-flight requests
   */
  get inFlightCount(): number {
    return this.#inFlightRequests.size;
  }

  /**
   * Combines multiple abort signals into one
   *
   * @param signal1 - First abort signal
   * @param signal2 - Second abort signal
   * @returns Combined abort signal
   */
  #combineAbortSignals(
    signal1: AbortSignal,
    signal2: AbortSignal,
  ): AbortSignal {
    const controller = new AbortController();

    const abort = (): void => controller.abort();

    if (signal1.aborted || signal2.aborted) {
      controller.abort();
    } else {
      signal1.addEventListener('abort', abort);
      signal2.addEventListener('abort', abort);
    }

    return controller.signal;
  }

  /**
   * Checks if response is an API error
   *
   * @param data - Data to check
   * @returns True if data is an API error response
   */
  #isApiError(data: unknown): data is ApiErrorResponse {
    return (
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as ApiErrorResponse).error === 'object'
    );
  }
}
