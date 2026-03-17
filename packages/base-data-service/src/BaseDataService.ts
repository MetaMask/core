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
  QueryClient,
  QueryClientConfig,
  QueryKey,
  WithRequired,
  dehydrate,
  hashQueryKey,
} from '@tanstack/query-core';
import deepEqual from 'fast-deep-equal';

export type CacheUpdatedPayload = { hash: string; state: DehydratedState };

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
  payload: [CacheUpdatedPayload['state']];
};

export type DataServiceEvents<ServiceName extends string> =
  | DataServiceCacheUpdatedEvent<ServiceName>
  | DataServiceGranularCacheUpdatedEvent<ServiceName>;

// Defaults to apply to all data service queries if no default option specified
const queryClientDefaults: DefaultOptions = {
  queries: {
    staleTime: inMilliseconds(1, Duration.Minute),
  },
};

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

  readonly #queryClient: QueryClient;

  readonly #queryCacheUnsubscribe: () => void;

  constructor({
    name,
    messenger,
    queryClientConfig = {},
  }: {
    name: ServiceName;
    messenger: ServiceMessenger;
    queryClientConfig?: QueryClientConfig;
  }) {
    this.name = name;

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

    this.#queryCacheUnsubscribe = this.#queryClient
      .getQueryCache()
      .subscribe((event) => {
        if (['added', 'updated', 'removed'].includes(event.type)) {
          this.#broadcastCacheUpdate(event.query.queryKey);
        }
      });

    this.#registerMessageHandlers();
  }

  #registerMessageHandlers(): void {
    this.#messenger.registerActionHandler(
      `${this.name}:invalidateQueries`,
      this.invalidateQueries.bind(this),
    );
  }

  protected destroy(): void {
    this.messenger.clearSubscriptions();
    this.#queryCacheUnsubscribe();
  }

  protected async fetchQuery<
    TQueryFnData extends Json,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: WithRequired<
      FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
      'queryKey' | 'queryFn'
    >,
  ): Promise<TData> {
    return this.#queryClient.fetchQuery(options);
  }

  protected async fetchInfiniteQuery<
    TQueryFnData extends Json,
    TError = unknown,
    TData extends TQueryFnData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam extends Json = Json,
  >(
    options: WithRequired<
      FetchInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
      'queryKey' | 'queryFn'
    >,
    pageParam?: TPageParam,
  ): Promise<TData> {
    const query = this.#queryClient
      .getQueryCache()
      .find<
        TQueryFnData,
        TError,
        InfiniteData<TData>
      >({ queryKey: options.queryKey });

    if (!query?.state.data || !pageParam) {
      const result = await this.#queryClient.fetchInfiniteQuery({
        ...options,
        queryFn: (context) =>
          options.queryFn({
            ...context,
            pageParam: context.pageParam ?? pageParam,
          }),
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

  async invalidateQueries<TPageData extends Json>(
    filters?: InvalidateQueryFilters<TPageData>,
    options?: InvalidateOptions,
  ): Promise<void> {
    return this.#queryClient.invalidateQueries(filters, options);
  }

  #getDehydratedState(queryKey: QueryKey): DehydratedState {
    const hash = hashQueryKey(queryKey);
    return dehydrate(this.#queryClient, {
      shouldDehydrateQuery: (query) => query.queryHash === hash,
    });
  }

  #broadcastCacheUpdate(queryKey: QueryKey): void {
    const hash = hashQueryKey(queryKey);
    const state = this.#getDehydratedState(queryKey);

    this.#messenger.publish(`${this.name}:cacheUpdated` as const, {
      hash,
      state,
    });
    this.#messenger.publish(
      `${this.name}:cacheUpdated:${hash}` as const,
      state,
    );
  }
}
