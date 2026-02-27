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

export type SubscriptionPayload = { hash: string; state: DehydratedState };
export type SubscriptionCallback = (payload: SubscriptionPayload) => void;

export type DataServiceSubscribeAction<ServiceName extends string> = {
  type: `${ServiceName}:subscribe`;
  handler: (
    queryKey: QueryKey,
    callback: SubscriptionCallback,
  ) => DehydratedState;
};

export type DataServiceUnsubscribeAction<ServiceName extends string> = {
  type: `${ServiceName}:unsubscribe`;
  handler: (queryKey: QueryKey, callback: SubscriptionCallback) => void;
};

export type DataServiceInvalidateQueriesAction<ServiceName extends string> = {
  type: `${ServiceName}:invalidateQueries`;
  handler: (
    filters?: InvalidateQueryFilters<Json>,
    options?: InvalidateOptions,
  ) => Promise<void>;
};

export type DataServiceActions<ServiceName extends string> =
  | DataServiceSubscribeAction<ServiceName>
  | DataServiceUnsubscribeAction<ServiceName>
  | DataServiceInvalidateQueriesAction<ServiceName>;

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
    never
  >;

  readonly #client = new QueryClient();

  readonly #subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();

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
      never
    >;

    this.#registerMessageHandlers();
    this.#setupCacheListener();
  }

  #registerMessageHandlers(): void {
    this.#messenger.registerActionHandler(
      `${this.name}:subscribe`,
      // @ts-expect-error TODO.
      (queryKey: QueryKey, callback: SubscriptionCallback) =>
        this.#handleSubscribe(queryKey, callback),
    );

    this.#messenger.registerActionHandler(
      `${this.name}:unsubscribe`,
      // @ts-expect-error TODO.
      (queryKey: QueryKey, callback: SubscriptionCallback) =>
        this.#handleUnsubscribe(queryKey, callback),
    );

    this.#messenger.registerActionHandler(
      `${this.name}:invalidateQueries`,
      // @ts-expect-error TODO.
      (filters?: InvalidateQueryFilters<Json>, options?: InvalidateOptions) =>
        this.invalidateQueries(filters, options),
    );
  }

  #setupCacheListener(): void {
    this.#client.getQueryCache().subscribe((event) => {
      if (this.#subscriptions.has(event.query.queryHash)) {
        this.#broadcastQueryState(event.query.queryKey);
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
    TPageParam = unknown,
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

    const pages =
      (query.state.data as InfiniteData<TQueryFnData> | undefined)?.pages ?? [];
    const previous = options.getPreviousPageParam?.(pages[0], pages);

    const direction = pageParam === previous ? 'backward' : 'forward';

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

  protected async invalidateQueries<TPageData extends Json>(
    filters?: InvalidateQueryFilters<TPageData>,
    options?: InvalidateOptions,
  ): Promise<void> {
    return this.#client.invalidateQueries(filters, options);
  }

  // TODO: Determine if this has a better fit with `messenger.publish`.
  #handleSubscribe(
    queryKey: QueryKey,
    subscription: SubscriptionCallback,
  ): DehydratedState {
    const hash = hashQueryKey(queryKey);

    if (!this.#subscriptions.has(hash)) {
      this.#subscriptions.set(hash, new Set());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.#subscriptions.get(hash)!.add(subscription);

    return this.#getDehydratedStateForQuery(queryKey);
  }

  #handleUnsubscribe(
    queryKey: QueryKey,
    subscription: SubscriptionCallback,
  ): void {
    const hash = hashQueryKey(queryKey);
    const subscribers = this.#subscriptions.get(hash);

    subscribers?.delete(subscription);
    if (subscribers?.size === 0) {
      this.#subscriptions.delete(hash);
    }
  }

  #getDehydratedStateForQuery(queryKey: QueryKey): DehydratedState {
    const hash = hashQueryKey(queryKey);
    return dehydrate(this.#client, {
      shouldDehydrateQuery: (query) => query.queryHash === hash,
    });
  }

  #broadcastQueryState(queryKey: QueryKey): void {
    const hash = hashQueryKey(queryKey);
    const state = this.#getDehydratedStateForQuery(queryKey);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const subscribers = this.#subscriptions.get(hash)!;
    subscribers.forEach((subscriber) =>
      subscriber({
        hash,
        state,
      }),
    );
  }
}
