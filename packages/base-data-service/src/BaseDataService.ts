import {
  Messenger,
  ActionConstraint,
  EventConstraint,
} from '@metamask/messenger';
import type {
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceSetItemAction,
} from '@metamask/storage-service';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import {
  DefaultError,
  DefaultOptions,
  DehydratedState,
  FetchQueryOptions,
  InfiniteData,
  InfiniteQueryPageParamsOptions,
  InvalidateOptions,
  InvalidateQueryFilters,
  OmitKeyof,
  QueryClient,
  QueryClientConfig,
  QueryFunction,
  WithRequired,
  dehydrate,
  hydrate,
} from '@tanstack/query-core';
import deepEqual from 'fast-deep-equal';
import { debounce, DebouncedFunc } from 'lodash';

import {
  createServicePolicy,
  CreateServicePolicyOptions,
  ServicePolicy,
} from './createServicePolicy.js';

// Data service queries use the following format: ['ServiceActionName', ...params]
export type QueryKey = [string, ...Json[]];

/**
 * The supertype of all messengers, scoped to a namespace.
 *
 * @template Namespace - The namespace for the messenger's own actions and
 * events.
 */
export type BaseMessenger<Namespace extends string> = Messenger<
  Namespace,
  ActionConstraint,
  EventConstraint,
  // Use `any` to allow any parent to be set. `any` is harmless in a type constraint anyway,
  // it's the one totally safe place to use it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

export type DataServiceGranularCacheUpdatedPayload =
  | { type: 'added' | 'updated'; state: DehydratedState }
  | {
      type: 'removed';
      state: null;
    };

export type DataServiceCacheUpdatedPayload =
  DataServiceGranularCacheUpdatedPayload & {
    hash: string;
  };

type CacheUpdatedType = DataServiceCacheUpdatedPayload['type'];

export type DataServiceInvalidateQueriesAction<ServiceName extends string> = {
  type: `${ServiceName}:invalidateQueries`;
  handler: BaseDataService<
    ServiceName,
    BaseMessenger<ServiceName>
  >['invalidateQueries'];
};

export type DataServiceActions<ServiceName extends string> =
  DataServiceInvalidateQueriesAction<ServiceName>;

type DataServiceAllowedActions =
  | StorageServiceGetItemAction
  | StorageServiceSetItemAction
  | StorageServiceRemoveItemAction;

export type DataServiceCacheUpdatedEvent<ServiceName extends string> = {
  type: `${ServiceName}:cacheUpdated`;
  payload: [DataServiceCacheUpdatedPayload];
};

export type DataServiceGranularCacheUpdatedEvent<ServiceName extends string> = {
  type: `${ServiceName}:cacheUpdated:${string}`;
  payload: [DataServiceGranularCacheUpdatedPayload];
};

export type DataServiceEvents<ServiceName extends string> =
  | DataServiceCacheUpdatedEvent<ServiceName>
  | DataServiceGranularCacheUpdatedEvent<ServiceName>;

// Defaults to apply to all data service queries if no default option specified
const QUERY_CLIENT_DEFAULTS: DefaultOptions = {
  queries: {
    retry: false,
    staleTime: inMilliseconds(1, Duration.Minute),
  },
};

export const STORAGE_SERVICE_KEY = 'cache';

/**
 * Options for persistence configuration.
 */
export type PersistenceConfiguration = {
  /**
   * The maximum age before the cache is treated as expired in milliseconds.
   * This is relevant for rehydrating the state during initialization,
   * if the cached state is too old it will be discarded.
   */
  maxAge: number;
  /**
   * The number of milliseconds to wait before triggering persistence following a cache update.
   */
  writeDelay?: number;
  /**
   * The maximum number of milliseconds to wait between persistence writes.
   */
  maxWriteDelay?: number;
};

type PersistedCache = {
  state: DehydratedState;
  timestamp: number;
};

export class BaseDataService<
  ServiceName extends string,
  ServiceMessenger extends BaseMessenger<ServiceName>,
