import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
} from '@metamask/base-data-service';
import { assert } from '@metamask/utils';
import {
  hydrate,
  QueryClient,
  InvalidateQueryFilters,
  InvalidateOptions,
  OmitKeyof,
  parseFilterArgs,
  QueryKey,
  QueryClientConfig,
} from '@tanstack/query-core';

/**
 * Handles granular cache update events emitted by data services.
 */
type DataServiceGranularCacheUpdatedHandler = (
  payload: DataServiceGranularCacheUpdatedPayload,
) => void;

/**
 * The minimum messenger-like shape needed by `createUIQueryClient`.
 *
 * This keeps the supported actions and granular cache events restricted to the
 * data service names passed to `createUIQueryClient` without requiring the full
 * `Messenger` class type.
 */
type MessengerAdapter<DataServiceName extends string> = {
  call(
    actionType: `${DataServiceName}:${string}`,
    ...params: unknown[]
  ): Promise<unknown>;

  subscribe(
    eventType: DataServiceGranularCacheUpdatedEvent<DataServiceName>['type'],
    handler: DataServiceGranularCacheUpdatedHandler,
  ): void;

  unsubscribe(
    eventType: DataServiceGranularCacheUpdatedEvent<DataServiceName>['type'],
    handler: DataServiceGranularCacheUpdatedHandler,
  ): void;
};

/**
 * Create a QueryClient queries and subscribes to data services using the messenger.
 *
 * @param dataServices - A list of data services.
 * @param messenger - A messenger adapter.
 * @param config - Optional query client configuration options.
 * @returns The QueryClient.
 */
export function createUIQueryClient<DataServiceNames extends readonly string[]>(
  dataServices: DataServiceNames,
  messenger: MessengerAdapter<DataServiceNames[number]>,
  config: QueryClientConfig = {},
): QueryClient {
  const subscriptions = new Map<
    string,
    DataServiceGranularCacheUpdatedHandler
  >();

  /**
   * Check whether a name is one of the configured data service names.
   *
   * @param service - The service name to check.
   * @returns Whether the service name is configured.
   */
  function isConfiguredDataService(
    service: string,
  ): service is DataServiceNames[number] {
    return dataServices.some((dataService) => dataService === service);
  }

  /**
   * Check whether an action belongs to one of the configured data services.
   *
   * @param action - The action name to check.
   * @returns Whether the action belongs to a configured data service.
   */
  function isConfiguredDataServiceAction(
    action: string,
  ): action is `${DataServiceNames[number]}:${string}` {
    return isConfiguredDataService(action.split(':')[0]);
  }

  /**
   * Parse a query key to detect a service name.
   *
   * @param queryKey - The query key.
   * @returns The service name if it parsing succeeded, otherwise null.
   */
  function parseQueryKey(queryKey: QueryKey): DataServiceNames[number] | null {
    const action = queryKey[0];

    if (typeof action !== 'string') {
      return null;
    }

    const service = action.split(':')[0];

    if (!isConfiguredDataService(service)) {
      return null;
    }

    return service;
  }

  const client: QueryClient = new QueryClient({
    ...config,
    defaultOptions: {
      queries: {
        ...config.defaultOptions?.queries,
        queryFn: async (options): Promise<unknown> => {
          const { queryKey } = options;

          const action = queryKey[0];

          assert(
            typeof action === 'string' && isConfiguredDataServiceAction(action),
            "Queries must call actions on the messenger provided to createUIQueryClient, e.g. `queryKey: ['ExampleDataService:getAssets', ...]`.",
          );

          const params = [
            ...options.queryKey.slice(1),
            options.pageParam,
          ] as unknown[];

          return await messenger.call(action, ...params);
        },
      },
      mutations: config.defaultOptions?.mutations,
    },
  });

  const cache = client.getQueryCache();

  cache.subscribe((event) => {
    const { query } = event;

    const hash = query.queryHash;
    const hasSubscription = subscriptions.has(hash);
    const observerCount = query.getObserversCount();

    const service = parseQueryKey(query.queryKey);

    if (!service) {
      return;
    }

    if (
      !hasSubscription &&
      event.type === 'observerAdded' &&
      observerCount === 1
    ) {
      const cacheListener: DataServiceGranularCacheUpdatedHandler = (
        payload,
      ) => {
        if (payload.type === 'removed') {
          const currentQuery = cache.get(hash);

          if (currentQuery) {
            cache.remove(currentQuery);
          }
        } else {
          hydrate(client, payload.state);
        }
      };

      subscriptions.set(hash, cacheListener);
      messenger.subscribe(`${service}:cacheUpdated:${hash}`, cacheListener);
    } else if (
      event.type === 'observerRemoved' &&
      observerCount === 0 &&
      hasSubscription
    ) {
      const subscriptionListener = subscriptions.get(hash);

      if (subscriptionListener) {
        messenger.unsubscribe(
          `${service}:cacheUpdated:${hash}`,
          subscriptionListener,
        );
      }
      subscriptions.delete(hash);
    }
  });

  // Override invalidateQueries to ensure the data service is invalidated as well.
  const originalInvalidate = client.invalidateQueries.bind(client);

  // This function is defined in this way to have full support for all function overloads.
  client.invalidateQueries = async (
    arg1?: QueryKey | InvalidateQueryFilters,
    arg2?: OmitKeyof<InvalidateQueryFilters, 'queryKey'> | InvalidateOptions,
    arg3?: InvalidateOptions,
  ): Promise<void> => {
    const [filters, options] = parseFilterArgs(arg1, arg2, arg3);

    const queries = client.getQueryCache().findAll(filters);

    const services = [
      ...new Set(queries.map((query) => parseQueryKey(query.queryKey))),
    ];

    await Promise.all(
      services.map(async (service) => {
        if (!service) {
          return null;
        }

        if (options === undefined) {
          return messenger.call(`${service}:invalidateQueries`, filters);
        }

        return messenger.call(`${service}:invalidateQueries`, filters, options);
      }),
    );

    return originalInvalidate(filters, options);
  };

  return client;
}
