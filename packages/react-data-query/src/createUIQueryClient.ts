import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
  DataServiceInvalidateQueriesAction,
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
 * A messenger that is loosely typed so that any concrete messenger can be
 * passed to `createUIQueryClient` regardless of which actions and events it
 * declares. The `SupportsDataServices` constraint is layered on top of this to
 * verify that the required data service capabilities are present.
 *
 * This is loose on purpose: modeling the parameter as a fixed structural shape
 * whose `call` accepts an open-ended `${DataServiceName}:${string}` template
 * literal would force a concrete messenger's own generic `call` (bounded by its
 * declared action union) to accept action types it does not declare, which is
 * impossible. That is why the previous type only accepted a messenger by
 * coincidence — when every action it declared happened to belong to the
 * requested namespaces — and broke as soon as an unrelated namespace was added.
 */
type LooseMessenger = Messenger<
  string,
  ActionConstraint,
  EventConstraint,
  // Use `any` for the parent so any messenger, delegated or not, is accepted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

/**
 * Verify that a messenger minimally supports the capabilities that
 * `createUIQueryClient` relies on for each designated data service, while
 * permitting it to declare any number of additional actions and events.
 *
 * The required `:invalidateQueries` action and `:cacheUpdated:${hash}` event
 * are checked to be members of the messenger's own action and event unions
 * (extracted via `MessengerActions`/`MessengerEvents`). This expresses
 * "minimally support these data services, but you may support more" — which is
 * the intended contract.
 *
 * Resolves to the messenger type when it is supported, and to `never` (which
 * makes the parameter unsatisfiable) when it is not. This mirrors the pattern
 * used by `BaseController` in `@metamask/base-controller`.
 *
 * @template MessengerType - The concrete messenger type being passed.
 * @template DataServiceName - The union of designated data service names.
 */
type SupportsDataServices<
  MessengerType extends LooseMessenger,
  DataServiceName extends string,
> = DataServiceInvalidateQueriesAction<
  DataServiceName
>['type'] extends MessengerActions<MessengerType>['type']
  ? DataServiceGranularCacheUpdatedEvent<
      DataServiceName
    >['type'] extends MessengerEvents<MessengerType>['type']
    ? MessengerType
    : never
  : never;

/**
 * The narrow view of the messenger that `createUIQueryClient` uses internally.
 * Once `SupportsDataServices` has verified that a concrete messenger declares
 * the required capabilities, the messenger is treated as this adapter so that
 * the implementation can call actions and (un)subscribe to events using the
 * template-literal types it constructs at runtime (e.g.
 * `${service}:invalidateQueries`), which the messenger's own generic methods
 * cannot express directly.
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
 * Create a QueryClient queries and subscribes to data services using the messenger.
 *
 * @param dataServices - A list of data services.
 * @param rawMessenger - A messenger, with some constraints:
 * 1. The messenger must minimally support the `call`, `subscribe` and `unsubscribe` methods.
 * 2. All action handlers must be asynchronous (must return promises).
 * 3. All action handler arguments and event payloads must be JSON-compatible.
 * 4. The messenger must minimally support capabilities that belong to the designated data services,
 *    and it must minimally support the `:cacheUpdated:${hash}` event of the the designated data services.
 *    The messenger may additionally support actions and events from other namespaces.
 * @param config - Optional query client configuration options.
 * @returns The QueryClient.
 */
export function createUIQueryClient<
  DataServiceNames extends readonly string[],
  MessengerType extends LooseMessenger,
>(
  dataServices: DataServiceNames,
  rawMessenger: SupportsDataServices<MessengerType, DataServiceNames[number]>,
  config: QueryClientConfig = {},
): QueryClient {
  // Type assertion: `SupportsDataServices` has already verified that the
  // messenger declares the `:invalidateQueries` action and
  // `:cacheUpdated:${hash}` event for every designated data service. The
  // messenger's own generic `call`/`subscribe`/`unsubscribe` methods cannot be
  // expressed in terms of the open-ended template-literal types the body builds
  // at runtime, so we view the messenger through the narrower `MessengerAdapter`
  // shape for the rest of the implementation.
  const messenger = rawMessenger as unknown as MessengerAdapter<
    DataServiceNames[number]
  >;

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

          return await messenger.call(
            action,
            ...options.queryKey.slice(1),
            options.pageParam,
          );
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
