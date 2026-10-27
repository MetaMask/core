import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { QueryFunctionContext } from '@tanstack/query-core';

import type { ConfigRegistryApiServiceMethodActions } from './config-registry-api-service-method-action-types.js';
import type {
  FetchConfigOptions,
  FetchConfigResult,
  FetchEventsConfigResult,
} from './types.js';
import {
  FetchConfigResultStruct,
  FetchEventsConfigResultStruct,
} from './types.js';

const NETWORKS_ENDPOINT_PATH = '/config/networks';
const EVENTS_CONFIG_ENDPOINT_PATH = '/config/events-config';

export enum ConfigRegistryApiEnv {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prod',
}

/**
 * The name of the {@link ConfigRegistryApiService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'ConfigRegistryApiService';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['fetchConfig', 'fetchEventsConfig'] as const;

/**
 * Invalidates cached queries for {@link ConfigRegistryApiService}.
 */
export type ConfigRegistryApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link ConfigRegistryApiService} exposes to other consumers.
 */
export type ConfigRegistryApiServiceActions =
  | ConfigRegistryApiServiceMethodActions
  | ConfigRegistryApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ConfigRegistryApiServiceMessenger} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link ConfigRegistryApiService}'s cache is updated.
 */
export type ConfigRegistryApiServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link ConfigRegistryApiService}'s cache is
 * updated.
 */
export type ConfigRegistryApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link ConfigRegistryApiService} exposes to other consumers.
 */
export type ConfigRegistryApiServiceEvents =
  | ConfigRegistryApiServiceCacheUpdatedEvent
  | ConfigRegistryApiServiceGranularCacheUpdatedEvent;

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
 * @param endpointPath - The endpoint path to append.
 * @returns The full URL for the endpoint.
 */
function getConfigRegistryUrl(
  env: ConfigRegistryApiEnv,
  endpointPath: string,
): string {
  const envPrefix = env === ConfigRegistryApiEnv.PRD ? '' : `${env}-`;
  return `https://client-config.${envPrefix}api.cx.metamask.io/v1${endpointPath}`;
}

export type ConfigRegistryApiServiceOptions = {
  /**
   * The messenger suited for this service. Required so the service can be used
   * independently and register its actions.
   */
  messenger: ConfigRegistryApiServiceMessenger;
  env?: ConfigRegistryApiEnv;
  fetch?: typeof fetch;
  /**
   * Options to pass to `createServicePolicy`, which wraps each request.
   * See {@link CreateServicePolicyOptions}.
   */
  policyOptions?: CreateServicePolicyOptions;
};

export class ConfigRegistryApiService extends BaseDataService<
  typeof serviceName,
  ConfigRegistryApiServiceMessenger
> {
  readonly #networksUrl: string;

  readonly #eventsConfigUrl: string;

  readonly #fetch: typeof fetch;

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
    env = ConfigRegistryApiEnv.UAT,
    fetch: customFetch = globalThis.fetch,
    policyOptions = {},
  }: ConfigRegistryApiServiceOptions) {
    super({
      name: serviceName,
      messenger,
      policyOptions,
    });

    this.#networksUrl = getConfigRegistryUrl(env, NETWORKS_ENDPOINT_PATH);
    this.#eventsConfigUrl = getConfigRegistryUrl(
      env,
      EVENTS_CONFIG_ENDPOINT_PATH,
    );
    this.#fetch = customFetch;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
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

    return this.fetchQuery({
      queryKey: [`${this.name}:fetchConfig`],
      staleTime: 0,
      responseStruct: FetchConfigResultStruct,
      queryFn: async ({
        client,
        queryKey,
      }: QueryFunctionContext<[string]>): Promise<FetchConfigResult> => {
        const res = await this.#fetch(this.#networksUrl, { headers });
        const etag = res.headers.get('ETag');

        if (res.status === 304) {
          const previous = client.getQueryData<FetchConfigResult>(queryKey);
          return { modified: false, etag, data: previous?.data ?? null };
        }

        if (!res.ok) {
          throw new HttpError(
            res.status,
            `Failed to fetch config: ${res.status} ${res.statusText}`,
          );
        }

        return { modified: true, etag, data: await res.json() };
      },
    });
  }

  async fetchEventsConfig(
    options: FetchConfigOptions = {},
  ): Promise<FetchEventsConfigResult> {
    const headers: HeadersInit = {
      'Cache-Control': 'no-cache',
    };

    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }

    return this.fetchQuery({
      queryKey: [`${this.name}:fetchEventsConfig`],
      staleTime: 0,
      responseStruct: FetchEventsConfigResultStruct,
      queryFn: async ({
        client,
        queryKey,
      }: QueryFunctionContext<[string]>): Promise<FetchEventsConfigResult> => {
        const res = await this.#fetch(this.#eventsConfigUrl, { headers });
        const etag = res.headers.get('ETag');

        if (res.status === 304) {
          const previous =
            client.getQueryData<FetchEventsConfigResult>(queryKey);
          return { modified: false, etag, data: previous?.data ?? null };
        }

        if (!res.ok) {
          throw new HttpError(
            res.status,
            `Failed to fetch events config: ${res.status} ${res.statusText}`,
          );
        }

        return { modified: true, etag, data: await res.json() };
      },
    });
  }
}
