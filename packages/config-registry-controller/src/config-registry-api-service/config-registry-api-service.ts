import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { SDK } from '@metamask/profile-sync-controller';
import type { IDisposable } from 'cockatiel';

import type { ConfigRegistryApiServiceMethodActions } from './config-registry-api-service-method-action-types';
import type {
  FetchConfigOptions,
  FetchConfigResult,
  RegistryConfigApiResponse,
} from './types';
import { validateRegistryConfigApiResponse } from './types';

const ENDPOINT_PATH = '/config/networks';

/**
 * The name of the {@link ConfigRegistryApiService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'ConfigRegistryApiService';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['fetchConfig'] as const;

/**
 * Actions that {@link ConfigRegistryApiService} exposes to other consumers.
 */
export type ConfigRegistryApiServiceActions =
  ConfigRegistryApiServiceMethodActions;

/**
 * Actions from other messengers that {@link ConfigRegistryApiServiceMessenger} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link ConfigRegistryApiService} exposes to other consumers.
 */
export type ConfigRegistryApiServiceEvents = never;

/**
 * Events from other messengers that {@link ConfigRegistryApiService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ConfigRegistryApiService}.
 */
export type ConfigRegistryApiServiceMessenger = Messenger<
  typeof serviceName,
  ConfigRegistryApiServiceActions | AllowedActions,
  ConfigRegistryApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

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
  /**
   * The messenger suited for this service. Required so the service can be used
   * independently and register its actions.
   */
  messenger: ConfigRegistryApiServiceMessenger;
  env?: SDK.Env;
  fetch?: typeof fetch;
  /**
   * Options to pass to `createServicePolicy`, which wraps each request.
   * See {@link CreateServicePolicyOptions}.
   */
  policyOptions?: CreateServicePolicyOptions;
};

export class ConfigRegistryApiService {
  readonly name: typeof serviceName;

  readonly #messenger: ConfigRegistryApiServiceMessenger;

  readonly #policy: ServicePolicy;

  readonly #url: string;

  readonly #fetch: typeof fetch;

  /** Cached response from the last successful fetch. Used when server returns 304. */
  #cachedResponse: RegistryConfigApiResponse | null = null;

  /**
   * Construct a Config Registry API Service.
   *
   * @param options - The options for constructing the service.
   * @param options.messenger - The messenger suited for this service.
   * @param options.env - The environment to determine the correct API endpoints. Defaults to UAT.
   * @param options.fetch - Custom fetch function for testing or custom implementations. Defaults to the global fetch.
   * @param options.policyOptions - Options to pass to `createServicePolicy`, which wraps each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    env = SDK.Env.UAT,
    fetch: customFetch = globalThis.fetch,
    policyOptions = {},
  }: ConfigRegistryApiServiceOptions) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#url = getConfigRegistryUrl(env);
    this.#fetch = customFetch;

    this.#policy = createServicePolicy(policyOptions);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers a handler that will be called after a request returns a non-500
   * response, causing a retry. Primarily useful in tests where timers are being
   * mocked.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]): IDisposable {
    return this.#policy.onRetry(listener);
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
        throw new HttpError(
          res.status,
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
