import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import { hashKey } from '@tanstack/query-core';
import { BrokenCircuitError } from 'cockatiel';
import { cleanAll } from 'nock';

import {
  ExampleDataService,
  serviceName,
} from '../tests/ExampleDataService.js';
import {
  mockAssets,
  mockTransactionsPage1,
  mockTransactionsPage2,
  mockTransactionsPage3,
  TRANSACTIONS_PAGE_2_CURSOR,
  TRANSACTIONS_PAGE_3_CURSOR,
} from '../tests/mocks.js';
import { STORAGE_SERVICE_KEY } from './BaseDataService.js';

const TEST_ADDRESS = '0x4bbeEB066eD09B7AEd07bF39EEe0460DFa261520';

const MOCK_ASSETS = [
  'eip155:1/slip44:60',
  'bip122:000000000019d6689c085ae165831e93/slip44:0',
  'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
];

describe('BaseDataService', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockAssets();
    mockTransactionsPage1();
    mockTransactionsPage2();
    mockTransactionsPage3();
  });

  it('handles basic queries', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    expect(await service.getAssets(MOCK_ASSETS)).toStrictEqual([
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

  it('handles paginated queries', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    const page1 = await service.getActivity(TEST_ADDRESS);

    expect(page1.data).toHaveLength(3);

    const page2 = await service.getActivity(TEST_ADDRESS, {
      after: page1.pageInfo.endCursor,
    });

    expect(page2.data).toHaveLength(3);

    expect(page2.data).not.toStrictEqual(page1.data);
  });

  it('handles paginated queries starting at a specific page', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    const page2 = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_2_CURSOR,
    });

    expect(page2.data).toHaveLength(3);

    const page3 = await service.getActivity(TEST_ADDRESS, {
      after: page2.pageInfo.endCursor,
    });

    expect(page3.data).toHaveLength(3);

    expect(page3.data).not.toStrictEqual(page2.data);
  });

  it('handles backwards queries starting at a specific page', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    const page3 = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_3_CURSOR,
    });

    expect(page3.data).toHaveLength(3);

    const page2 = await service.getActivity(TEST_ADDRESS, {
      before: page3.pageInfo.startCursor,
    });

    expect(page2.data).toHaveLength(3);
    expect(page2.data).not.toStrictEqual(page3.data);
  });

  it('replaces an already-cached page in place when fetching it again', async () => {
    cleanAll();
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    const page2Body = {
      data: [
        {
          hash: '0xcecd28aa5bd781ffd2a6d960578ffc6c89ac390e8d02baebc977a827956394e9',
          timestamp: '2025-12-29T11:51:08.000Z',
        },
      ],
      pageInfo: {
        count: 1,
        hasNextPage: false,
        hasPreviousPage: true,
        startCursor: 'page1-cursor',
        endCursor: 'page3-cursor',
      },
    };
    mockTransactionsPage2({ status: 200, body: page2Body });
    mockTransactionsPage2({ status: 200, body: page2Body });

    const page2 = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_2_CURSOR,
    });
    expect(page2.data).toHaveLength(1);

    // A refetch re-requests a page that is already present in the cache.
    const page2Again = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_2_CURSOR,
    });
    expect(page2Again.data).toStrictEqual(page2.data);

    const queryKey = ['ExampleDataService:getActivity', TEST_ADDRESS];
    const hash = hashKey(queryKey);
    const cacheUpdate = publishSpy.mock.calls
      .filter(([event]) => event === `ExampleDataService:cacheUpdated:${hash}`)
      .at(-1)?.[1] as {
      state: { queries: [{ state: { data: { pages: unknown[] } } }] };
    };

    // The cache must hold each page exactly once.
    expect(cacheUpdate.state.queries[0].state.data.pages).toHaveLength(1);
  });

  it('replaces an already-cached page in place when fetching it again in the forward direction', async () => {
    cleanAll();
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    const page2Body = {
      data: [
        {
          hash: '0xcecd28aa5bd781ffd2a6d960578ffc6c89ac390e8d02baebc977a827956394e9',
          timestamp: '2025-12-29T11:51:08.000Z',
        },
      ],
      pageInfo: {
        count: 1,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: TRANSACTIONS_PAGE_2_CURSOR,
      },
    };
    mockTransactionsPage2({ status: 200, body: page2Body });
    mockTransactionsPage2({ status: 200, body: page2Body });

    const page2 = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_2_CURSOR,
    });
    expect(page2.data).toHaveLength(1);

    // A refetch re-requests a page that is already present in the cache.
    const page2Again = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_2_CURSOR,
    });
    expect(page2Again.data).toStrictEqual(page2.data);

    const queryKey = ['ExampleDataService:getActivity', TEST_ADDRESS];
    const hash = hashKey(queryKey);
    const cacheUpdate = publishSpy.mock.calls
      .filter(([event]) => event === `ExampleDataService:cacheUpdated:${hash}`)
      .at(-1)?.[1] as {
      state: { queries: [{ state: { data: { pages: unknown[] } } }] };
    };

    // The cache must hold each page exactly once.
    expect(cacheUpdate.state.queries[0].state.data.pages).toHaveLength(1);
  });

  it('does not corrupt the cache when refetching a page with no adjacent pages', async () => {
    cleanAll();
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    const pageBody = {
      data: [
        {
          hash: '0xcecd28aa5bd781ffd2a6d960578ffc6c89ac390e8d02baebc977a827956394e9',
          timestamp: '2025-12-29T11:51:08.000Z',
        },
      ],
      pageInfo: {
        count: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    };
    mockTransactionsPage2({ status: 200, body: pageBody });
    mockTransactionsPage2({ status: 200, body: pageBody });

    const page = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_2_CURSOR,
    });
    expect(page.data).toHaveLength(1);

    // Refetch a page whose getNextPageParam and getPreviousPageParam both
    // return null. query-core skips the fetch entirely, so no duplicate is
    // added and the cache must not be corrupted by pop/shift.
    const pageAgain = await service.getActivity(TEST_ADDRESS, {
      after: TRANSACTIONS_PAGE_2_CURSOR,
    });
    expect(pageAgain.data).toStrictEqual(page.data);

    const queryKey = ['ExampleDataService:getActivity', TEST_ADDRESS];
    const hash = hashKey(queryKey);
    const cacheUpdate = publishSpy.mock.calls
      .filter(([event]) => event === `ExampleDataService:cacheUpdated:${hash}`)
      .at(-1)?.[1] as {
      state: { queries: [{ state: { data: { pages: unknown[] } } }] };
    };

    // The cache must still hold the single page.
    expect(cacheUpdate.state.queries[0].state.data.pages).toHaveLength(1);
  });

  it('emits `:cacheUpdated` events when cache is updated', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.getAssets(MOCK_ASSETS);

    const queryKey = ['ExampleDataService:getAssets', MOCK_ASSETS];

    const hash = hashKey(queryKey);

    expect(publishSpy).toHaveBeenNthCalledWith(
      6,
      `ExampleDataService:cacheUpdated:${hash}`,
      {
        type: 'updated',
        state: {
          mutations: [],
          queries: [
            expect.objectContaining({
              state: expect.objectContaining({
                status: 'success',
                data: [
                  {
                    assetId:
                      'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
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
                ],
              }),
            }),
          ],
        },
      },
    );
  });

  it('emits `:cacheUpdated` events when cache entry is removed', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.getAssets(MOCK_ASSETS);

    // Wait for GC
    jest.runAllTimers();

    const queryKey = ['ExampleDataService:getAssets', MOCK_ASSETS];

    const hash = hashKey(queryKey);

    expect(publishSpy).toHaveBeenNthCalledWith(
      8,
      `ExampleDataService:cacheUpdated:${hash}`,
      {
        type: 'removed',
        state: null,
      },
    );
  });

  it('does not emit events after being destroyed', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    service.destroy();

    await service.getAssets(MOCK_ASSETS);

    expect(publishSpy).toHaveBeenCalledTimes(0);
  });

  it('invalidates queries when requested', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.getAssets(MOCK_ASSETS);

    expect(publishSpy).toHaveBeenCalledTimes(6);

    const queryKey = ['ExampleDataService:getAssets', MOCK_ASSETS];
    await service.invalidateQueries({ queryKey });

    expect(publishSpy).toHaveBeenCalledTimes(8);
  });

  describe('service policy', () => {
    beforeAll(() => {
      jest.useRealTimers();
    });

    afterAll(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    });

    beforeEach(() => {
      cleanAll();
    });

    it('retries failed queries using the service policy', async () => {
      const messenger = new Messenger({ namespace: serviceName });
      const service = new ExampleDataService(messenger);

      mockAssets({ status: 500 });
      mockAssets({ status: 500 });
      mockAssets();

      const result = await service.getAssets(MOCK_ASSETS);

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

    it('throws after exhausting service policy retries', async () => {
      const messenger = new Messenger({ namespace: serviceName });
      const service = new ExampleDataService(messenger);

      mockAssets({ status: 500, body: { error: 'internal server error' } });
      mockAssets({ status: 500, body: { error: 'internal server error' } });
      mockAssets({ status: 500, body: { error: 'internal server error' } });

      await expect(service.getAssets(MOCK_ASSETS)).rejects.toThrow(
        'Query failed with status code: 500.',
      );

      service.destroy();
    });

    it('breaks the circuit after consecutive failures', async () => {
      const messenger = new Messenger({ namespace: serviceName });
      const service = new ExampleDataService(messenger);

      mockAssets({ status: 500, body: { error: 'internal server error' } });
      mockAssets({ status: 500, body: { error: 'internal server error' } });
      mockAssets({ status: 500, body: { error: 'internal server error' } });

      await expect(service.getAssets(MOCK_ASSETS)).rejects.toThrow(
        'Query failed with status code: 500.',
      );

      await expect(service.getAssets(MOCK_ASSETS)).rejects.toThrow(
        BrokenCircuitError,
      );

      service.destroy();
    });
  });

  describe('persistence', () => {
    it('persists the cache using the StorageService', async () => {
      const rootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
        captureException: console.error,
      });

      const setItem = jest.fn();
      rootMessenger.registerActionHandler('StorageService:setItem', setItem);

      const messenger = rootMessenger.buildChild({
        namespace: serviceName,
        actions: ['StorageService:getItem', 'StorageService:setItem'],
      });
      const service = new ExampleDataService(messenger);

      mockAssets();

      await service.getAssets(MOCK_ASSETS);

      jest.runAllTimers();

      expect(setItem).toHaveBeenCalledWith(serviceName, STORAGE_SERVICE_KEY, {
        state: {
          queries: [
            {
              dehydratedAt: expect.any(Number),
              queryHash:
                '["ExampleDataService:getAssets",["eip155:1/slip44:60","bip122:000000000019d6689c085ae165831e93/slip44:0","eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f"]]',
              queryKey: [
                'ExampleDataService:getAssets',
                [
                  'eip155:1/slip44:60',
                  'bip122:000000000019d6689c085ae165831e93/slip44:0',
                  'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
                ],
              ],
              state: {
                data: [
                  {
                    assetId:
                      'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
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
                ],
                dataUpdateCount: 1,
                dataUpdatedAt: expect.any(Number),
                error: null,
                errorUpdateCount: 0,
                errorUpdatedAt: 0,
                fetchFailureCount: 0,
                fetchFailureReason: null,
                fetchMeta: null,
                fetchStatus: 'idle',
                isInvalidated: false,
                status: 'success',
              },
            },
          ],
          mutations: [],
        },
        timestamp: expect.any(Number),
      });
    });

    it('rehydrates the cache using the StorageService', async () => {
      const rootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
        captureException: console.error,
      });

      rootMessenger.registerActionHandler('StorageService:setItem', jest.fn());
      rootMessenger.registerActionHandler('StorageService:getItem', () => {
        return {
          result: {
            state: {
              queries: [
                {
                  queryHash:
                    '["ExampleDataService:getAssets",["eip155:1/slip44:60","bip122:000000000019d6689c085ae165831e93/slip44:0","eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f"]]',
                  queryKey: [
                    'ExampleDataService:getAssets',
                    [
                      'eip155:1/slip44:60',
                      'bip122:000000000019d6689c085ae165831e93/slip44:0',
                      'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
                    ],
                  ],
                  state: {
                    data: [
                      {
                        assetId:
                          'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
                        decimals: 18,
                        name: 'Dai Stablecoin',
                        symbol: 'DAI',
                      },
                      {
                        assetId:
                          'bip122:000000000019d6689c085ae165831e93/slip44:0',
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
                    ],
                    dataUpdateCount: 1,
                    dataUpdatedAt: Date.now(),
                    error: null,
                    errorUpdateCount: 0,
                    errorUpdatedAt: 0,
                    fetchFailureCount: 0,
                    fetchFailureReason: null,
                    fetchMeta: null,
                    fetchStatus: 'idle',
                    isInvalidated: false,
                    status: 'success',
                  },
                },
              ],
              mutations: [],
            },
            timestamp: Date.now(),
          },
        };
      });

      const messenger = rootMessenger.buildChild({
        namespace: serviceName,
        actions: ['StorageService:getItem', 'StorageService:setItem'],
      });
      const spy = jest.spyOn(messenger, 'call');
      const service = new ExampleDataService(messenger);
      service.init();

      await rootMessenger.waitUntil('ExampleDataService:cacheUpdated');

      mockAssets({ status: 500 });

      const result = await service.getAssets(MOCK_ASSETS);

      expect(result).toHaveLength(3);

      expect(spy).toHaveBeenCalledWith(
        'StorageService:getItem',
        serviceName,
        STORAGE_SERVICE_KEY,
      );
    });

    it('discards the cache if it has expired', async () => {
      const rootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
        captureException: console.error,
      });

      rootMessenger.registerActionHandler('StorageService:setItem', jest.fn());
      rootMessenger.registerActionHandler('StorageService:getItem', () => {
        return {
          result: {
            state: {
              queries: [],
              mutations: [],
            },
            timestamp: 1783516587702,
          },
        };
      });

      rootMessenger.registerActionHandler(
        'StorageService:removeItem',
        jest.fn(),
      );

      const messenger = rootMessenger.buildChild({
        namespace: serviceName,
        actions: [
          'StorageService:getItem',
          'StorageService:setItem',
          'StorageService:removeItem',
        ],
      });

      const callSpy = jest.spyOn(messenger, 'call');
      const publishSpy = jest.spyOn(messenger, 'publish');

      const service = new ExampleDataService(messenger);
      service.init();

      expect(callSpy).toHaveBeenCalledWith(
        'StorageService:getItem',
        serviceName,
        STORAGE_SERVICE_KEY,
      );

      expect(publishSpy).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(callSpy).toHaveBeenCalledWith(
        'StorageService:removeItem',
        serviceName,
        STORAGE_SERVICE_KEY,
      );
    });

    it('removes the persisted cache from the StorageService if the cache is empty', async () => {
      const rootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
        captureException: console.error,
      });

      const setItem = jest.fn();
      const removeItem = jest.fn();
      rootMessenger.registerActionHandler('StorageService:setItem', setItem);
      rootMessenger.registerActionHandler(
        'StorageService:removeItem',
        removeItem,
      );

      const messenger = rootMessenger.buildChild({
        namespace: serviceName,
        actions: ['StorageService:setItem', 'StorageService:removeItem'],
      });
      const service = new ExampleDataService(messenger);

      mockAssets();

      await service.getAssets(MOCK_ASSETS);

      // Wait for GC
      jest.runAllTimers();

      expect(removeItem).toHaveBeenCalledWith(serviceName, STORAGE_SERVICE_KEY);
    });

    it('skips persisting cache if persistConfig is not set', async () => {
      const messenger = new Messenger({ namespace: serviceName });
      const callSpy = jest.spyOn(messenger, 'call');
      const service = new ExampleDataService(messenger, {});

      mockAssets();

      await service.getAssets(MOCK_ASSETS);

      jest.runAllTimers();

      expect(callSpy).not.toHaveBeenCalledWith(
        'StorageService:setItem',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('skips rehydrating cache if persistConfig is not set', async () => {
      const messenger = new Messenger({ namespace: serviceName });
      const callSpy = jest.spyOn(messenger, 'call');
      const service = new ExampleDataService(messenger, {});

      service.init();

      expect(callSpy).not.toHaveBeenCalledWith(
        'StorageService:getItem',
        expect.anything(),
        expect.anything(),
      );
    });

    it('ignores rehydration if the StorageService fails', async () => {
      const rootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
        captureException: console.error,
      });

      rootMessenger.registerActionHandler('StorageService:setItem', jest.fn());
      rootMessenger.registerActionHandler('StorageService:getItem', () => {
        return {
          error: new Error('Failed to retrieve item.'),
        };
      });

      const messenger = rootMessenger.buildChild({
        namespace: serviceName,
        actions: ['StorageService:getItem', 'StorageService:setItem'],
      });

      const callSpy = jest.spyOn(messenger, 'call');
      const publishSpy = jest.spyOn(messenger, 'publish');

      const service = new ExampleDataService(messenger);
      service.init();

      expect(callSpy).toHaveBeenCalledWith(
        'StorageService:getItem',
        serviceName,
        STORAGE_SERVICE_KEY,
      );

      expect(publishSpy).not.toHaveBeenCalled();
    });
  });
});
