import { assert, Json } from '@metamask/utils';
import {
  hydrate,
  QueryClient,
  InvalidateQueryFilters,
  InvalidateOptions,
} from '@tanstack/query-core';

type QueryKey = readonly [string, ...Json[]];

function getServiceFromQueryKey(queryKey: QueryKey): string {
  return queryKey[0].split(':')[0];
}

type MessengerAdapter = {
  call: (method: string, ...params: Json[]) => Promise<Json>;
  subscribe: (method: string, callback: (data: Json) => void) => void;
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
  const subscriptions = new Set<string>();

  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async (options): Promise<Json> => {
          const { queryKey } = options;

          const potentialAction = queryKey?.[0];

          assert(
            typeof potentialAction === 'string',
            'The first element of a query key must be a string.',
          );
          assert(
            dataServices.includes(potentialAction?.split(':')?.[0]),
            'Queries must use data service actions.',
          );

          return await messenger.call(
            potentialAction,
            options as unknown as Json,
          );
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
    if (!query) {
      return;
    }

    const hash = query.queryHash;
    const hasSubscription = subscriptions.has(hash);
    const observerCount = query.getObserversCount();

    const service = getServiceFromQueryKey(query.queryKey);

    if (
      !hasSubscription &&
      event.type === 'observerAdded' &&
      observerCount === 1
    ) {
      subscriptions.add(hash);

      // Lazily subscribe to the cache updates broadcast by the data service
      messenger.subscribe(`${service}:cacheUpdate`, (data) => {
        const castData = data as { hash: string; state: Json };
        if (subscriptions.has(castData.hash)) {
          hydrate(client, castData.state);
        }
      });

      messenger
        .call(`${service}:subscribe`, query.queryKey)
        .then((state) => hydrate(client, state))
        .catch(console.error);
    } else if (
      event.type === 'observerRemoved' &&
      observerCount === 0 &&
      hasSubscription
    ) {
      subscriptions.delete(hash);
      messenger
        .call(`${service}:unsubscribe`, query.queryKey)
        .catch(console.error);
    }
  });

  // Override invalidateQueries to ensure the data service is invalidated as well.
  const originalInvalidate = client.invalidateQueries.bind(client);

  // @ts-expect-error TODO.
  client.invalidateQueries = async (
    filters?: InvalidateQueryFilters<Json>,
    options?: InvalidateOptions,
  ): Promise<void> => {
    const queries = client.getQueryCache().findAll(filters);
    await Promise.all(
      queries.map((query) => {
        const service = getServiceFromQueryKey(query.queryKey as QueryKey);

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
