import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
} from '@metamask/base-data-service';
import { Json, assert } from '@metamask/utils';
import {
  hashKey,
  hydrate,
  QueryClient,
  InvalidateQueryFilters,
  InvalidateOptions,
  QueryKey,
  QueryClientConfig,
  MutationOptions,
} from '@tanstack/query-core';
import { v4 as uuidV4 } from 'uuid';

import { hydrateMutations, readGlobalId } from './hydrateMutations.js';
import { createModuleLogger, projectLogger } from './loggers.js';

const log = createModuleLogger(projectLogger, 'createUIQueryClient');

/**
 * Handles granular cache update events emitted by data services.
 */
type DataServiceGranularCacheUpdatedHandler = (
  payload: DataServiceGranularCacheUpdatedPayload,
) => void;

/**
 * A narrower subset of the `Messenger` type, tailored to the messenger
 * that `createUIQueryClient` interacts with.
 */
type MessengerAdapter<DataServiceName extends string> = {
  /**
   * Call an action on one of the configured data services.
   *
   * Note: The parameters are typed as `unknown[]` rather than `Json[]`. For
   * concrete messengers, each action's parameters exist as fixed-length tuple,
   * and a variadic `Json[]` is not assignable to a fixed-length tuple, so using
   * `Json[]` here would reject otherwise valid messengers.
   */
  call(
    actionType: `${DataServiceName}:${string}`,
    ...params: unknown[]
  ): unknown;

  /**
   * Subscribe to a granular cache update event on one of the configured data
   * services.
   */
  subscribe(
    eventType: DataServiceGranularCacheUpdatedEvent<DataServiceName>['type'],
    handler: DataServiceGranularCacheUpdatedHandler,
  ): void;

  /**
   * Unsubscribe from a granular cache update event on one of the configured
   * data services.
   */
  unsubscribe(
    eventType: DataServiceGranularCacheUpdatedEvent<DataServiceName>['type'],
    handler: DataServiceGranularCacheUpdatedHandler,
  ): void;
};

