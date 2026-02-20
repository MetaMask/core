import { createServicePolicy } from '@metamask/controller-utils';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { SDK } from '@metamask/profile-sync-controller';

import type {
  FetchConfigOptions,
  FetchConfigResult,
  RegistryConfigApiResponse,
} from './types';
import { validateRegistryConfigApiResponse } from './types';

const ENDPOINT_PATH = '/config/networks';

/**
 * Returns the base URL for the config registry API for the given environment.
 *
 * @param env - The environment to get the URL for.
 * @returns The base URL for the environment.
 */
function getConfigRegistryUrl(env: SDK.Env): string {
  const envPrefix = env === SDK.Env.PRD ? '' : `${env}-`;
  return `https://client-config.${envPrefix}api.cx.metamask.io/v1${ENDPOINT_PATH}`;
}

export type ConfigRegistryApiServiceOptions = {
  env?: SDK.Env;
  fetch?: typeof fetch;
  /**
   * Options to pass to `createServicePolicy`, which wraps each request.
   * See {@link CreateServicePolicyOptions}.
   */
  policyOptions?: CreateServicePolicyOptions;
};

export class ConfigRegistryApiService {
  readonly #policy: ServicePolicy;

  readonly #url: string;

  readonly #fetch: typeof fetch;

  /** Cached response from the last successful fetch. Used when server returns 304. */
  #cachedResponse: RegistryConfigApiResponse | null = null;

  /**
   * Construct a Config Registry API Service.
   *
   * @param options - The options for constructing the service.
   * @param options.env - The environment to determine the correct API endpoints. Defaults to UAT.
   * @param options.fetch - Custom fetch function for testing or custom implementations. Defaults to the global fetch.
   * @param options.policyOptions - Options to pass to `createServicePolicy`, which wraps each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    env = SDK.Env.UAT,
    fetch: customFetch = globalThis.fetch,
    policyOptions = {},
  }: ConfigRegistryApiServiceOptions = {}) {
    this.#url = getConfigRegistryUrl(env);
    this.#fetch = customFetch;

    this.#policy = createServicePolicy(policyOptions);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param args - The arguments passed to the underlying policy's onBreak method
   * (e.g. the listener to be called).
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onBreak(
    ...args: Parameters<ServicePolicy['onBreak']>
  ): ReturnType<ServicePolicy['onBreak']> {
    return this.#policy.onBreak(...args);
  }

  /**
   * Registers a handler that will be called under one of two circumstances:
   *
   * 1. After a set number of retries prove that requests to the API
   * consistently result in one of the following failures:
   *    1. A connection initiation error
   *    2. A connection reset error
   *    3. A timeout error
   *    4. A non-JSON response
   *    5. A 502, 503, or 504 response
   * 2. After a successful request is made to the API, but the response takes
   * longer than a set duration to return.
   *
   * @param args - The arguments passed to the underlying policy's onDegraded
   * method (e.g. the listener to be called).
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   */
  onDegraded(
    ...args: Parameters<ServicePolicy['onDegraded']>
  ): ReturnType<ServicePolicy['onDegraded']> {
    return this.#policy.onDegraded(...args);
  }

  async fetchConfig(
    options: FetchConfigOptions = {},
  ): Promise<FetchConfigResult> {
    const headers: HeadersInit = {
      'Cache-Control': 'no-cache',
    };

    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }

    const response = await this.#policy.execute(async () => {
      const res = await this.#fetch(this.#url, {
        headers,
      });

      if (res.status === 304) {
        return res;
      }

      if (!res.ok) {
        throw new Error(
          `Failed to fetch config: ${res.status} ${res.statusText}`,
        );
      }

      return res;
    });

    if (response.status === 304) {
      const etag = response.headers.get('ETag') ?? undefined;
      return {
        modified: false,
        etag,
        ...(this.#cachedResponse !== null && { data: this.#cachedResponse }),
      };
    }

    const etag = response.headers.get('ETag') ?? undefined;
    const jsonData = await response.json();

    validateRegistryConfigApiResponse(jsonData);

    this.#cachedResponse = jsonData;

    return {
      data: jsonData,
      etag,
      modified: true,
    };
  }
}
