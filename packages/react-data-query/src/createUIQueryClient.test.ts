import {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
} from '@metamask/base-data-service';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  MessengerActions,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  Duration,
  createDeferredPromise,
  inMilliseconds,
} from '@metamask/utils';
import {
  InfiniteData,
  InfiniteQueryObserver,
  // MutationObserver is part of the Web API and is therefore a global
  MutationObserver as TanStackQueryMutationObserver,
  QueryClient,
  QueryClientConfig,
  QueryObserver,
} from '@tanstack/query-core';
import { ReplyBody } from 'nock';

import {
  AddFollowerResponse,
  ExampleDataService,
  ExampleMessenger,
  GetActivityResponse,
  PageParam,
  serviceName,
} from '../../base-data-service/tests/ExampleDataService.js';
import {
  mockAssets,
  mockAddFollowerRequest,
  mockTransactionsPage1,
  mockTransactionsPage2,
  DEFAULT_ADD_FOLLOWER_REPLY,
} from '../../base-data-service/tests/mocks.js';
import {
  StorageServiceGetItemAction,
  StorageServiceSetItemAction,
  StorageServiceRemoveItemAction,
} from '../../storage-service/src/StorageService-method-action-types.js';
import { createUIQueryClient } from './createUIQueryClient.js';

const DATA_SERVICES = ['ExampleDataService'] as const;

type RootMessenger = Messenger<
  MockAnyNamespace,
  | StorageServiceGetItemAction
  | StorageServiceSetItemAction
  | StorageServiceRemoveItemAction,
  never
>;

/**
 * Handles granular cache update events emitted by data services.
 */
type DataServiceGranularCacheUpdatedHandler = (
  payload: DataServiceGranularCacheUpdatedPayload,
) => void;

/**
 * Create a root messenger.
 *
 * @param args - The arguments.
 * @param args.actionHandlers - The action handlers to mock.
 * @returns The root messenger.
 */
function createRootMessenger({
  actionHandlers = {
    'StorageService:getItem': jest.fn(),
    'StorageService:setItem': jest.fn(),
    'StorageService:removeItem': jest.fn(),
  },
}: {
  actionHandlers?: {
    [Action in MessengerActions<RootMessenger> as Action['type']]?: Action['handler'];
  };
} = {}): RootMessenger {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: console.error,
  });

  for (const [actionType, actionHandler] of Object.entries(actionHandlers)) {
    // @ts-expect-error TypeScript puts all types and all handlers into
    // two unions, making it impossible to tell which belongs to which
    messenger.registerActionHandler(actionType, actionHandler);
  }

  return messenger;
}

/**
 * Create an ExampleDataService messenger.
 *
 * @param rootMessenger - The root messenger to derive the ExampleDataService
 * messenger from.
 * @returns The ExampleDataService messenger.
 */
function createServiceMessenger(
  rootMessenger = createRootMessenger(),
): ExampleMessenger {
  const messenger: ExampleMessenger = new Messenger({
    namespace: serviceName,
  });
  rootMessenger.delegate({
    actions: [
      'StorageService:getItem',
      'StorageService:setItem',
      'StorageService:removeItem',
    ],
    messenger,
  });
  return messenger;
}

function createClients(config?: QueryClientConfig): {
  service: ExampleDataService;
  clientA: QueryClient;
  clientB: QueryClient;
  messenger: ExampleMessenger;
} {
  const serviceMessenger = createServiceMessenger();
  const service = new ExampleDataService(serviceMessenger);
  const messengerAdapter = {
    call: (
      actionType: `ExampleDataService:${string}`,
      ...params: unknown[]
    ): unknown => {
      if (actionType.startsWith('ExampleDataService:')) {
        // @ts-expect-error TypeScript cannot unify template literals with
        // strings. We can safely assume that the ExampleDataService messenger
        // accepts an action prefixed with "ExampleDataService:", though.
        return serviceMessenger.call(actionType, ...params);
      }
      throw new Error(`Unknown action: ${actionType}`);
    },
    subscribe: (
      eventType: DataServiceGranularCacheUpdatedEvent<'ExampleDataService'>['type'],
      handler: DataServiceGranularCacheUpdatedHandler,
    ): void => {
      serviceMessenger.subscribe(eventType, handler);
    },
    unsubscribe: (
      eventType: DataServiceGranularCacheUpdatedEvent<'ExampleDataService'>['type'],
      handler: DataServiceGranularCacheUpdatedHandler,
    ): void => {
      serviceMessenger.unsubscribe(eventType, handler);
    },
  };

  const clientA = createUIQueryClient(DATA_SERVICES, messengerAdapter, config);
  const clientB = createUIQueryClient(DATA_SERVICES, messengerAdapter, config);

  return { service, clientA, clientB, messenger: serviceMessenger };
}

