import {
  Messenger,
  ActionConstraint,
  EventConstraint,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type {
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceSetItemAction,
} from '@metamask/storage-service';
import { Struct } from '@metamask/superstruct';
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
  MutationOptions,
  OmitKeyof,
  QueryClient,
  QueryClientConfig,
  QueryFunction,
  WithRequired,
  dehydrate,
  hydrate,
  hashKey,
  MutationFunction,
} from '@tanstack/query-core';
import deepEqual from 'fast-deep-equal';
import { debounce, DebouncedFunc } from 'lodash';

import {
  createServicePolicy,
  CreateServicePolicyOptions,
  ServicePolicy,
} from './createServicePolicy.js';
import { createModuleLogger, projectLogger } from './loggers.js';
import { processMutationResponse, processQueryResponse } from './utils.js';

const log = createModuleLogger(projectLogger, 'BaseDataService');

/**
 * Data service mutations and queries use the following format:
 * `['${ServiceName}:${ActionName}', ...params]`
 */
type Key = [string, ...Json[]] | readonly [string, ...Json[]];

/*
 * Data service queries use the following format:
 * `['${ServiceName}:${ActionName}', ...params]`
 */
export type QueryKey = Key;

/*
 * Data service mutations use the following format:
 * `['${ServiceName}:${ActionName}', ...params]`
 */
export type MutationKey = Key;

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

/*
 * Defaults to apply to all data service queries if no default option specified.
 */
