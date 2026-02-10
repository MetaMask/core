import { createServicePolicy } from '@metamask/controller-utils';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { SDK } from '@metamask/profile-sync-controller';

import { validateRegistryConfigApiResponse } from './types';
import type { FetchConfigOptions, FetchConfigResult } from './types';

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
      };
    }

    const etag = response.headers.get('ETag') ?? undefined;
    const jsonData = await response.json();

    validateRegistryConfigApiResponse(jsonData);

    return {
      data: jsonData,
      etag,
      modified: true,
    };
  }
}