const getAssetsQueryKey = [
  'ExampleDataService:getAssets',
  [
    'eip155:1/slip44:60',
    'bip122:000000000019d6689c085ae165831e93/slip44:0',
    'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
  ],
];

const getActivityQueryKey = [
  'ExampleDataService:getActivity',
  '0x4bbeEB066eD09B7AEd07bF39EEe0460DFa261520',
];

const addFollowerMutationKey = ['ExampleDataService:addFollower', '1'];

describe('createUIQueryClient', () => {
  beforeEach(() => {
    // This is necessary to avoid a "Jest did not exit within 1 second" error
    // even for "simple" tests like fetching queries or executing mutations
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    mockAssets();
    mockTransactionsPage1();
    mockTransactionsPage2();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('proxies queries to the underlying service', async () => {
    const { clientA: client, service } = createClients();

    const result = await client.fetchQuery({
      queryKey: getAssetsQueryKey,
    });

    expect(result).toStrictEqual([
      {
        assetId: 'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
        name: 'Dai Stablecoin',
        symbol: 'DAI',
      },
      {
        assetId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        decimals: 8,
        name: 'Bitcoin',
        symbol: 'BTC',
      },
      {
        assetId: 'eip155:1/slip44:60',
        decimals: 18,
        name: 'Ethereum',
        symbol: 'ETH',
      },
    ]);

    service.destroy();
  });

  it('proxies mutations to the underlying service', async () => {
    const { clientA: client, service } = createClients();

    mockAddFollowerRequest();

    const mutationCache = client.getMutationCache();
    const mutation = mutationCache.build(client, {
      mutationKey: addFollowerMutationKey,
    });
    const result = await mutation.execute({});

    expect(result).toStrictEqual({
      followed: [
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          name: 'TraderAlice',
          imageUrl: 'https://example.com/avatar.png',
        },
      ],
    });

    service.destroy();
  });

  it('fetches queries using observers', async () => {
    const { clientA, clientB, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultA = await promiseA;

    expect(resultA).toHaveLength(3);

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultB = await promiseB;
    expect(resultA).toStrictEqual(resultB);

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('executes mutations using observers', async () => {
    const { clientA, clientB, service } = createClients();

    mockAddFollowerRequest();
    mockAddFollowerRequest();

    const observerA = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientA,
      {
        mutationKey: addFollowerMutationKey,
      },
    );
    const observerB = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientB,
      {
        mutationKey: addFollowerMutationKey,
      },
    );

    const resultA = await observerA.mutate();
    const resultB = await observerB.mutate();

    expect(resultA.followed).toHaveLength(1);
    expect(resultA).toStrictEqual(resultB);

    observerA.reset();
    observerB.reset();
    service.destroy();
  });

  it('fetches queries using observers in the same client', async () => {
    const { clientA, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultA = await promiseA;

    expect(resultA).toHaveLength(3);

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultB = await promiseB;
    expect(resultA).toStrictEqual(resultB);

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('executes mutations using observers in the same client', async () => {
    const { clientA, service } = createClients();

    mockAddFollowerRequest();
    mockAddFollowerRequest();

    const observerA = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientA,
      {
        mutationKey: addFollowerMutationKey,
      },
    );
    const observerB = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientA,
      {
        mutationKey: addFollowerMutationKey,
      },
    );

    const resultA = await observerA.mutate();
    const resultB = await observerB.mutate();

    expect(resultA.followed).toHaveLength(1);
    expect(resultA).toStrictEqual(resultB);

    observerA.reset();
    observerB.reset();
    service.destroy();
  });

  it('synchronizes caches after invalidation', async () => {
    const { clientA, clientB, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    jest.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    // Replace the mock response and invalidate
    mockAssets({
      status: 200,
      body: [],
    });

    await clientA.invalidateQueries();

    const queryDataA = clientA.getQueryData(getAssetsQueryKey);
    const queryDataB = clientB.getQueryData(getAssetsQueryKey);

    expect(queryDataA).toStrictEqual([]);
    expect(queryDataB).toStrictEqual([]);

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('supports customizing query invalidation', async () => {
    const { clientA, messenger, service } = createClients();

    const spy = jest.spyOn(messenger, 'call');

    const observer = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const promise = new Promise((resolve) => {
      observer.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    await promise;

    // Replace the mock response and invalidate
    mockAssets({
      status: 200,
      body: [],
    });

    await clientA.invalidateQueries(
      { queryKey: getAssetsQueryKey, refetchType: 'all' },
      { throwOnError: true },
    );

    expect(spy).toHaveBeenCalledWith(
      'ExampleDataService:invalidateQueries',
      { queryKey: getAssetsQueryKey, refetchType: 'all' },
      { throwOnError: true },
    );

    observer.destroy();
    service.destroy();
  });

  it('does not remove entries from the query cache if query observers still are subscribed', async () => {
    const { clientA, clientB, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    jest.advanceTimersByTime(0);

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    jest.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const queryData = clientA.getQueryData(getAssetsQueryKey);
    expect(queryData).toBeDefined();
    expect(queryData).toStrictEqual(clientB.getQueryData(getAssetsQueryKey));

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('does not remove entries from the mutation cache if mutation observers still are subscribed', async () => {
    const { clientA, clientB, service } = createClients();
    const { promise: promiseToResolveMutation, resolve: resolveMutation } =
      createDeferredPromise();
    const replyFn = async (): Promise<[number, ReplyBody]> => {
      await promiseToResolveMutation;
      return [
        DEFAULT_ADD_FOLLOWER_REPLY.status,
        DEFAULT_ADD_FOLLOWER_REPLY.body,
      ] as const;
    };
    mockAddFollowerRequest({ replyFn });
    mockAddFollowerRequest({ replyFn });

    const observerA = new TanStackQueryMutationObserver(clientA, {
      mutationKey: addFollowerMutationKey,
    });
    const observerB = new TanStackQueryMutationObserver(clientB, {
      mutationKey: addFollowerMutationKey,
    });

    const promiseA = observerA.mutate();
    const promiseB = observerB.mutate();

    jest.advanceTimersByTime(0);

    const mutationBeforeRemovalA = clientA
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    const mutationBeforeRemovalB = clientB
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    expect(mutationBeforeRemovalA).toBeDefined();
    expect(mutationBeforeRemovalB).toBeDefined();

    resolveMutation();

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    jest.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const mutationDataAfterRemovalA = clientA
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    const mutationDataAfterRemovalB = clientB
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    expect(mutationDataAfterRemovalA).toBeDefined();
    expect(mutationDataAfterRemovalB).toBeDefined();

    observerA.reset();
    observerB.reset();
    service.destroy();
  });

  it('cleans up removed query cache entries once all query observers are removed', async () => {
    const defaultOptions = {
      queries: { gcTime: inMilliseconds(5, Duration.Minute) },
    };

    const { clientA, clientB, service } = createClients({ defaultOptions });

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    jest.advanceTimersByTime(0);

    await Promise.all([promiseA, promiseB]);

    jest.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const queryData = clientA.getQueryData(getAssetsQueryKey);

    expect(queryData).toBeDefined();
    expect(queryData).toStrictEqual(clientB.getQueryData(getAssetsQueryKey));

    observerA.destroy();
    observerB.destroy();

    jest.advanceTimersByTime(inMilliseconds(5, Duration.Minute));

    expect(clientA.getQueryData(getAssetsQueryKey)).toBeUndefined();
    service.destroy();
  });

  it('cleans up removed mutation cache entries once all mutation observers are removed', async () => {
    const defaultOptions = {
      queries: { gcTime: inMilliseconds(5, Duration.Minute) },
    };

    const { clientA, clientB, service } = createClients({ defaultOptions });

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    jest.advanceTimersByTime(0);

    await Promise.all([promiseA, promiseB]);

    jest.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const queryData = clientA.getQueryData(getAssetsQueryKey);

    expect(queryData).toBeDefined();
    expect(queryData).toStrictEqual(clientB.getQueryData(getAssetsQueryKey));

    observerA.destroy();
    observerB.destroy();

    jest.advanceTimersByTime(inMilliseconds(5, Duration.Minute));

    expect(clientA.getQueryData(getAssetsQueryKey)).toBeUndefined();
    service.destroy();
  });

  it('fetches using paginated query observers', async () => {
    const { clientA, clientB, service } = createClients();

    const getPreviousPageParam = ({
      pageInfo,
    }: GetActivityResponse): PageParam | undefined =>
      pageInfo.hasPreviousPage ? { before: pageInfo.startCursor } : undefined;
    const getNextPageParam = ({
      pageInfo,
    }: GetActivityResponse): PageParam | undefined =>
      pageInfo.hasNextPage ? { after: pageInfo.endCursor } : undefined;

    const observerA = new InfiniteQueryObserver(clientA, {
      queryKey: getActivityQueryKey,
      initialPageParam: null,
      getNextPageParam,
      getPreviousPageParam,
    });

    const observerB = new InfiniteQueryObserver(clientB, {
      queryKey: getActivityQueryKey,
      initialPageParam: null,
      getNextPageParam,
      getPreviousPageParam,
    });

    const promiseA = new Promise<InfiniteData<GetActivityResponse>>(
      (resolve) => {
        observerA.subscribe((event) => {
          if (event.status === 'success') {
            resolve(event.data);
          }
        });
      },
    );

    const resultA = await promiseA;

    expect(resultA.pages[0].data).toHaveLength(3);

    const promiseB = new Promise<InfiniteData<GetActivityResponse>>(
      (resolve) => {
        observerB.subscribe((event) => {
          if (event.status === 'success') {
            resolve(event.data);
          }
        });
      },
    );

    const resultB = await promiseB;
    expect(resultA).toStrictEqual(resultB);

    // Advance the full gcTime of ExampleDataService
    jest.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const nextPageResult = await observerA.fetchNextPage();
    expect(nextPageResult.data?.pages).toHaveLength(2);

    expect(clientA.getQueryData(getActivityQueryKey)).toStrictEqual(
      clientB.getQueryData(getActivityQueryKey),
    );

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('errors if query observer attempts to use default query function without a data service', async () => {
    const { clientA } = createClients();

    const observer = new QueryObserver(clientA, {
      queryKey: ['query'],
      retry: false,
    });

    const promise = new Promise<Error>((_resolve, reject) => {
      observer.subscribe((event) => {
        if (event.status === 'error') {
          reject(event.error);
        }
      });
    });

    await expect(promise).rejects.toThrow(
      "You must pass a `queryKey` that calls an action on the messenger provided to `createUIQueryClient`, e.g. `queryKey: ['ExampleDataService:getAssets', ...]`.",
    );
  });

  it('errors if mutation observer attempts to use default mutation function without a data service', async () => {
    const { clientA } = createClients();
    const observer = new TanStackQueryMutationObserver(clientA, {
      mutationKey: ['mutation'],
    });

    await expect(observer.mutate()).rejects.toThrow(
      "You must pass a `mutationKey` that calls an action on the messenger provided to `createUIQueryClient`, e.g. `mutationKey: ['ExampleDataService:createOrder', ...]`.",
    );
  });

  it('ignores attempts to invalidate non-data service queries', async () => {
    const { clientA, messenger } = createClients();

    const spy = jest.spyOn(messenger, 'call');

    const observer = new QueryObserver(clientA, {
      queryKey: ['query'],
      retry: false,
    });

    const promise = new Promise<void>((resolve) => {
      observer.subscribe(() => {
        resolve();
      });
    });

    await promise;

    await clientA.invalidateQueries({ queryKey: ['query'] });

    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores non-data service queries', async () => {
    const { clientA, messenger } = createClients();

    const callSpy = jest.spyOn(messenger, 'call');
    const subscribeSpy = jest.spyOn(messenger, 'subscribe');

    const observer = new QueryObserver(clientA, {
      queryKey: [1, 2, 3],
      queryFn: (): string => 'foo',
      retry: false,
    });

    await new Promise<void>((resolve) => {
      observer.subscribe((event) => {
        if (event.status === 'success') {
          resolve();
        }
      });
    });

    expect(callSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('ignores non-data service mutations', async () => {
    const { clientA, messenger } = createClients();

    const callSpy = jest.spyOn(messenger, 'call');
    const subscribeSpy = jest.spyOn(messenger, 'subscribe');

    const observer = new TanStackQueryMutationObserver(clientA, {
      mutationKey: [1, 2, 3],
      mutationFn: async (): Promise<string> => 'foo',
      retry: false,
    });

    await observer.mutate();

    expect(callSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });
});
