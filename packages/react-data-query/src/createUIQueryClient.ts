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
  Mutation,
  MutationOptions,
  MutationState,
  MutationFunction,
  MutationFunctionContext,
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
 * Create a QueryClient that enables data services to power queries and mutations via a messenger adapter.
 *
 * This returns a wrapped version of TanStack Query's QueryClient interface. Note that while some methods such as `invalidateQueries` have support for data services, some such as `setQueryData` do not.
 *
 * @param dataServices - A list of data services.
 * @param messenger - A messenger-like object with the following constraints: 1) the messenger must support the `call`, `subscribe` and `unsubscribe` methods; 2) all action handler arguments and event payloads must be JSON-compatible; 3) the messenger must minimally support actions that are scoped to the designated data services and must minimally support the `:cacheUpdated:${hash}` event scoped to the designated data services.
 * @param config - Optional query client configuration options.
 * @returns The created QueryClient.
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

  // Tracks the `mutationFn`s that we install for data-service mutations, so the
  // `build` override below can tell them apart from user-provided ones and only
  // assign a `globalId` to mutations that are actually routed to a data
  // service.
  const dataServiceMutationFns = new WeakSet<
    // We are interoperating with generic `mutationFn`s from @tanstack/query-core.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MutationFunction<any, any>
  >();

  // Override `defaultMutationOptions` so that `mutationFn` uses the
  // `mutationKey` to call an action on a data service through the messenger.

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

    if (defaultedOptions.mutationFn === undefined) {
      const dataServiceMutationFn = async (
        _variables: unknown,
        context: MutationFunctionContext,
      ): Promise<unknown> => {
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

        // Thanks to our `MutationCache.build` override below, by the time this
        // `mutationFn` runs, our mutation *should* already have a `globalId`
        // (which is available via `context.meta`).
        const globalId = readGlobalId(context.meta);
        // We can't realistically test that it doesn't, since
        // `MutationCache.build` always runs first.
        // istanbul ignore next
        if (globalId === undefined) {
          assert('Expected mutation to have a `globalId`.');
        }

        return await messenger.call(action, ...(params as Json[]), globalId);
      };

      dataServiceMutationFns.add(dataServiceMutationFn);
      defaultedOptions.mutationFn = dataServiceMutationFn;
    }

    return defaultedOptions;
  };

  // Override `build` to ensure that any data-service mutation created via
  // `executeMutation` or manually has a `globalId`.

  const originalBuildMutation = mutationCache.build.bind(mutationCache);

  mutationCache.build = function <TData, TError, TVariables, TOnMutateResult>(
    buildClient: QueryClient,
    options: MutationOptions<TData, TError, TVariables, TOnMutateResult>,
    state?: MutationState<TData, TError, TVariables, TOnMutateResult>,
  ): Mutation<TData, TError, TVariables, TOnMutateResult> {
    const mutation = originalBuildMutation(buildClient, options, state);
    const { mutationFn } = mutation.options;

    // Only mutations routed to a data service need a `globalId`, and only if
    // they don't already have one (e.g., a mutation rebuilt from dehydrated
    // service state may already have one).
    // We recognize data-service mutation functions by consulting a WeakSet
    // (and we use a WeakSet to distinguish mutation functions that *we*
    // installed via the `defaultMutationOptions` override above, vs. ones that
    // the engineer has added).
    if (
      mutationFn === undefined ||
      !dataServiceMutationFns.has(mutationFn) ||
      readGlobalId(mutation.options.meta) !== undefined
    ) {
      return mutation;
    }

    const globalId = uuidV4();

    // Give the mutation its own `options`/`meta` objects rather than mutating
    // in place. When options are already defaulted, TanStack returns the shared
    // observer options as-is, so mutating them would leak this mutation's
    // `globalId` back onto the observer and cause the next mutation built from
    // that observer to reuse the same id.
    const originalSetMutationOptions = mutation.setOptions.bind(mutation);
    originalSetMutationOptions({
      ...mutation.options,
      meta: { ...mutation.options.meta, globalId },
    });

    // `MutationObserver.setOptions` (triggered on every re-render) replaces a
    // pending mutation's options wholesale, which would otherwise strip the
    // `globalId` and stop the mutation from matching its service-side cache
    // updates. Preserve the established `globalId` across such updates.
    mutation.setOptions = (nextOptions): void => {
      originalSetMutationOptions({
        ...nextOptions,
        meta: { ...nextOptions.meta, globalId },
      });
    };

    return mutation;
  };

  return client;
}
