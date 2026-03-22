import {
  createServicePolicy,
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import {
  Messenger,
  ActionConstraint,
  EventConstraint,
} from '@metamask/messenger';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import {
  DefaultOptions,
  DehydratedState,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  OmitKeyof,
  QueryClient,
  QueryClientConfig,
  WithRequired,
  dehydrate,
} from '@tanstack/query-core';
import deepEqual from 'fast-deep-equal';

// Data service queries use the following format: ['ServiceActionName', ...params]
export type QueryKey = [string, ...Json[]];

export type GranularCacheUpdatedPayload =
  | { type: 'added' | 'updated'; state: DehydratedState }
  | {
      type: 'removed';
      state: null;
    };

export type CacheUpdatedPayload = GranularCacheUpdatedPayload & {
  hash: string;
};

type CacheUpdatedType = CacheUpdatedPayload['type'];

export type DataServiceInvalidateQueriesAction<ServiceName extends string> = {
  type: `${ServiceName}:invalidateQueries`;
  handler: (
    filters?: InvalidateQueryFilters<Json>,
    options?: InvalidateOptions,
  ) => Promise<void>;
};

export type DataServiceActions<ServiceName extends string> =
  DataServiceInvalidateQueriesAction<ServiceName>;

export type DataServiceCacheUpdatedEvent<ServiceName extends string> = {
  type: `${ServiceName}:cacheUpdated`;
  payload: [CacheUpdatedPayload];
};

export type DataServiceGranularCacheUpdatedEvent<ServiceName extends string> = {
  type: `${ServiceName}:cacheUpdated:${string}`;
  payload: [GranularCacheUpdatedPayload];
};

export type DataServiceEvents<ServiceName extends string> =
  | DataServiceCacheUpdatedEvent<ServiceName>
  | DataServiceGranularCacheUpdatedEvent<ServiceName>;

// Defaults to apply to all data service queries if no default option specified
const queryClientDefaults: DefaultOptions = {
  queries: {
    retry: false,
    staleTime: inMilliseconds(1, Duration.Minute),
  },
};

/**
 * Background-side data service base class.
 *
 * Uses `@tanstack/query-core` as internal infrastructure for caching,
 * deduplication, and garbage collection. The UI does not consume background
 * TQ artifacts directly:
 *
 * - `queryKey` is internal — the messenger event name (e.g.,
 *   `ServiceName:cacheUpdated`) is the contract between background and UI.
 * - `staleTime`, `gcTime`, `retry` are background-internal cache policy.
 *   They govern how the background caches and refreshes data. They do not
 *   leak to the UI.
 * - `cacheUpdated` events are the only UI-visible output.
 *
 * ## When to use
 *
 * Use when data meets background ownership criteria:
 * - Controller dependency (used in business logic: gas estimation, validation)
 * - Process persistence (needed when UI is unmounted)
 * - Externally driven cadence (controller state changes, WebSocket events)
 *
 * For display-only, on-demand data (spot prices, activity, swap quotes),
 * the UI fetches directly via `useQuery` with `get*QueryOptions` from
 * `@metamask/core-backend`. No data service needed.
 *
 * ## UI consumption
 *
 * UI subscribes to `cacheUpdated` events via `createControllerStore` +
 * `useSyncExternalStore` (Option B), or via `createUIQueryClient` +
 * `hydrate()` (Option A). The data service is agnostic to the UI
 * consumption pattern.
 */
export class BaseDataService<
  ServiceName extends string,
  ServiceMessenger extends Messenger<
    ServiceName,
    ActionConstraint,
    EventConstraint,
    // Use `any` to allow any parent to be set. `any` is harmless in a type constraint anyway,
    // it's the one totally safe place to use it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
> {
  public readonly name: ServiceName;

  readonly #messenger: Messenger<
    ServiceName,
    DataServiceActions<ServiceName>,
    DataServiceEvents<ServiceName>
  >;

  protected messenger: ServiceMessenger;

  readonly #policy: ServicePolicy;

  readonly #queryClient: QueryClient;

  readonly #queryCacheUnsubscribe: () => void;

  constructor({
    name,
    messenger,
    queryClientConfig = {},
    servicePolicyOptions,
  }: {
    name: ServiceName;
    messenger: ServiceMessenger;
    queryClientConfig?: QueryClientConfig;
    servicePolicyOptions?: CreateServicePolicyOptions;
  }) {
    this.name = name;

    // We are storing a separately typed messenger for known actions and events provided by data services
    // and a generic public one that is typed using the generic parameters and accessible to implementations.
    this.#messenger = messenger as unknown as Messenger<
      ServiceName,
      DataServiceActions<ServiceName>,
      DataServiceEvents<ServiceName>
    >;
    this.messenger = messenger;

    this.#queryClient = new QueryClient({
      ...queryClientConfig,
      defaultOptions: {
        queries: {
          ...queryClientDefaults.queries,
          ...queryClientConfig.defaultOptions?.queries,
        },
        mutations: queryClientConfig.defaultOptions?.mutations,
      },
    });

    this.#policy = createServicePolicy(servicePolicyOptions);

    this.#queryCacheUnsubscribe = this.#queryClient
      .getQueryCache()
      .subscribe((event) => {
        if (['added', 'updated', 'removed'].includes(event.type)) {
          this.#publishCacheUpdate(
            event.query.queryHash,
            event.type as CacheUpdatedType,
          );
        }
      });

    this.#messenger.registerActionHandler(
      `${this.name}:invalidateQueries`,
      this.invalidateQueries.bind(this),
    );
  }

  /**
   * Fetch a query.
   *
   * @param options - The options defining the query. Keep in mind that `queryKey` and `queryFn` are required when using data services.
   * Additionally `retry` and `retryDelay` are not available, retries can be customized using the `servicePolicyOptions`.
   * @returns The query results.
   */
  protected async fetchQuery<
    TQueryFnData extends Json,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: WithRequired<
      OmitKeyof<
        FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
        'retry' | 'retryDelay'
      >,
      'queryKey' | 'queryFn'
    >,
  ): Promise<TData> {
    return this.#queryClient.fetchQuery({
      ...options,
      queryFn: (context) =>
        this.#policy.execute(() => options.queryFn(context)),
    });
  }

  /**
   * Fetch a paginated query.
   *
   * @param options - The options defining the query. Keep in mind that `queryKey` and `queryFn` are required when using data services.
   * Additionally `retry` and `retryDelay` are not available, retries can be customized using the `servicePolicyOptions`.
   * @param pageParam - An optional page parameter.
   * @returns The query result, exclusively the requested page is returned.
   */
  protected async fetchInfiniteQuery<
    TQueryFnData extends Json,
    TError = unknown,
    TData extends TQueryFnData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam extends Json = Json,
  >(
    options: WithRequired<
      OmitKeyof<
        FetchInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
        'retry' | 'retryDelay'
      >,
      'queryKey' | 'queryFn'
    >,
    pageParam?: TPageParam,
  ): Promise<TData> {
    const cache = this.#queryClient.getQueryCache();

    const query = cache.find<TQueryFnData, TError, InfiniteData<TData>>({
      queryKey: options.queryKey,
    });

    if (!query?.state.data || pageParam === undefined) {
      const result = await this.#queryClient.fetchInfiniteQuery({
        ...options,
        queryFn: (context) =>
          this.#policy.execute(() =>
            options.queryFn({
              ...context,
              pageParam: context.pageParam ?? pageParam,
            }),
          ),
      });

      return result.pages[0];
    }

    const { pages } = query.state.data;
    const previous = options.getPreviousPageParam?.(pages[0], pages);

    const direction = deepEqual(pageParam, previous) ? 'backward' : 'forward';

    const result = await query.fetch(undefined, {
      meta: {
        fetchMore: {
          direction,
          pageParam,
        },
      },
    });

    const pageIndex = result.pageParams.findIndex((param) =>
      deepEqual(param, pageParam),
    );

    return result.pages[pageIndex];
  }

  /**
   * Invalidate queries serviced by this data service.
   *
   * @param filters - Optional filter for selecting specific queries.
   * @param options - Additional optional options for query invalidations.
   * @returns Nothing.
   */
  async invalidateQueries<TPageData extends Json>(
    filters?: InvalidateQueryFilters<TPageData>,
    options?: InvalidateOptions,
  ): Promise<void> {
    return this.#queryClient.invalidateQueries(filters, options);
  }

  /**
   * Prepares the service for garbage collection. This should be extended
   * by any subclasses to clean up any additional connections or events.
   */
  protected destroy(): void {
    this.#queryCacheUnsubscribe();
    this.messenger.clearSubscriptions();
    this.messenger.clearActions();
  }

  /**
   * Publish `cacheUpdated` events when a given query changes.
   *
   * @param hash The hash of the query.
   * @param type The type of cache update.
   */
  #publishCacheUpdate(hash: string, type: CacheUpdatedType): void {
    const state =
      type === 'added' || type === 'updated'
        ? dehydrate(this.#queryClient, {
            shouldDehydrateQuery: (query) => query.queryHash === hash,
          })
        : null;

    this.#messenger.publish(
      `${this.name}:cacheUpdated` as const,
      {
        type,
        hash,
        state,
      } as CacheUpdatedPayload,
    );

    this.#messenger.publish(
      `${this.name}:cacheUpdated:${hash}` as const,
      {
        type,
        state,
      } as GranularCacheUpdatedPayload,
    );
  }
}
