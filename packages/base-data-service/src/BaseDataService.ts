import {
  Messenger,
  ActionConstraint,
  EventConstraint,
} from '@metamask/messenger';
import type { Json } from '@metamask/utils';
import {
  DehydratedState,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  QueryClient,
  QueryKey,
  WithRequired,
  dehydrate,
  hashQueryKey,
} from '@tanstack/query-core';
import deepEqual from 'fast-deep-equal';

export type CacheUpdatePayload = { hash: string; state: DehydratedState };

export type DataServiceInvalidateQueriesAction<ServiceName extends string> = {
  type: `${ServiceName}:invalidateQueries`;
  handler: (
    filters?: InvalidateQueryFilters<Json>,
    options?: InvalidateOptions,
  ) => Promise<void>;
};

export type DataServiceActions<ServiceName extends string> =
  DataServiceInvalidateQueriesAction<ServiceName>;

export type DataServiceCacheUpdateEvent<ServiceName extends string> = {
  type: `${ServiceName}:cacheUpdate`;
  payload: [CacheUpdatePayload];
};

export type DataServiceGranularCacheUpdateEvent<ServiceName extends string> = {
  type: `${ServiceName}:cacheUpdate:${string}`;
  payload: [CacheUpdatePayload];
};

export type DataServiceEvents<ServiceName extends string> =
  | DataServiceCacheUpdateEvent<ServiceName>
  | DataServiceGranularCacheUpdateEvent<ServiceName>;

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

  readonly #client = new QueryClient();

  constructor({
    name,
    messenger,
  }: {
    name: ServiceName;
    messenger: ServiceMessenger;
  }) {
    this.name = name;

    this.#messenger = messenger as unknown as Messenger<
      ServiceName,
      DataServiceActions<ServiceName>,
      DataServiceEvents<ServiceName>
    >;

    this.#registerMessageHandlers();
    this.#setupCacheListener();
  }

  #registerMessageHandlers(): void {
    this.#messenger.registerActionHandler(
      `${this.name}:invalidateQueries`,
      (filters?: InvalidateQueryFilters<Json>, options?: InvalidateOptions) =>
        this.invalidateQueries(filters, options),
    );
  }

  #setupCacheListener(): void {
    this.#client.getQueryCache().subscribe((event) => {
      if (['added', 'updated', 'removed'].includes(event.type)) {
        this.#broadcastCacheUpdate(event.query.queryKey);
      }
    });
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
    return this.#client.fetchQuery(options);
  }

  protected async fetchInfiniteQuery<
    TQueryFnData extends Json,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam extends Json = Json,
  >(
    options: WithRequired<
      FetchInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
      'queryKey' | 'queryFn'
    >,
    pageParam?: TPageParam,
  ): Promise<TData> {
    const query = this.#client
      .getQueryCache()
      .find<TQueryFnData, TError, TData>({ queryKey: options.queryKey });

    if (!query || !pageParam) {
      const result = await this.#client.fetchInfiniteQuery({
        ...options,
        queryFn: (context) =>
          options.queryFn({
            ...context,
            pageParam: context.pageParam ?? pageParam,
          }),
      });

      return result.pages[0];
    }

    const { pages } = query.state.data as InfiniteData<TQueryFnData>;
    const previous = options.getPreviousPageParam?.(pages[0], pages);

    const direction = deepEqual(pageParam, previous) ? 'backward' : 'forward';

    const result = (await query.fetch(undefined, {
      meta: {
        fetchMore: {
          direction,
          pageParam,
        },
      },
    })) as InfiniteData<TData>;

    const pageIndex = result.pageParams.indexOf(pageParam);

    return result.pages[pageIndex];
  }

  async invalidateQueries<TPageData extends Json>(
    filters?: InvalidateQueryFilters<TPageData>,
    options?: InvalidateOptions,
  ): Promise<void> {
    return this.#client.invalidateQueries(filters, options);
  }

  #getDehydratedState(queryKey: QueryKey): DehydratedState {
    const hash = hashQueryKey(queryKey);
    return dehydrate(this.#client, {
      shouldDehydrateQuery: (query) => query.queryHash === hash,
    });
  }

  #broadcastCacheUpdate(queryKey: QueryKey): void {
    const hash = hashQueryKey(queryKey);
    const state = this.#getDehydratedState(queryKey);

    const payload = {
      hash,
      state,
    };

    this.#messenger.publish(`${this.name}:cacheUpdate` as const, payload);
    this.#messenger.publish(
      `${this.name}:cacheUpdate:${hash}` as const,
      payload,
    );
  }
}