const QUERY_CLIENT_DEFAULTS: DefaultOptions = {
  queries: {
    retry: false,
    staleTime: inMilliseconds(1, Duration.Minute),
  },
  mutations: {
    retry: false,
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

  readonly #mutationCacheUnsubscribe: () => void;

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
    messenger: DataServiceActions<ServiceName>['type'] extends
      | MessengerActions<ServiceMessenger>['type']
      | DataServiceAllowedActions['type']
      ? DataServiceEvents<ServiceName>['type'] extends MessengerEvents<ServiceMessenger>['type']
        ? ServiceMessenger
        : never
      : never;
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
        mutations: {
          ...QUERY_CLIENT_DEFAULTS.mutations,
          ...queryClientConfig.defaultOptions?.mutations,
        },
      },
    });

    this.#persistenceConfig = persistenceConfig;

    this.#policy = createServicePolicy(policyOptions);

    this.#debouncedPersist =
      this.#persistenceConfig &&
      debounce(
        () => {
          this.#persistCache().catch((error) =>
            /* istanbul ignore next */
            this.#messenger.captureException?.(error),
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
        log('Query cache event emitted', event);
        if (['added', 'updated', 'removed'].includes(event.type)) {
          this.#publishCacheUpdate(
            'query',
            event.type as CacheUpdatedType,
            event.query.queryHash,
          );

          this.#debouncedPersist?.();
        }
      });

    log('Subscribing to mutation cache');
    this.#mutationCacheUnsubscribe = this.#queryClient
      .getMutationCache()
      .subscribe((event) => {
        log('Mutation cache event emitted', event);
        if (
          event.mutation &&
          ['added', 'updated', 'removed'].includes(event.type) &&
          event.mutation.options.mutationKey !== undefined
        ) {
          const mutationHash = hashKey(event.mutation.options.mutationKey);
          this.#publishCacheUpdate(
            'mutation',
            event.type as CacheUpdatedType,
            mutationHash,
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
   * @param options - The options defining the query. Keep in mind that `queryKey` and `queryFn` are required when using data services.
   * Additionally `retry` and `retryDelay` are not available, retries can be customized using the `servicePolicyOptions`.
   * @param options.queryFn - The query function.
   * @param options.responseStruct - An optional struct for validating the response of the query function.
   * @returns The query results.
   */
  protected async fetchQuery<
    TQueryFnData extends Json,
    TError = DefaultError,
    TDataStruct extends Struct<TQueryFnData> | undefined = undefined,
    TData = TDataStruct extends Struct<infer StructType>
      ? StructType
      : TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >({
    queryFn,
    responseStruct,
    ...options
  }: WithRequired<
    OmitKeyof<
      FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
      'retry' | 'retryDelay' | 'queryFn'
    >,
    'queryKey'
  > & {
    queryFn: QueryFunction<TQueryFnData, TQueryKey>;
    responseStruct?: TDataStruct;
  }): Promise<TData> {
    return this.#queryClient.fetchQuery({
      ...options,
      queryFn: async (context) => {
        const response = await this.#policy.execute(() => queryFn(context));
        return processQueryResponse(options.queryKey, response, responseStruct);
      },
    });
  }

  /**
   * Fetch a paginated query.
   *
   * @param options - The options defining the query. Keep in mind that `queryKey` and `queryFn` are required when using data services.
   * Additionally `retry` and `retryDelay` are not available, retries can be customized using the `servicePolicyOptions`.
   * @param options.responseStruct - An optional struct for validating the response of the query function.
   * @param pageParam - An optional page parameter.
   * @returns The query result, exclusively the requested page is returned.
   */
  protected async fetchInfiniteQuery<
    TQueryFnData extends Json,
    TError = DefaultError,
    TDataStruct extends Struct<TQueryFnData> | undefined = undefined,
    TData extends TQueryFnData = TDataStruct extends Struct<infer StructType>
      ? StructType
      : TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam extends Json = Json,
  >(
    {
      responseStruct,
      ...options
    }: WithRequired<
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
      InfiniteQueryPageParamsOptions<TQueryFnData, TPageParam> & {
        queryFn: QueryFunction<TQueryFnData, TQueryKey, TPageParam>;
        responseStruct?: TDataStruct;
      },
    pageParam?: TPageParam,
  ): Promise<TData> {
    const cache = this.#queryClient.getQueryCache();

    const query = cache.find<
      TQueryFnData,
      TError,
      InfiniteData<TData, TPageParam>
    >({
      queryKey: options.queryKey,
    });

    if (!query?.state.data || !pageParam) {
      const result = await this.#queryClient.fetchInfiniteQuery({
        ...options,
        initialPageParam: pageParam ?? options.initialPageParam,
        queryFn: async (context) => {
          const response = await this.#policy.execute(async () =>
            options.queryFn({
              ...context,
              pageParam: context.meta?.pageParam ?? context.pageParam,
            }),
          );
          return processQueryResponse(
            options.queryKey,
            response,
            responseStruct,
          );
        },
      });

      return result.pages[0];
    }

    const { pages, pageParams } = query.state.data;
    const next = options.getNextPageParam(
      pages[pages.length - 1],
      pages,
      pageParams[pageParams.length - 1],
      pageParams,
    );

    const direction = deepEqual(pageParam, next) ? 'forward' : 'backward';

    const result = await query.fetch(
      { ...query.options, meta: { pageParam } },
      { meta: { fetchMore: { direction } } },
    );

    const pageIndex = result.pageParams.findIndex((param) =>
      deepEqual(param, pageParam),
    );

    return result.pages[pageIndex];
  }

  /**
   * Execute a mutation (e.g. a request that is expected to change server-side data).
   * Unlike `fetchQuery`, the request will not be cached or retried.
   *
   * @param options - The options defining the mutation. Keep in mind that `mutationKey` and `mutationFn` are required when using data services.
   * Additionally, `retry` and `retryDelay` are not available.
   * @param options.mutationFn - The mutation function.
   * @param options.responseStruct - An optional struct for validating the response of the mutation function.
   * @returns The mutation results.
   */
  protected async executeMutation<
    TMutationFnData extends Json,
    // We have to use `Struct<any>` here, as using `Struct<TMutationFnData>`
    // (or even `Struct<unknown>`) would reject a more concrete, "real world" struct.
    // The reason is that `Struct` is an object type with methods that take its
    // content type as arguments (i.e. `Struct` is contravariant in its content type).
    // The only way to get around that it to use `any`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TDataStruct extends Struct<any> | undefined = undefined,
    TData = TDataStruct extends Struct<infer StructType>
      ? StructType
      : TMutationFnData,
    TError = DefaultError,
    TOnMutateResult = unknown,
    TMutationKey extends MutationKey = MutationKey,
  >({
    mutationFn,
    responseStruct,
    ...options
  }: OmitKeyof<
    MutationOptions<TData, TError, Record<never, never>, TOnMutateResult>,
    'retry' | 'retryDelay' | 'mutationKey' | 'mutationFn'
  > & {
    mutationKey: TMutationKey;
    mutationFn: MutationFunction<TMutationFnData, Record<never, never>>;
    responseStruct?: TDataStruct;
  }): Promise<TData> {
    const mutationCache = this.#queryClient.getMutationCache();
    const mutation = mutationCache.build<
      TData,
      TError,
      Record<never, never>,
      TOnMutateResult
    >(this.#queryClient, {
      ...options,
      mutationFn: async (...args) => {
        // Note that we purposely only use the circuit breaker policy
        // and not the circuit breaker and retry policies, as we don't want
        // to retry mutations.
        const response = await this.#policy.circuitBreakerPolicy.execute(() =>
          mutationFn(...args),
        );
        const data = responseStruct
          ? processMutationResponse(
              options.mutationKey,
              response,
              responseStruct,
            )
          : response;
        // Type assertion: `TData` is a conditional default that resolves to the
        // struct's decoded type when a struct is provided and `TMutationFnData`
        // otherwise, which mirrors the two branches above. TypeScript cannot
        // relate a value to an unresolved conditional type parameter, so we
        // assert the correspondence that this method's own generics guarantee.
        return data as unknown as TData;
      },
    });
    // We purposely pass an empty set of variables because this method is
    // intended to be used internally by the data service, not end users, and
    // the data service has full control of `mutationFn` anyway.
    return await mutation.execute({});
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
    this.#loadCache().catch((error) =>
      /* istanbul ignore next */
      this.#messenger.captureException?.(error),
    );
  }

  /**
   * Prepares the service for garbage collection. This should be extended
   * by any subclasses to clean up any additional connections or events.
   */
  destroy(): void {
    this.#debouncedPersist?.cancel();
    this.#queryCacheUnsubscribe();
    this.#mutationCacheUnsubscribe();
    // `QueryClient.clear()` clears both caches, but `MutationCache.clear()` only
    // drops its references to mutations without clearing their pending
    // garbage-collection timers. We destroy each mutation first so those timers
    // are cleared and do not keep the process alive.
    for (const mutation of this.#queryClient.getMutationCache().getAll()) {
      mutation.destroy();
    }
    this.#queryClient.clear();
    this.messenger.clearSubscriptions();
    this.messenger.clearActions();
  }

  /**
   * Publish `cacheUpdated` events when the query or mutation cache is updated.
   *
   * @param objectType - The type of object updated ("query" or "mutation").
   * @param eventType - What happened to the query or mutation ("added" or "updated").
   * @param hash - The hash of the query or mutation.
   */
  #publishCacheUpdate(
    objectType: 'query' | 'mutation',
    eventType: CacheUpdatedType,
    hash: string,
  ): void {
    const state =
      eventType === 'added' || eventType === 'updated'
        ? dehydrate(this.#queryClient, {
            shouldDehydrateQuery: (query) =>
              objectType === 'query' && query.queryHash === hash,
            shouldDehydrateMutation: (mutation) =>
              objectType === 'mutation' &&
              mutation.options.mutationKey !== undefined &&
              hashKey(mutation.options.mutationKey) === hash,
          })
        : null;

    this.#messenger.publish(
      `${this.name}:cacheUpdated` as const,
      {
        type: eventType,
        hash,
        state,
      } as DataServiceCacheUpdatedPayload,
    );

    this.#messenger.publish(
      `${this.name}:cacheUpdated:${hash}` as const,
      {
        type: eventType,
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