/**
 * Create a QueryClient that queries and subscribes to data services using a
 * messenger adapter. This is a messenger-like object that carries some
 * constraints:
 *
 * 1. The messenger must support the `call`, `subscribe` and
 *    `unsubscribe` methods.
 * 2. All action handler arguments and event payloads must be JSON-compatible.
 * 3. The messenger must minimally support actions that are scoped to the
 *    designated data services and must minimally support the
 *    `:cacheUpdated:${hash}` event scoped to the designated data services.
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

  // Tracks how many mutation observers are currently relying on each mutation
  // key's cache subscription. Unlike queries, a `Mutation` does not expose its
  // observer count publicly, so we count observers ourselves and only tear down
  // the messenger subscription once the last observer for a key is removed.
  const mutationObserverCounts = new Map<string, number>();

  /**
   * Check whether a name is one of the provided data service names.
   *
   * @param service - The service name to check.
   * @returns Whether the service name is configured.
   */
  function isRecognizedDataService(
    service: string,
  ): service is DataServiceNames[number] {
    return dataServices.some((dataService) => dataService === service);
  }

  /**
   * Check whether an action belongs to one of the provided data services.
   *
   * @param action - The action name to check.
   * @returns Whether the action belongs to a configured data service.
   */
  function isRecognizedDataServiceAction(
    action: string,
  ): action is `${DataServiceNames[number]}:${string}` {
    return isRecognizedDataService(action.split(':')[0]);
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

    if (!isRecognizedDataService(service)) {
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
            typeof action === 'string' && isRecognizedDataServiceAction(action),
            "You must pass a `queryKey` that calls an action on the messenger provided to `createUIQueryClient`, e.g. `queryKey: ['ExampleDataService:getAssets', ...]`.",
          );

          const params = options.queryKey.slice(1);
          if (options.pageParam !== undefined) {
            params.push(options.pageParam);
          }

          return await messenger.call(action, ...params);
        },
      },
      mutations: config.defaultOptions?.mutations,
    },
  });

  const queryCache = client.getQueryCache();
  queryCache.subscribe((event) => {
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
          return;
        }

        log('Hydrating with', payload.state);
        hydrate(client, payload.state);
      };

      subscriptions.set(hash, cacheListener);
      messenger.subscribe(`${service}:cacheUpdated:${hash}`, cacheListener);
    } else if (
      event.type === 'observerRemoved' &&
      observerCount === 0 &&
      hasSubscription
    ) {
      const subscriptionListener = subscriptions.get(hash);

      // We can't write a test for this, as it's unrealistic
      // (we just need a check to appease TypeScript).
      // istanbul ignore next
      if (subscriptionListener) {
        messenger.unsubscribe(
          `${service}:cacheUpdated:${hash}`,
          subscriptionListener,
        );
      }
      subscriptions.delete(hash);
    }
  });

  const mutationCache = client.getMutationCache();
  mutationCache.subscribe((event) => {
    const { mutation } = event;

    if (!mutation?.options.mutationKey) {
      return;
    }

    const hash = hashKey(mutation.options.mutationKey);
    const hasSubscription = subscriptions.has(hash);

    const service = parseQueryKey(mutation.options.mutationKey);

    if (!service) {
      return;
    }

    log(
      `[mutationCache subscription] Received event "${event.type}". Details:`,
      event.mutation,
    );

    if (event.type === 'observerAdded') {
      mutationObserverCounts.set(
        hash,
        (mutationObserverCounts.get(hash) ?? 0) + 1,
      );

      log('[mutationCache subscription] hasSubscription =', hasSubscription);

      if (!hasSubscription) {
        const cacheListener = (
          payload: DataServiceGranularCacheUpdatedPayload,
        ): void => {
          log(
            `[mutationCache subscription] cacheUpdated:${hash} emitted`,
            payload,
          );

          if (payload.type === 'removed') {
            return;
          }

          hydrateMutations(client, payload.state);
        };

        subscriptions.set(hash, cacheListener);
        messenger.subscribe(`${service}:cacheUpdated:${hash}`, cacheListener);
      }
    } else if (event.type === 'observerRemoved' && hasSubscription) {
      // We can assume that if an observed mutation is removed, it must have
      // first been added; and that when it was added, the observer count was
      // initialized. (There's no real way to test the alternative, anyway.)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const remainingObservers = mutationObserverCounts.get(hash)! - 1;

      if (remainingObservers > 0) {
        mutationObserverCounts.set(hash, remainingObservers);
        return;
      }

      mutationObserverCounts.delete(hash);

      const subscriptionListener = subscriptions.get(hash);

      // A subscription always has a listener, since both are set together when
      // the first observer is added.
      // istanbul ignore next
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

  client.invalidateQueries = async (
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void> => {
    const queries = client.getQueryCache().findAll(filters);

    const services = [
      ...new Set(queries.map((query) => parseQueryKey(query.queryKey))),
    ];

    await Promise.all(
      services.map(async (service) => {
        if (!service) {
          return null;
        }

        return messenger.call(`${service}:invalidateQueries`, filters, options);
      }),
    );

    return originalInvalidate(filters, options);
  };

  // Override defaultMutationOptions to check for mutationKey if mutationFn is
  // not provided.
  const originalDefaultMutationOptions =
    client.defaultMutationOptions.bind(client);

  client.defaultMutationOptions = <
    // We are overriding a type in @tanstack/query-core.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Options extends MutationOptions<any, any, any, any>,
  >(
    options?: Options,
  ): Options => {
    const defaultedOptions = originalDefaultMutationOptions(options);

    // Only mutations that fall back to the data-service default `mutationFn`
    // need a `globalId` to correlate the UI and service caches. A mutation with
    // a custom `mutationFn` never reaches a data service, so we leave it alone.
    if (defaultedOptions.mutationFn === undefined) {
      // Generate the `globalId` once and memoize it on `meta` so it stays
      // stable across the mutation's lifetime and can be matched against
      // incoming cache updates.
      const globalId = readGlobalId(defaultedOptions.meta) ?? uuidV4();
      defaultedOptions.meta = { ...defaultedOptions.meta, globalId };

      defaultedOptions.mutationFn = async (): Promise<unknown> => {
        const { mutationKey } = defaultedOptions;

        assert(
          mutationKey !== undefined,
          "You must pass a `mutationKey` that calls an action on the messenger provided to `createUIQueryClient`, e.g. `mutationKey: ['ExampleDataService:createOrder', ...]`.",
        );

        const [action, ...params] = mutationKey;

        assert(
          typeof action === 'string' && isRecognizedDataServiceAction(action),
          "You must pass a `mutationKey` that calls an action on the messenger provided to `createUIQueryClient`, e.g. `mutationKey: ['ExampleDataService:createOrder', ...]`.",
        );

        log(`Detected mutation request, calling action: "${action}"`);

        // The `globalId` is passed as the trailing action argument. Each data
        // service mutation method forwards it into `executeMutation`, which
        // echoes it back on the service-side mutation's `meta`.
        return await messenger.call(action, ...(params as Json[]), globalId);
      };
    }

    return defaultedOptions;
  };

  return client;
}
