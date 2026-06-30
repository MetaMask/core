import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  MessengerActions,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceSetItemAction,
} from '@metamask/storage-service';
import { hashKey } from '@tanstack/query-core';
import { BrokenCircuitError } from 'cockatiel';
import { cleanAll } from 'nock';

import {
  ExampleDataService,
  ExampleMessenger,
  serviceName,
} from '../tests/ExampleDataService.js';
import {
  mockAddFollowerRequest,
  mockAssets,
  mockCreateDataDeletionTaskRequest,
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

type RootMessenger = Messenger<
  MockAnyNamespace,
  | StorageServiceGetItemAction
  | StorageServiceSetItemAction
  | StorageServiceRemoveItemAction,
  never
>;

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
    const messenger = createServiceMessenger();
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
    const messenger = createServiceMessenger();
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
    const messenger = createServiceMessenger();
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
    const messenger = createServiceMessenger();
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

  it('handles mutations that validate responses', async () => {
    mockAddFollowerRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);

    expect(await service.addFollower('1')).toStrictEqual({
      followed: [
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          name: 'TraderAlice',
          imageUrl: 'https://example.com/avatar.png',
        },
      ],
    });
  });

  it('handles mutations that do not validate responses', async () => {
    mockCreateDataDeletionTaskRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);

    expect(await service.createDataDeletionTask('1', '2')).toStrictEqual({
      status: 'ok',
      regulateId: '99999',
    });
  });

  it('never retries mutations', async () => {
    mockAddFollowerRequest({
      mockReply: { status: 504 },
    });
    mockAddFollowerRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);

    await expect(service.addFollower('1')).rejects.toThrow('Mutation failed');
    expect(await service.addFollower('1')).toStrictEqual({
      followed: [
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          name: 'TraderAlice',
          imageUrl: 'https://example.com/avatar.png',
        },
      ],
    });
  });

  it('emits `:cacheUpdated` events when query cache entry is added', async () => {
    const messenger = createServiceMessenger();
    const publishSpy = jest.spyOn(messenger, 'publish');
    const service = new ExampleDataService(messenger);

    await service.getAssets(MOCK_ASSETS);

    const queryKey = ['ExampleDataService:getAssets', MOCK_ASSETS];
    const hash = hashKey(queryKey);
    const expectedState = {
      mutations: [],
      queries: [
        expect.objectContaining({
          state: expect.objectContaining({
            status: 'pending',
          }),
        }),
      ],
    };

    expect(publishSpy).toHaveBeenNthCalledWith(
      1,
      `ExampleDataService:cacheUpdated`,
      {
        type: 'added',
        hash,
        state: expectedState,
      },
    );

    expect(publishSpy).toHaveBeenNthCalledWith(
      2,
      `ExampleDataService:cacheUpdated:${hash}`,
      {
        type: 'added',
        state: expectedState,
      },
    );
  });

  it('emits `:cacheUpdated` events when mutation cache entry is added', async () => {
    mockAddFollowerRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.addFollower('1');

    const hash = hashKey(['ExampleDataService:addFollower', '1']);
    const expectedState = {
      queries: [],
      mutations: [
        expect.objectContaining({
          state: expect.objectContaining({
            status: 'idle',
          }),
        }),
      ],
    };

    expect(publishSpy).toHaveBeenNthCalledWith(
      1,
      `ExampleDataService:cacheUpdated`,
      {
        type: 'added',
        hash,
        state: expectedState,
      },
    );

    expect(publishSpy).toHaveBeenNthCalledWith(
      2,
      `ExampleDataService:cacheUpdated:${hash}`,
      {
        type: 'added',
        state: expectedState,
      },
    );
  });

  it('emits `:cacheUpdated` events when query cache is updated', async () => {
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);

    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.getAssets(MOCK_ASSETS);

    const queryKey = ['ExampleDataService:getAssets', MOCK_ASSETS];

    const hash = hashKey(queryKey);
    const expectedState = {
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
    };

    expect(publishSpy).toHaveBeenNthCalledWith(
      5,
      `ExampleDataService:cacheUpdated`,
      {
        type: 'updated',
        hash,
        state: expectedState,
      },
    );

    expect(publishSpy).toHaveBeenNthCalledWith(
      6,
      `ExampleDataService:cacheUpdated:${hash}`,
      {
        type: 'updated',
        state: expectedState,
      },
    );
  });

  it('emits `:cacheUpdated` events when mutation cache is updated', async () => {
    mockAddFollowerRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.addFollower('1');

    const hash = hashKey(['ExampleDataService:addFollower', '1']);
    const expectedState = {
      queries: [],
      mutations: [
        expect.objectContaining({
          state: expect.objectContaining({
            status: 'success',
            data: {
              followed: [
                {
                  profileId: '550e8400-e29b-41d4-a716-446655440000',
                  address: '0x1234567890abcdef1234567890abcdef12345678',
                  name: 'TraderAlice',
                  imageUrl: 'https://example.com/avatar.png',
                },
              ],
            },
          }),
        }),
      ],
    };

    expect(publishSpy).toHaveBeenNthCalledWith(
      5,
      `ExampleDataService:cacheUpdated`,
      {
        type: 'updated',
        hash,
        state: expectedState,
      },
    );

    expect(publishSpy).toHaveBeenNthCalledWith(
      6,
      `ExampleDataService:cacheUpdated:${hash}`,
      {
        type: 'updated',
        state: expectedState,
      },
    );
  });

  it('emits `:cacheUpdated` events when query cache entry is removed', async () => {
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);

    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.getAssets(MOCK_ASSETS);

    // Wait for GC
    jest.runAllTimers();

    const queryKey = ['ExampleDataService:getAssets', MOCK_ASSETS];

    const hash = hashKey(queryKey);

    expect(publishSpy).toHaveBeenNthCalledWith(
      7,
      `ExampleDataService:cacheUpdated`,
      {
        type: 'removed',
        hash,
        state: null,
      },
    );

    expect(publishSpy).toHaveBeenNthCalledWith(
      8,
      `ExampleDataService:cacheUpdated:${hash}`,
      {
        type: 'removed',
        state: null,
      },
    );
  });

  it('emits `:cacheUpdated` events when mutation cache entry is removed', async () => {
    mockAddFollowerRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.addFollower('1');
    // Wait for GC
    jest.runAllTimers();

    const hash = hashKey(['ExampleDataService:addFollower', '1']);
    expect(publishSpy).toHaveBeenCalledTimes(8);
    expect(publishSpy).toHaveBeenNthCalledWith(
      7,
      `ExampleDataService:cacheUpdated`,
      {
        type: 'removed',
        hash,
        state: null,
      },
    );

    expect(publishSpy).toHaveBeenNthCalledWith(
      7,
      `ExampleDataService:cacheUpdated`,
      {
        type: 'removed',
        hash,
        state: null,
      },
    );

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
    mockAddFollowerRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    service.destroy();

    await service.getAssets(MOCK_ASSETS);
    await service.addFollower('1');

    expect(publishSpy).toHaveBeenCalledTimes(0);
  });

  it('clears pending mutation garbage-collection timers when destroyed', async () => {
    mockAddFollowerRequest();
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);
    const timerCountBeforeMutation = jest.getTimerCount();
    await service.addFollower('1');

    service.destroy();

    expect(jest.getTimerCount()).toBe(timerCountBeforeMutation);
  });

  it('invalidates queries when requested', async () => {
    const messenger = createServiceMessenger();
    const service = new ExampleDataService(messenger);
    const publishSpy = jest.spyOn(messenger, 'publish');

    await service.getAssets(MOCK_ASSETS);

    expect(publishSpy).toHaveBeenCalledTimes(6);

    await service.invalidateQueries({
      queryKey: ['ExampleDataService:getAssets', MOCK_ASSETS],
    });

    expect(publishSpy).toHaveBeenCalledTimes(8);
  });

  describe('validation', () => {
    beforeAll(() => {
      jest.useRealTimers();
    });

    afterAll(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    });

    beforeEach(() => {
      cleanAll();
    });

    it('throws when query response fails struct validation', async () => {
      const messenger = createServiceMessenger();
      const service = new ExampleDataService(messenger);

      mockAssets({ status: 200, body: { foo: 'bar' } });

      await expect(service.getAssets(MOCK_ASSETS)).rejects.toThrow(
        'Query function for "ExampleDataService:getAssets" returned an unexpected response: Expected an array value, but received: [object Object].',
      );

      service.destroy();
    });

    it('throws when mutation response fails struct validation', async () => {
      const messenger = createServiceMessenger();
      const service = new ExampleDataService(messenger);

      mockAddFollowerRequest({
        mockReply: {
          status: 200,
          body: { foo: 'bar' },
        },
      });

      await expect(service.addFollower('1')).rejects.toThrow(
        'Mutation function for "ExampleDataService:addFollower" returned an unexpected response: At path: followed -- Expected an array value, but received: undefined.',
      );

      service.destroy();
    });
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
      const messenger = createServiceMessenger();
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
      const messenger = createServiceMessenger();
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
      const messenger = createServiceMessenger();
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
      const setItem = jest.fn();
      const rootMessenger = createRootMessenger({
        actionHandlers: {
          'StorageService:setItem': setItem,
        },
      });
      const messenger = createServiceMessenger(rootMessenger);
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
      const getItem = jest.fn().mockResolvedValue({
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
      });
      const rootMessenger = createRootMessenger({
        actionHandlers: {
          'StorageService:getItem': getItem,
        },
      });
      const messenger = createServiceMessenger(rootMessenger);
      const service = new ExampleDataService(messenger);

      service.init();
      await messenger.waitUntil('ExampleDataService:cacheUpdated');

      mockAssets({ status: 500 });

      const result = await service.getAssets(MOCK_ASSETS);

      expect(result).toHaveLength(3);

      expect(getItem).toHaveBeenCalledWith(serviceName, STORAGE_SERVICE_KEY);
    });

    it('discards the cache if it has expired', async () => {
      const getItem = jest.fn().mockResolvedValue({
        result: {
          state: {
            queries: [],
            mutations: [],
          },
          timestamp: 1783516587702,
        },
      });
      const removeItem = jest.fn();
      const rootMessenger = createRootMessenger({
        actionHandlers: {
          'StorageService:getItem': getItem,
          'StorageService:removeItem': removeItem,
        },
      });
      const messenger = createServiceMessenger(rootMessenger);
      const publishSpy = jest.spyOn(messenger, 'publish');
      const service = new ExampleDataService(messenger);
      service.init();

      expect(getItem).toHaveBeenCalledWith(serviceName, STORAGE_SERVICE_KEY);

      expect(publishSpy).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(removeItem).toHaveBeenCalledWith(serviceName, STORAGE_SERVICE_KEY);
    });

    it('removes the persisted cache from the StorageService if the cache is empty', async () => {
      const removeItem = jest.fn();
      const rootMessenger = createRootMessenger({
        actionHandlers: {
          'StorageService:removeItem': removeItem,
        },
      });
      const messenger = createServiceMessenger(rootMessenger);
      const service = new ExampleDataService(messenger);

      mockAssets();

      await service.getAssets(MOCK_ASSETS);

      // Wait for GC
      jest.runAllTimers();

      expect(removeItem).toHaveBeenCalledWith(serviceName, STORAGE_SERVICE_KEY);
    });

    it('skips persisting cache if persistConfig is not set', async () => {
      const setItem = jest.fn();
      const rootMessenger = createRootMessenger({
        actionHandlers: {
          'StorageService:setItem': setItem,
        },
      });
      const messenger = createServiceMessenger(rootMessenger);
      const service = new ExampleDataService(messenger, {});

      mockAssets();

      await service.getAssets(MOCK_ASSETS);

      jest.runAllTimers();

      expect(setItem).not.toHaveBeenCalled();
    });

    it('skips rehydrating cache if persistConfig is not set', async () => {
      const getItem = jest.fn();
      const rootMessenger = createRootMessenger({
        actionHandlers: {
          'StorageService:getItem': getItem,
        },
      });
      const messenger = createServiceMessenger(rootMessenger);
      const service = new ExampleDataService(messenger, {});

      service.init();

      expect(getItem).not.toHaveBeenCalled();
    });

    it('ignores rehydration if the StorageService fails', async () => {
      const getItem = jest.fn().mockResolvedValue({
        error: new Error('Failed to retrieve item.'),
      });
      const rootMessenger = createRootMessenger({
        actionHandlers: {
          'StorageService:getItem': getItem,
        },
      });
      const messenger = createServiceMessenger(rootMessenger);
      const publishSpy = jest.spyOn(messenger, 'publish');
      const service = new ExampleDataService(messenger);
      service.init();

      expect(getItem).toHaveBeenCalledWith(serviceName, STORAGE_SERVICE_KEY);

      expect(publishSpy).not.toHaveBeenCalled();
    });
  });
});

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
