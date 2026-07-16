import type {
  DataServiceActions,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
} from '@metamask/base-data-service';
import type {
  ActionConstraint,
  EventConstraint,
  Messenger,
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
 * A narrower subset of the `Messenger` type, tailored to the messenger
 * that `createUIQueryClient` interacts with.
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
 * Given a messenger, resolves to that same messenger when it minimally supports
 * the capabilities that data services with the given namespaces provide, and to
 * `never` otherwise.
 *
 * Specifically, of these namespaces, the messenger must at least allow all data
 * service actions to be called, and it must at least allow the
 * `:cacheUpdated:${hash}` event to be subscribed to.
 *
 * Notes on the implementation:
 *
 * - The messenger type is not constrained (e.g. to `Messenger`). A concrete
 *   messenger declares a narrow action/event union, which is *not* assignable to
 *   the wide `ActionConstraint`/`EventConstraint` used by the base `Messenger`
 *   type (the handler parameters are effectively invariant), so constraining the
 *   type variable would reject real messengers such as subclasses with large
 *   action unions. Instead we `infer` the action and event unions directly.
 * - The supported branch resolves to the messenger type itself. Resolving it to
 *   `MessengerAdapter` instead would reject a real messenger, because a concrete
 *   messenger's generic `call` cannot satisfy the adapter's open-ended
 *   `${DataServiceName}:${string}` action type.
 */
type SupportsDataServices<MessengerInstance, DataServiceName extends string> =
  MessengerInstance extends Messenger<
    string,
    infer Action extends ActionConstraint,
    infer Event extends EventConstraint,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? DataServiceActions<DataServiceName>['type'] extends Action['type']
      ? DataServiceGranularCacheUpdatedEvent<DataServiceName>['type'] extends Event['type']
        ? MessengerInstance
        : never
      : never
    : never;

/**
 * Create a QueryClient that queries and subscribes to data services using a
 * messenger adapter, a messenger-like object that carries some constraints:
 *
 * 1. The messenger must support the `call`, `subscribe` and
 *    `unsubscribe` methods.
 * 2. All action handler arguments and event payloads must be JSON-compatible.
 * 3. The messenger must minimally support capabilities that belong to the
 *    designated data services and must minimally support the
 *    `:cacheUpdated:${hash}` event of the the designated data services.
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
 * messenger. This messenger carries some constraints:
 *
 * 1. All action handler arguments and event payloads must be JSON-compatible.
 * 2. The messenger must minimally support capabilities that belong to the
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
  MessengerInstance,
>(
  dataServices: DataServiceNames,
  messenger: SupportsDataServices<MessengerInstance, DataServiceNames[number]>,
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
