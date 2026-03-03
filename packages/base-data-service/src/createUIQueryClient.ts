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

// When UI messengers are available this should simply be a proper messenger that allows access to DataServiceActions
type MessengerAdapter = {
  call: (method: string, ...params: Json[]) => Promise<Json | void>;
  subscribe: (method: string, callback: (data: Json) => void) => void;
  unsubscribe: (method: string, callback: (data: Json) => void) => void;
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

  const cacheListener = (data: Json): void => {
    const castData = data as { hash: string; state: Json };
    if (subscriptions.has(castData.hash)) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      hydrate(client, castData.state);
    }
  };

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
      subscriptions.add(hash);

      // This is a bit of a mess because we can't pass functions across the process boundary, so we call subscribe
      // but also register listeners for :cacheUpdate which will be sent to subscribed processes
      messenger.subscribe(`${service}:cacheUpdate`, cacheListener);

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

      messenger.unsubscribe(`${service}:cacheUpdate`, cacheListener);

      messenger
        .call(`${service}:unsubscribe`, query.queryKey)
        .catch(console.error);
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