> {
  public readonly name: ServiceName;

  readonly #messenger: Messenger<
    ServiceName,
    DataServiceActions<ServiceName>,
    DataServiceEvents<ServiceName>
  >;

  readonly #externalMessenger: Messenger<
    ServiceName,
    DataServiceAllowedActions
  >;

  protected messenger: ServiceMessenger;

  readonly #policy: ServicePolicy;

  readonly #queryClient: QueryClient;

  readonly #queryCacheUnsubscribe: () => void;

  readonly #debouncedPersist?: DebouncedFunc<() => void>;

  readonly #persistenceConfig?: PersistenceConfiguration;

  constructor({
    name,
    messenger,
    queryClientConfig = {},
    policyOptions,
    persistenceConfig,
  }: {
    name: ServiceName;
    messenger: ServiceMessenger;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
    persistenceConfig?: PersistenceConfiguration;
  }) {
    this.name = name;

    // We store two narrowly-typed messengers alongside the generic public one:
    // - #messenger handles the service's own action registration and event publishing
    // - #externalMessenger handles calls to external actions
    // Splitting them avoids TypeScript issues with mixing template-literals with regular strings
    this.#messenger = messenger as unknown as Messenger<
      ServiceName,
      DataServiceActions<ServiceName>,
      DataServiceEvents<ServiceName>
    >;
    this.#externalMessenger = messenger as unknown as Messenger<
      ServiceName,
      DataServiceAllowedActions
    >;
    this.messenger = messenger;

    this.#queryClient = new QueryClient({
      ...queryClientConfig,
      defaultOptions: {
        queries: {
          ...QUERY_CLIENT_DEFAULTS.queries,
          ...queryClientConfig.defaultOptions?.queries,
        },
        mutations: queryClientConfig.defaultOptions?.mutations,
      },
    });

    this.#persistenceConfig = persistenceConfig;

    this.#policy = createServicePolicy(policyOptions);

    this.#debouncedPersist =
      this.#persistenceConfig &&
      debounce(
        () => {
          this.#persistCache().catch(
            /* istanbul ignore next */
            (error) => this.#messenger.captureException?.(error),
          );
        },
        this.#persistenceConfig.writeDelay ??
          inMilliseconds(10, Duration.Second),
        {
          maxWait:
            this.#persistenceConfig.maxWriteDelay ??
            inMilliseconds(1, Duration.Minute),
        },
      );

    this.#queryCacheUnsubscribe = this.#queryClient
      .getQueryCache()
      .subscribe((event) => {
        if (['added', 'updated', 'removed'].includes(event.type)) {
          this.#publishCacheUpdate(
            event.query.queryHash,
            event.type as CacheUpdatedType,
          );

          this.#debouncedPersist?.();
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
   * @param options - The options defining the query. Note that although this
   * method wraps `fetchQuery` from `@tanstack/query-core`, there are a few
   * restrictions:
   * - `queryKey` and `queryFn` are required
   * - `queryFn` must be a function, not a skip token
   * - `retry` and `retryDelay` are not available (retries can be customized
   *   using the constructor's `servicePolicyOptions`).
   * @returns The query results.
   */
  protected async fetchQuery<
    TQueryFnData extends Json,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: WithRequired<
      OmitKeyof<
        FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
        'retry' | 'retryDelay' | 'queryFn'
      >,
      'queryKey'
    > & {
      // @tanstack/query-core's fetchQuery function accepts a "skip" token, but
      // data services always provide a concrete query function.
      queryFn: QueryFunction<TQueryFnData, TQueryKey>;
    },
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
   * @param options - The options defining the query. Note that although this
   * method wraps `fetchInfiniteQuery` from `@tanstack/query-core`, there are a
   * few differences:
   * - `queryKey` and `queryFn` are required
   * - `queryFn` must be a function, not a skip token
   * - `retry` and `retryDelay` are not available (retries can be customized
   *   using the constructor's `servicePolicyOptions`).
   * @param pageParam - An optional page parameter.
   * @returns A page's worth of data (i.e. what `queryFn` returns). Note that
   * this is different from `@tanstack/query-core`'s `fetchInfiniteQuery`
   * method, which returns all pages.
   */
  protected async fetchInfiniteQuery<
    TQueryFnData extends Json,
    TError = DefaultError,
    TData extends TQueryFnData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam extends Json = Json,
  >(
    options: WithRequired<
      OmitKeyof<
        FetchQueryOptions<
          TQueryFnData,
          TError,
          InfiniteData<TData, TPageParam>,
          TQueryKey,
          TPageParam
        >,
        'retry' | 'retryDelay' | 'queryFn' | 'initialPageParam'
      >,
      'queryKey'
    > &
      // `initialPageParam` and `getNextPageParam` are required, matching
      // query-core's own infinite-query options: they make `TPageParam`
      // inferable and describe how pages relate. `getPreviousPageParam` stays
      // optional (only bidirectional consumers need it).
      InfiniteQueryPageParamsOptions<TQueryFnData, TPageParam> & {
        // @tanstack/query-core's fetchInfiniteQuery function accepts a "skip"
        // token, but data services always provide a concrete query function.
        queryFn: QueryFunction<TQueryFnData, TQueryKey, TPageParam>;
      },
    pageParam?: TPageParam,
  ): Promise<TData> {
    // The page to fetch. A missing per-call `pageParam` means "the first page",
    // which uses the consumer's `initialPageParam`. A `null` initial param is
    // preserved: `??` only falls back when the per-call param itself is missing.
    const requestedPageParam = pageParam ?? options.initialPageParam;

    // Serve an already-cached page without refetching while the query is fresh,
    // so repeated requests for the same page (for example from multiple UI
    // observers) reuse it. `staleTime` is resolved to a number: the per-call
    // option or the client default.
    const query = this.#queryClient
      .getQueryCache()
      .find<TQueryFnData, TError, InfiniteData<TData, TPageParam>>({
        queryKey: options.queryKey,
      });
    const defaultStaleTime = this.#queryClient.getDefaultOptions().queries
      ?.staleTime as number | undefined;
    const staleTime = (options.staleTime ?? defaultStaleTime) as
      | number
      | undefined;
    if (query?.state.data && !query.isStaleByTime(staleTime)) {
      const index = query.state.data.pageParams.findIndex((param) =>
        deepEqual(param, requestedPageParam),
      );
      if (index !== -1) {
        return query.state.data.pages[index];
      }
    }

    // Fetch the requested page through the policy. Unlike query-core's
    // `fetchInfiniteQuery`, which drives pagination through a `fetchMore` meta,
    // we drive it directly by the requested page param. The context is built by
    // hand; the query function only reads `pageParam`.
    const page = (await this.#policy.execute(() =>
      options.queryFn({
        client: this.#queryClient,
        queryKey: options.queryKey,
        signal: new AbortController().signal,
        pageParam: requestedPageParam,
        direction: 'forward',
        meta: options.meta,
      }),
    )) as TData;

    // Merge the fetched page into the infinite cache so the accumulated pages
    // stay available for hydration by UI clients.
    this.#queryClient.setQueryData<InfiniteData<TData, TPageParam>>(
      options.queryKey,
      (existing: InfiniteData<TData, TPageParam> | undefined) => {
        if (!existing) {
          return { pages: [page], pageParams: [requestedPageParam] };
        }

        // Prepend when the requested page is the previous page of the current
        // first page (and not the next page of the last); otherwise append.
        const next = options.getNextPageParam(
          existing.pages[existing.pages.length - 1],
          existing.pages,
          existing.pageParams[existing.pageParams.length - 1],
          existing.pageParams,
        );
        const previous = options.getPreviousPageParam?.(
          existing.pages[0],
          existing.pages,
          existing.pageParams[0],
          existing.pageParams,
        );
        return !deepEqual(requestedPageParam, next) &&
          deepEqual(requestedPageParam, previous)
          ? {
              pages: [page, ...existing.pages],
              pageParams: [requestedPageParam, ...existing.pageParams],
            }
          : {
              pages: [...existing.pages, page],
              pageParams: [...existing.pageParams, requestedPageParam],
            };
      },
    );

    return page;
  }

  /**
   * Invalidate queries serviced by this data service.
   *
   * @param filters - Optional filter for selecting specific queries.
   * @param options - Additional optional options for query invalidations.
   * @returns Nothing.
   */
  async invalidateQueries(
    filters?: InvalidateQueryFilters<QueryKey>,
    options?: InvalidateOptions,
  ): Promise<void> {
    return this.#queryClient.invalidateQueries(filters, options);
  }

  /**
   * Initialize the service, rehydrating the cache with persisted data if possible.
   */
  init(): void {
    this.#loadCache().catch(
      /* istanbul ignore next */
      (error) => this.#messenger.captureException?.(error),
    );
  }

  /**
   * Prepares the service for garbage collection. This should be extended
   * by any subclasses to clean up any additional connections or events.
   */
  destroy(): void {
    this.#debouncedPersist?.cancel();
    this.#queryCacheUnsubscribe();
    this.#queryClient.clear();
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
      } as DataServiceCacheUpdatedPayload,
    );

    this.#messenger.publish(
      `${this.name}:cacheUpdated:${hash}` as const,
      {
        type,
        state,
      } as DataServiceGranularCacheUpdatedPayload,
    );
  }

  /**
   * Persist the query client cache using the StorageService, if the cache is not empty.
   *
   * @returns Nothing.
   */
  async #persistCache(): Promise<void> {
    const state = dehydrate(this.#queryClient, {
      // This is the default, but we specify it to be explicit.
      shouldDehydrateQuery: (query) => query.state.status === 'success',
    });

    if (state.queries.length === 0 && state.mutations.length === 0) {
      await this.#externalMessenger.call(
        'StorageService:removeItem',
        this.name,
        STORAGE_SERVICE_KEY,
      );
      return;
    }

    const cache: PersistedCache = {
      timestamp: Date.now(),
      state,
    };

    await this.#externalMessenger.call(
      'StorageService:setItem',
      this.name,
      STORAGE_SERVICE_KEY,
      cache as unknown as Json,
    );
  }

  /**
   * Load the query client cache from the StorageService, if persistence is configured
   * and the persisted cache is not expired.
   *
   * @returns Nothing.
   */
  async #loadCache(): Promise<void> {
    if (!this.#persistenceConfig) {
      return;
    }

    const { result: untypedCache } = await this.#externalMessenger.call(
      'StorageService:getItem',
      this.name,
      STORAGE_SERVICE_KEY,
    );

    if (!untypedCache) {
      return;
    }

    const cache = untypedCache as unknown as PersistedCache;

    if (Date.now() - cache.timestamp >= this.#persistenceConfig.maxAge) {
      await this.#externalMessenger.call(
        'StorageService:removeItem',
        this.name,
        STORAGE_SERVICE_KEY,
      );
      return;
    }

    hydrate(this.#queryClient, cache.state);
  }
}
