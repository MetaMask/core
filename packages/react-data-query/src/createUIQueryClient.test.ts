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
import { Duration, inMilliseconds } from '@metamask/utils';
import {
  InfiniteData,
  InfiniteQueryObserver,
  QueryClient,
  QueryClientConfig,
  QueryObserver,
} from '@tanstack/query-core';

import {
  ExampleDataService,
  ExampleMessenger,
  GetActivityResponse,
  PageParam,
  serviceName,
} from '../../base-data-service/tests/ExampleDataService.js';
import {
  mockAssets,
  mockTransactionsPage1,
  mockTransactionsPage2,
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

describe('createUIQueryClient', () => {
  beforeEach(() => {
    mockAssets();
    mockTransactionsPage1();
    mockTransactionsPage2();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('proxies requests to the underlying service', async () => {
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

  it('fetches using observers', async () => {
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

  it('fetches using observers in the same client', async () => {
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
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    await Promise.all([promiseA, promiseB]);

    // Replace the mock response and invalidate
    mockAssets({
      status: 200,
      body: [],
    });

    await clientA.invalidateQueries();

    const queryData = clientA.getQueryData(getAssetsQueryKey);

    expect(queryData).toStrictEqual([]);
    expect(queryData).toStrictEqual(clientB.getQueryData(getAssetsQueryKey));

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('supports customizing invalidation', async () => {
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

  it('does not remove from the cache if observers still are subscribed', async () => {
    jest.useFakeTimers();

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

  it('cleans up removed cache entries once all observers are removed', async () => {
    jest.useFakeTimers();

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

  it('fetches using paginated observers', async () => {
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

    const nextPageResult = await observerA.fetchNextPage();
    expect(nextPageResult.data?.pages).toHaveLength(2);

    expect(clientA.getQueryData(getActivityQueryKey)).toStrictEqual(
      clientB.getQueryData(getActivityQueryKey),
    );

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('errors if observer attempts to use default query function without a data service', async () => {
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
      "Queries must call actions on the messenger provided to createUIQueryClient, e.g. `queryKey: ['ExampleDataService:getAssets', ...]`.",
    );
  });

  it('ignores attempts to invalidate non data service queries', async () => {
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

  it('ignores non data service queries', async () => {
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
});
