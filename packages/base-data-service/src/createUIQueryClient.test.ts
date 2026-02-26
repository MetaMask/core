import { Messenger } from '@metamask/messenger';
import { Json } from '@metamask/utils';
import { QueryClient, QueryKey, QueryObserver } from '@tanstack/query-core';

import { SubscriptionCallback, SubscriptionPayload } from './BaseDataService';
import { createUIQueryClient } from './createUIQueryClient';
import {
  ExampleDataService,
  ExampleDataServiceActions,
  ExampleMessenger,
} from '../tests/ExampleDataService';
import { mockAssets } from '../tests/mocks';

const DATA_SERVICES = ['ExampleDataService'];

function createClient(serviceMessenger: ExampleMessenger): QueryClient {
  const subscriptions = new Set<SubscriptionCallback>();

  const subscription = (payload: SubscriptionPayload): void => {
    subscriptions.forEach((callback) => callback(payload));
  };

  const messengerAdapter = {
    call: async (
      method: ExampleDataServiceActions['type'],
      ...params: Json[]
    ) => {
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
      return serviceMessenger.call(method, ...params);
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

describe('createUIQueryClient', () => {
  beforeEach(() => {
    mockAssets();
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
});
