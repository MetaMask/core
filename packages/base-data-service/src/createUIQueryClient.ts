import { assert, Json } from '@metamask/utils';
import {
  hydrate,
  QueryClient,
  InvalidateQueryFilters,
  InvalidateOptions,
  OmitKeyof,
  parseFilterArgs,
  QueryKey,
} from '@tanstack/query-core';

import { CacheUpdatePayload } from './BaseDataService';

type SubscriptionCallback = (payload: CacheUpdatePayload) => void;
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
 * @returns The QueryClient.
 */
export function createUIQueryClient(
  dataServices: string[],
  messenger: MessengerAdapter,
): QueryClient {
  const subscriptions = new Map<string, SubscriptionCallback>();

  const getServiceFromQueryKey = (queryKey: QueryKey): string | null => {
    try {
      const action = queryKey[0];
      assert(typeof action === 'string');

      const service = action.split(':')[0];
      assert(dataServices.includes(service));

      return service;
    } catch {
      return null;
    }
  };

  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async (options): Promise<Json> => {
          const { queryKey } = options;

          const action = queryKey?.[0];

          assert(
            typeof action === 'string',
            'The first element of a query key must be a string.',
          );

          assert(
            dataServices.includes(action.split(':')?.[0]),
            'Queries must use data service actions.',
          );

          return (await messenger.call(
            action,
            ...(options.queryKey.slice(1) as Json[]),
            options.pageParam,
          )) as Json;
        },
        // TODO: Decide on values for these.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
      },
    },
  });

  client.getQueryCache().subscribe((event) => {
    const { query } = event;

    const hash = query.queryHash;
    const hasSubscription = subscriptions.has(hash);
    const observerCount = query.getObserversCount();

    const service = getServiceFromQueryKey(query.queryKey);

    if (!service) {
      return;
    }

    if (
      !hasSubscription &&
      event.type === 'observerAdded' &&
      observerCount === 1
    ) {
      const cacheListener = (payload: CacheUpdatePayload): void => {
        hydrate(client, payload.state);
      };

      subscriptions.set(hash, cacheListener);
      messenger.subscribe(
        `${service}:cacheUpdate:${hash}`,
        cacheListener as unknown as JsonSubscriptionCallback,
      );
    } else if (
      event.type === 'observerRemoved' &&
      observerCount === 0 &&
      hasSubscription
    ) {
      const subscriptionListener = subscriptions.get(
        hash,
      ) as unknown as JsonSubscriptionCallback;

      messenger.unsubscribe(
        `${service}:cacheUpdate:${hash}`,
        subscriptionListener,
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
    await Promise.all(
      queries.map(async (query) => {
        const service = getServiceFromQueryKey(query.queryKey);

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
