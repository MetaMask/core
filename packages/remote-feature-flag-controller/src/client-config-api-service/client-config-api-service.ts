import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { array, record, string } from '@metamask/superstruct';
import { JsonStruct } from '@metamask/utils';

import { BASE_URL } from '../constants.js';
import type {
  FeatureFlags,
  ClientType,
  DistributionType,
  EnvironmentType,
  ServiceResponse,
} from '../remote-feature-flag-controller-types.js';
import type { ClientConfigApiServiceMethodActions } from './client-config-api-service-method-action-types.js';

// === GENERAL ===

/**
 * The name of the {@link ClientConfigApiService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'ClientConfigApiService';

/**
 * Describes the shape of the ClientConfig API response: an array of objects,
 * each holding feature flag key value pairs.
 */
const FeatureFlagsResponseStruct = array(record(string(), JsonStruct));

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['fetchRemoteFeatureFlags'] as const;

/**
 * Invalidates cached queries for {@link ClientConfigApiService}.
 */
export type ClientConfigApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link ClientConfigApiService} exposes to other consumers.
 */
export type ClientConfigApiServiceActions =
  | ClientConfigApiServiceMethodActions
  | ClientConfigApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ClientConfigApiServiceMessenger}
 * calls.
 */
type AllowedActions = never;

/**
 * Published when {@link ClientConfigApiService}'s cache is updated.
 */
export type ClientConfigApiServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link ClientConfigApiService}'s cache is
 * updated.
 */
export type ClientConfigApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link ClientConfigApiService} exposes to other consumers.
 */
export type ClientConfigApiServiceEvents =
  | ClientConfigApiServiceCacheUpdatedEvent
  | ClientConfigApiServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link ClientConfigApiService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ClientConfigApiService}.
 */
export type ClientConfigApiServiceMessenger = Messenger<
  typeof serviceName,
  ClientConfigApiServiceActions | AllowedActions,
  ClientConfigApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * This service is responsible for fetching feature flags from the ClientConfig
 * API.
 *
 * Its {@link ClientConfigApiService.fetchRemoteFeatureFlags} method is
 * automatically registered on the messenger so that
 * `RemoteFeatureFlagController` can call it.
 */
export class ClientConfigApiService extends BaseDataService<
  typeof serviceName,
  ClientConfigApiServiceMessenger
> {
  readonly #fetch: typeof fetch;

  readonly #client: ClientType;

  readonly #distribution: DistributionType;

  readonly #environment: EnvironmentType;

  /**
   * Constructs a new ClientConfigApiService object.
   *
   * @param args - The arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * If your JavaScript environment supports `fetch` natively, you'll probably
   * want to pass that; otherwise you can pass an equivalent (such as `fetch`
   * via `node-fetch`).
   * @param args.config - The configuration object, includes client,
   * distribution, and environment.
   * @param args.config.client - The client type (e.g., 'extension', 'mobile').
   * @param args.config.distribution - The distribution type (e.g., 'main',
   * 'flask').
   * @param args.config.environment - The environment type (e.g., 'prod', 'rc',
   * 'dev').
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    config,
    policyOptions = {},
  }: {
    messenger: ClientConfigApiServiceMessenger;
    fetch: typeof fetch;
    config: {
      client: ClientType;
      distribution: DistributionType;
      environment: EnvironmentType;
    };
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({ name: serviceName, messenger, policyOptions });

    this.#fetch = fetchFunction;
    this.#client = config.client;
    this.#distribution = config.distribution;
    this.#environment = config.environment;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches feature flags from the API with specific client, distribution, and
   * environment parameters. Always requests fresh data from the network, and
   * concurrent calls share a single request. Throws if the request fails or
   * the response is not an array of flag objects.
   *
   * @returns The feature flags merged into a single object, and the time they
   * were fetched.
   */
  async fetchRemoteFeatureFlags(): Promise<ServiceResponse> {
    const url = `${BASE_URL}/flags?client=${this.#client}&distribution=${
      this.#distribution
    }&environment=${this.#environment}`;

    const data = await this.fetchQuery({
      queryKey: [`${this.name}:fetchRemoteFeatureFlags`],
      staleTime: 0,
      gcTime: 0,
      responseStruct: FeatureFlagsResponseStruct,
      queryFn: async () => {
        const response = await this.#fetch(url, { cache: 'no-cache' });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to fetch remote feature flags: ${response.status}`,
          );
        }

        return (await response.json()) as FeatureFlags[];
      },
    });

    return {
      remoteFeatureFlags: this.#flattenFeatureFlags(data),
      cacheTimestamp: Date.now(),
    };
  }

  /**
   * Flattens an array of feature flag objects into a single feature flags object.
   *
   * @param responseData - Array of objects containing feature flag key-value pairs
   * @returns A single object containing all feature flags merged together
   * @example
   * // Input: [{ flag1: true }, { flag2: [] }]
   * // Output: { flag1: true, flag2: [] }
   */
  #flattenFeatureFlags(responseData: FeatureFlags[]): FeatureFlags {
    return responseData.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});
  }
}
