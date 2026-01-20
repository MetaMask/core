import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
} from '@metamask/controller-utils';
import type { ServicePolicy } from '@metamask/controller-utils';

import type {
  AbstractConfigRegistryApiService,
  FetchConfigOptions,
  FetchConfigResult,
  RegistryConfigApiResponse,
} from './abstract-config-registry-api-service';

export const DEFAULT_API_BASE_URL =
  'https://client-config.uat-api.cx.metamask.io/v1';

export const DEFAULT_ENDPOINT_PATH = '/config/networks';

export const DEFAULT_TIMEOUT = 10 * 1000;

export type ConfigRegistryApiServiceOptions = {
  apiBaseUrl?: string;
  endpointPath?: string;
  timeout?: number;
  fetch?: typeof fetch;
  degradedThreshold?: number;
  retries?: number;
  maximumConsecutiveFailures?: number;
  circuitBreakDuration?: number;
};

export class ConfigRegistryApiService implements AbstractConfigRegistryApiService {
  readonly #policy: ServicePolicy;

  readonly #apiBaseUrl: string;

  readonly #endpointPath: string;

  readonly #timeout: number;

  readonly #fetch: typeof fetch;

  /**
   * Construct a Config Registry API Service.
   *
   * @param options - The options for constructing the service.
   * @param options.apiBaseUrl - The base URL for the API. Defaults to the UAT API URL.
   * @param options.endpointPath - The endpoint path. Defaults to '/config/networks'.
   * @param options.timeout - Timeout for HTTP requests in milliseconds. Defaults to 10 seconds.
   * @param options.fetch - Custom fetch function for testing or custom implementations. Defaults to the global fetch.
   * @param options.degradedThreshold - The length of time (in milliseconds) that governs when the service is regarded as degraded. Defaults to 5 seconds.
   * @param options.retries - Number of retry attempts for each fetch request. Defaults to 3.
   * @param options.maximumConsecutiveFailures - The maximum number of consecutive failures allowed before breaking the circuit. Defaults to 3.
   * @param options.circuitBreakDuration - The amount of time to wait when the circuit breaks from too many consecutive failures. Defaults to 2 minutes.
   */
  constructor({
    apiBaseUrl = DEFAULT_API_BASE_URL,
    endpointPath = DEFAULT_ENDPOINT_PATH,
    timeout = DEFAULT_TIMEOUT,
    fetch: customFetch = globalThis.fetch,
    degradedThreshold = DEFAULT_DEGRADED_THRESHOLD,
    retries = DEFAULT_MAX_RETRIES,
    maximumConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    circuitBreakDuration = DEFAULT_CIRCUIT_BREAK_DURATION,
  }: ConfigRegistryApiServiceOptions = {}) {
    this.#apiBaseUrl = apiBaseUrl;
    this.#endpointPath = endpointPath;
    this.#timeout = timeout;
    this.#fetch = customFetch;

    this.#policy = createServicePolicy({
      maxRetries: retries,
      maxConsecutiveFailures: maximumConsecutiveFailures,
      circuitBreakDuration,
      degradedThreshold,
    });
  }

  onBreak(
    ...args: Parameters<ServicePolicy['onBreak']>
  ): ReturnType<ServicePolicy['onBreak']> {
    return this.#policy.onBreak(...args);
  }

  onDegraded(
    ...args: Parameters<ServicePolicy['onDegraded']>
  ): ReturnType<ServicePolicy['onDegraded']> {
    return this.#policy.onDegraded(...args);
  }

  async fetchConfig(
    options: FetchConfigOptions = {},
  ): Promise<FetchConfigResult> {
    const baseUrl = this.#apiBaseUrl.endsWith('/')
      ? this.#apiBaseUrl.slice(0, -1)
      : this.#apiBaseUrl;
    const endpointPath = this.#endpointPath.startsWith('/')
      ? this.#endpointPath
      : `/${this.#endpointPath}`;
    const url = new URL(`${baseUrl}${endpointPath}`);

    const headers: HeadersInit = {
      'Cache-Control': 'no-cache',
    };

    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }

    const fetchWithTimeout = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

      try {
        const response = await this.#fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.#timeout}ms`);
        }
        throw error;
      }
    };

    const response = await this.#policy.execute(async () => {
      const res = await fetchWithTimeout();

      if (res.status === 304) {
        return {
          status: 304,
          headers: res.headers,
        } as unknown as Response;
      }

      if (!res.ok) {
        throw new Error(
          `Failed to fetch config: ${res.status} ${res.statusText}`,
        );
      }

      return res;
    });

    if ((response as unknown as { status?: number }).status === 304) {
      const etag = response.headers.get('ETag') ?? undefined;
      return {
        notModified: true,
        etag,
      };
    }

    const etag = response.headers.get('ETag') ?? undefined;
    const data = (await response.json()) as RegistryConfigApiResponse;

    if (!data?.data || !Array.isArray(data.data.networks)) {
      throw new Error('Invalid response structure from config registry API');
    }

    return {
      data,
      etag,
      notModified: false,
    };
  }
}
