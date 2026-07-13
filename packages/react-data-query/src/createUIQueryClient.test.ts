import { Messenger } from '@metamask/messenger';
import {
  hashQueryKey,
  InfiniteData,
  InfiniteQueryObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/query-core';

import {
  ExampleDataService,
  ExampleDataServiceActions,
  ExampleDataServiceEvents,
  GetActivityResponse,
  PageParam,
} from '../../base-data-service/tests/ExampleDataService';
import {
  mockAssets,
  mockTransactionsPage1,
  mockTransactionsPage2,
} from '../../base-data-service/tests/mocks';
import { createUIQueryClient } from './createUIQueryClient';

const DATA_SERVICES = ['ExampleDataService'];

function createClients(): {
  service: ExampleDataService;
  clientA: QueryClient;
  clientB: QueryClient;
  messenger: Messenger<
    'ExampleDataService',
    ExampleDataServiceActions,
    ExampleDataServiceEvents
  >;
} {
  const serviceMessenger = new Messenger<
    'ExampleDataService',
    ExampleDataServiceActions,
    ExampleDataServiceEvents
  >({ namespace: 'ExampleDataService' });
  const service = new ExampleDataService(serviceMessenger);

  const clientA = createUIQueryClient(DATA_SERVICES, serviceMessenger);
  const clientB = createUIQueryClient(DATA_SERVICES, serviceMessenger);

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

  it('proxies requests to the underlying service', async () => {
    const { clientA: client } = createClients();

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
  });

  it('fetches using observers', async () => {
    const { clientA, clientB } = createClients();

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
  });

  it('fetches using observers in the same client', async () => {
    const { clientA } = createClients();

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
  });

  it('synchronizes caches after invalidation', async () => {
    const { clientA, clientB } = createClients();

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
  });

  it('retains actively observed queries when the service cache entry is removed', async () => {
    const { messenger, clientA, clientB } = createClients();

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

    const [dataBefore] = await Promise.all([promiseA, promiseB]);

    const hash = hashQueryKey(getAssetsQueryKey);

    // Simulates the data service garbage collecting its own cache entry
    // (which happens `cacheTime` after a fetch, since service-side queries
    // never have observers). This must not destroy data that mounted
    // consumers are still observing.
    messenger.publish(`ExampleDataService:cacheUpdated:${hash}`, {
      type: 'removed',
      state: null,
    });

    const queryData = clientA.getQueryData(getAssetsQueryKey);

    expect(queryData).toStrictEqual(dataBefore);
    expect(queryData).toStrictEqual(clientB.getQueryData(getAssetsQueryKey));

    observerA.destroy();
    observerB.destroy();
  });

  it('keeps observed queries functional after a service cache removal event', async () => {
    const { messenger, clientA } = createClients();

    const observer = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    await new Promise((resolve) => {
      observer.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const hash = hashQueryKey(getAssetsQueryKey);

    messenger.publish(`ExampleDataService:cacheUpdated:${hash}`, {
      type: 'removed',
      state: null,
    });

    // Replace the mock response and invalidate: the observer must still be
    // wired to a live cache entry that refetches fresh data end-to-end.
    mockAssets({
      status: 200,
      body: [],
    });

    await clientA.invalidateQueries();

    expect(clientA.getQueryData(getAssetsQueryKey)).toStrictEqual([]);

    observer.destroy();
  });

  it('removes unobserved queries when the service cache entry is removed', async () => {
    const { messenger, clientA } = createClients();

    const hash = hashQueryKey(getAssetsQueryKey);
    const subscribeSpy = jest.spyOn(messenger, 'subscribe');

    const observer = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    await new Promise((resolve) => {
      observer.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const cacheListener = subscribeSpy.mock.calls.find(
      ([eventType]) => eventType === `ExampleDataService:cacheUpdated:${hash}`,
    )?.[1] as (payload: { type: 'removed'; state: null }) => void;

    // Destroying the observer unsubscribes the listener from the messenger,
    // but a `removed` event may already be in flight — deliver it directly to
    // simulate that race. With no observers left, the query is removed.
    observer.destroy();

    expect(clientA.getQueryData(getAssetsQueryKey)).toBeDefined();

    cacheListener({ type: 'removed', state: null });

    expect(clientA.getQueryData(getAssetsQueryKey)).toBeUndefined();
  });

  it('fetches using paginated observers', async () => {
    const { clientA, clientB } = createClients();

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
      getNextPageParam,
      getPreviousPageParam,
    });

    const observerB = new InfiniteQueryObserver(clientB, {
      queryKey: getActivityQueryKey,
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
          reject(event.error as Error);
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
