import { Messenger } from '@metamask/messenger';
import { Json } from '@metamask/utils';
import {
  DehydratedState,
  InfiniteData,
  InfiniteQueryObserver,
  QueryClient,
  QueryKey,
  QueryObserver,
} from '@tanstack/query-core';

import { SubscriptionCallback, SubscriptionPayload } from './BaseDataService';
import { createUIQueryClient } from './createUIQueryClient';
import {
  ExampleDataService,
  ExampleDataServiceActions,
  ExampleMessenger,
  GetActivityResponse,
  GetAssetsResponse,
} from '../tests/ExampleDataService';
import {
  mockAssets,
  mockTransactionsPage1,
  mockTransactionsPage2,
} from '../tests/mocks';

const DATA_SERVICES = ['ExampleDataService'];

function createClient(serviceMessenger: ExampleMessenger): QueryClient {
  const subscriptions = new Set<SubscriptionCallback>();

  const subscription = (payload: SubscriptionPayload): void => {
    subscriptions.forEach((callback) => callback(payload));
  };

  const messengerAdapter = {
    call: async (
      method: string,
      ...params: Json[]
    ): Promise<
      void | DehydratedState | GetActivityResponse | GetAssetsResponse
    > => {
      if (method === 'ExampleDataService:subscribe') {
        return serviceMessenger.call(
          method,
          params[0] as QueryKey,
          subscription,
        );
      } else if (method === 'ExampleDataService:unsubscribe') {
        return serviceMessenger.call(
          method,
          params[0] as QueryKey,
          subscription,
        );
      }
      return serviceMessenger.call(
        method as ExampleDataServiceActions['type'],
        // @ts-expect-error TODO.
        ...params,
      );
    },
    subscribe: async (
      _method: string,
      callback: SubscriptionCallback,
    ): Promise<void> => {
      subscriptions.add(callback);
    },
  };

  return createUIQueryClient(DATA_SERVICES, messengerAdapter);
}

function createClients(): {
  service: ExampleDataService;
  clientA: QueryClient;
  clientB: QueryClient;
} {
  const serviceMessenger = new Messenger<
    'ExampleDataService',
    ExampleDataServiceActions
  >({ namespace: 'ExampleDataService' });
  const service = new ExampleDataService(serviceMessenger);

  const clientA = createClient(serviceMessenger);
  const clientB = createClient(serviceMessenger);

  return { service, clientA, clientB };
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

  it('fetches using paginated observers', async () => {
    const { clientA, clientB } = createClients();

    const getPreviousPageParam = ({
      pageInfo,
    }: GetActivityResponse): string | undefined =>
      pageInfo.hasPreviousPage ? pageInfo.startCursor : undefined;
    const getNextPageParam = ({
      pageInfo,
    }: GetActivityResponse): string | undefined =>
      pageInfo.hasNextPage ? pageInfo.endCursor : undefined;

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
});
