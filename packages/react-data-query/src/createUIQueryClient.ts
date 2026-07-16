import type {
  DataServiceActions,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
} from '@metamask/base-data-service';
import type {
  ActionConstraint,
  EventConstraint,
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
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
 * The supertype of all messengers.
 *
 * Used as the upper bound for the messenger type variable so that any concrete
 * {@link Messenger} can be passed, with {@link SupportsDataServices} layered on
 * top to verify the required data service capabilities are present. We cannot
 * instead require a fixed structural shape whose `call` accepts an open-ended
 * `${DataServiceName}:${string}` template literal: a concrete messenger's own
 * generic `call` is bounded by its declared action union, so it cannot accept
 * action types it does not declare, and such a shape would reject any messenger
 * that declares actions from additional namespaces.
 */
type GenericMessenger = Messenger<
  string,
  ActionConstraint,
  EventConstraint,
  // Use `any` for the parent so any messenger, delegated or not, is accepted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

/**
 * A messenger that minimally supports a subset of capabilities that data
 * services with the given namespaces would provide. Specifically, of these
 * namespaces, it must at least allow all data service actions to be called, and
 * it must at least allow the `:cacheUpdated:${hash}` event to be subscribed to.
 */
type SupportsDataServices<
  MessengerInstance extends GenericMessenger,
  DataServiceName extends string,
> = DataServiceActions<DataServiceName>['type'] extends MessengerActions<MessengerInstance>['type']
  ? DataServiceGranularCacheUpdatedEvent<DataServiceName>['type'] extends MessengerEvents<MessengerInstance>['type']
    ? MessengerInstance
    : never
  : never;

/**
 * A messenger adapter: the narrow, messenger-like shape that
 * `createUIQueryClient` interacts with. This is what the function uses
 * internally, and it may also be passed in directly by callers that do not have
 * a full {@link Messenger} instance (e.g. a hand-rolled object that forwards to
 * some other transport).
 */
type MessengerAdapter<DataServiceName extends string> = {
  /**
   * Call an action on one of the configured data services.
   *
   * Note: The parameters are typed as `unknown[]` rather than `Json[]`.
   * Concrete messengers declare each action's parameters as a fixed-length
   * tuple, and a variadic `Json[]` is not assignable to a fixed-length tuple,
   * so using `Json[]` here would reject otherwise valid messengers.
   */
  call(
    actionType: `${DataServiceName}:${string}`,
    ...params: unknown[]
  ): Promise<unknown>;

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
 * messenger adapter.
 *
 * This overload accepts a messenger adapter (see {@link MessengerAdapter}) —
 * any object that exposes the `call`, `subscribe`, and `unsubscribe` methods
 * for the designated data services. Use this when you do not have a full
 * {@link Messenger} instance on hand.
 *
 * @param dataServices - A list of data services.
 * @param messenger - A messenger adapter.
 * @param config - Optional query client configuration options.
 * @returns The QueryClient.
 */
export function createUIQueryClient<DataServiceNames extends readonly string[]>(
  dataServices: DataServiceNames,
  messenger: MessengerAdapter<DataServiceNames[number]>,
  config?: QueryClientConfig,
): QueryClient;

/**
 * Create a QueryClient that queries and subscribes to data services using a
 * messenger.
 *
 * This overload accepts a full {@link Messenger} instance, with some
 * constraints:
 * 1. The messenger must minimally support the `call`, `subscribe` and
 *    `unsubscribe` methods.
 * 2. All action handler arguments and event payloads must be JSON-compatible.
 * 3. The messenger must minimally support capabilities that belong to the
 *    designated data services and must minimally support the
 *    `:cacheUpdated:${hash}` event of the the designated data services.
 *
 * @param dataServices - A list of data services.
 * @param messenger - A messenger.
 * @param config - Optional query client configuration options.
 * @returns The QueryClient.
 */
export function createUIQueryClient<
  DataServiceNames extends readonly string[],
  MessengerInstance extends GenericMessenger,
>(
  dataServices: DataServiceNames,
  messenger: Pick<
    SupportsDataServices<MessengerInstance, DataServiceNames[number]>,
    'call' | 'subscribe' | 'unsubscribe'
  >,
  config?: QueryClientConfig,
): QueryClient;

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
            "Queries must call actions on the messenger provided to createUIQueryClient, e.g. `queryKey: ['ExampleDataService:getAssets', ...]`.",
          );

          const params = options.queryKey.slice(1);

          // `pageParam` is only present for infinite (paginated) queries. For
          // regular queries it is `undefined`, so we omit it to avoid passing a
          // trailing `undefined` argument to the action handler.
          if (options.pageParam !== undefined) {
            params.push(options.pageParam);
          }

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
          return;
        }

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

        return messenger.call(`${service}:invalidateQueries`, filters, options);
      }),
    );

    return originalInvalidate(filters, options);
  };

  return client;
}
