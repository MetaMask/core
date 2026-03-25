import { DataServiceGranularCacheUpdatedPayload } from '@metamask/base-data-service';
import { assert, Json } from '@metamask/utils';
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

type SubscriptionCallback = (
  payload: DataServiceGranularCacheUpdatedPayload,
) => void;

type JsonSubscriptionCallback = (data: Json) => void;

// TODO: Figure out if we can replace with a better Messenger type
type MessengerAdapter = {
  call: (method: string, ...params: Json[]) => Promise<Json | void>;
  subscribe: (method: string, callback: JsonSubscriptionCallback) => void;
  unsubscribe: (method: string, callback: JsonSubscriptionCallback) => void;
};

/**
 * Create a QueryClient queries and subscribes to data services using the messenger.
 *
 * @param dataServices - A list of data services.
 * @param messenger - A messenger adapter.
 * @param config - Optional query client configuration options.
 * @returns The QueryClient.
 */
export function createUIQueryClient(
  dataServices: string[],
  messenger: MessengerAdapter,
  config: QueryClientConfig = {},
): QueryClient {
  const subscriptions = new Map<string, SubscriptionCallback>();

  /**
   * Parse a query key to detect a service name.
   *
   * @param queryKey - The query key.
   * @returns The service name if it parsing succeeded, otherwise null.
   */
  function parseQueryKey(queryKey: QueryKey): string | null {
    const action = queryKey[0];

    if (typeof action !== 'string') {
      return null;
    }

    const service = action.split(':')[0];

    if (!dataServices.includes(service)) {
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
            typeof action === 'string' &&
              dataServices.includes(action.split(':')?.[0]),
            "Queries must call actions on the messenger provided to createUIQueryClient, e.g. `queryKey: ['ExampleDataService:getAssets', ...]`.",
          );

          return await messenger.call(
            action,
            ...(options.queryKey.slice(1) as Json[]),
            options.pageParam,
          );
        },
        staleTime: 0,
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
      const cacheListener = (
        payload: DataServiceGranularCacheUpdatedPayload,
      ): void => {
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
      messenger.subscribe(
        `${service}:cacheUpdated:${hash}`,
        cacheListener as JsonSubscriptionCallback,
      );
    } else if (
      event.type === 'observerRemoved' &&
      observerCount === 0 &&
      hasSubscription
    ) {
      const subscriptionListener = subscriptions.get(hash);

      messenger.unsubscribe(
        `${service}:cacheUpdated:${hash}`,
        subscriptionListener as JsonSubscriptionCallback,
      );
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

        return messenger.call(
          `${service}:invalidateQueries`,
          filters as Json,
          options as Json,
        );
      }),
    );

    return originalInvalidate(filters, options);
  };

  return client;
}
