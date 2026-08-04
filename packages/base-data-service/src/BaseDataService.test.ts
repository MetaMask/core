import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import { hashKey } from '@tanstack/query-core';
import { BrokenCircuitError, ConstantBackoff } from 'cockatiel';
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
import {
  BaseDataService,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
  STORAGE_SERVICE_KEY,
} from './BaseDataService.js';

const TEST_ADDRESS = '0x4bbeEB066eD09B7AEd07bF39EEe0460DFa261520';

const MOCK_ASSETS = [
  'eip155:1/slip44:60',
  'bip122:000000000019d6689c085ae165831e93/slip44:0',
  'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
];

// --- `fetchInfiniteQuery` test harness -------------------------------------
// An in-memory paginator plus a service that exposes `fetchInfiniteQuery` both
// with and without page-param callbacks, used to pin down the pagination
// behaviour that must stay identical to query-core v4.

const paginatedServiceName = 'PaginatedService';

// A cursor encodes the offset of a page's first item.
type Cursor = string;
type PageParam = { after?: Cursor; before?: Cursor };

type Page = {
  data: string[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: Cursor | null;
    endCursor: Cursor | null;
  };
};

const PAGE_SIZE = 3;
// 9 items => three pages: [item-0..2], [item-3..5], [item-6..8].
const DATASET = Array.from({ length: 9 }, (_, index) => `item-${index}`);

/**
 * Serve a single page from the in-memory dataset.
 *
 * @param pageParam - The requested page. `undefined` or an `after`/`before`
 * cursor. `after` fetches the page starting at the cursor offset; `before`
 * fetches the page ending just before the cursor offset.
 * @returns The requested page with cursor metadata.
 */
function fetchPage(pageParam?: PageParam): Page {
  let offset = 0;
  if (pageParam?.after !== undefined) {
    offset = Number(pageParam.after);
  } else if (pageParam?.before !== undefined) {
    offset = Number(pageParam.before) - PAGE_SIZE;
  }

  const data = DATASET.slice(offset, offset + PAGE_SIZE);
  const hasNextPage = offset + PAGE_SIZE < DATASET.length;
  const hasPreviousPage = offset > 0;

  return {
    data,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor: hasPreviousPage ? String(offset) : null,
      endCursor: hasNextPage ? String(offset + PAGE_SIZE) : null,
    },
  };
}

type PaginatedServiceActions = DataServiceInvalidateQueriesAction<
  typeof paginatedServiceName
>;
type PaginatedServiceEvents =
  | DataServiceCacheUpdatedEvent<typeof paginatedServiceName>
  | DataServiceGranularCacheUpdatedEvent<typeof paginatedServiceName>;
type PaginatedServiceMessenger = Messenger<
  typeof paginatedServiceName,
  PaginatedServiceActions,
  PaginatedServiceEvents
>;

class PaginatedService extends BaseDataService<
  typeof paginatedServiceName,
  PaginatedServiceMessenger
> {
  // Records every page param the query function is actually invoked with.
  readonly queryFnCalls: (PageParam | undefined)[] = [];

  constructor(
    messenger: PaginatedServiceMessenger,
    { staleTime = Infinity }: { staleTime?: number } = {},
  ) {
    super({
      name: paginatedServiceName,
      messenger,
      policyOptions: { maxRetries: 0, backoff: new ConstantBackoff(0) },
    });
    this.#staleTime = staleTime;
  }

  readonly #staleTime: number;

  /**
   * Paginate using page-param callbacks, the way a well-behaved consumer would.
   *
   * @param pageParam - The page to fetch.
   * @returns The requested page.
   */
  async withCallbacks(pageParam?: PageParam): Promise<Page> {
    return this.fetchInfiniteQuery<Page, unknown, Page, [string], PageParam>(
      {
        queryKey: [`${this.name}:withCallbacks`],
        queryFn: async ({ pageParam: param }) => {
          this.queryFnCalls.push(param);
          return fetchPage(param);
        },
        getNextPageParam: (lastPage) =>
          lastPage.pageInfo.hasNextPage && lastPage.pageInfo.endCursor
            ? { after: lastPage.pageInfo.endCursor }
            : undefined,
        getPreviousPageParam: (firstPage) =>
          firstPage.pageInfo.hasPreviousPage && firstPage.pageInfo.startCursor
            ? { before: firstPage.pageInfo.startCursor }
            : undefined,
        staleTime: this.#staleTime,
      },
      pageParam,
    );
  }

  /**
   * Paginate without any page-param callbacks, relying purely on the explicit
   * page param passed to the base method (the `MoneyAccountApiDataService`
   * shape).
   *
   * @param pageParam - The page to fetch.
   * @returns The requested page.
   */
  async withoutCallbacks(pageParam?: PageParam): Promise<Page> {
    return this.fetchInfiniteQuery<Page, unknown, Page, [string], PageParam>(
      {
        queryKey: [`${this.name}:withoutCallbacks`],
        queryFn: async ({ pageParam: param }) => {
          this.queryFnCalls.push(param);
          return fetchPage(param);
        },
        staleTime: this.#staleTime,
      },
      pageParam,
    );
  }
}

/**
 * The options bag that `withService` takes.
 */
type WithServiceOptions = {
  staleTime?: number;
};

type WithServiceCallback<ReturnValue> = (payload: {
  service: PaginatedService;
  messenger: PaginatedServiceMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Construct a `PaginatedService`, pass it to the given function, and tear it
 * down afterward.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag configures the service (currently just `staleTime`). The function is
 * called with the new service and its messenger.
 * @returns The same return value as the given function.
 */
async function withService<ReturnValue>(
  ...args:
    | [WithServiceCallback<ReturnValue>]
    | [WithServiceOptions, WithServiceCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ staleTime }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const messenger = new Messenger({ namespace: paginatedServiceName });
  const service = new PaginatedService(messenger, { staleTime });
  try {
    return await testFunction({ service, messenger });
  } finally {
    service.destroy();
  }
}

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

  describe('fetchInfiniteQuery', () => {
    beforeAll(() => {
      jest.useRealTimers();
    });

    afterAll(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    });

    describe('with page-param callbacks', () => {
      it('returns the first page on a cold fetch', async () => {
        await withService(async ({ service }) => {
          const page = await service.withCallbacks();

          expect(page.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
          expect(page.pageInfo.hasPreviousPage).toBe(false);
        });
      });

      it('jumps directly to a page by cursor on a cold cache', async () => {
        await withService(async ({ service }) => {
          const page = await service.withCallbacks({ after: '6' });

          expect(page.data).toStrictEqual(['item-6', 'item-7', 'item-8']);
        });
      });

      it('paginates forward across every page', async () => {
        await withService(async ({ service }) => {
          const page1 = await service.withCallbacks();
          const page2 = await service.withCallbacks({
            after: page1.pageInfo.endCursor as string,
          });
          const page3 = await service.withCallbacks({
            after: page2.pageInfo.endCursor as string,
          });

          expect(page1.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
          expect(page2.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
          expect(page3.data).toStrictEqual(['item-6', 'item-7', 'item-8']);
        });
      });

      it('paginates backward to the previous page', async () => {
        await withService(async ({ service }) => {
          // Start in the middle so there is a previous page to go back to.
          const middle = await service.withCallbacks({ after: '3' });
          expect(middle.data).toStrictEqual(['item-3', 'item-4', 'item-5']);

          const previous = await service.withCallbacks({
            before: middle.pageInfo.startCursor as string,
          });

          expect(previous.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
        });
      });

      it('returns only the requested page, not the accumulated data', async () => {
        await withService(async ({ service }) => {
          await service.withCallbacks();
          await service.withCallbacks({ after: '3' });
          const page3 = await service.withCallbacks({ after: '6' });

          expect(page3.data).toHaveLength(PAGE_SIZE);
          expect(page3.data).toStrictEqual(['item-6', 'item-7', 'item-8']);
        });
      });

      it('does not refetch a fresh cached page', async () => {
        await withService({ staleTime: Infinity }, async ({ service }) => {
          await service.withCallbacks();
          await service.withCallbacks();

          expect(service.queryFnCalls).toHaveLength(1);
        });
      });

      it('keeps navigation correct after refetching stale pages', async () => {
        await withService({ staleTime: 0 }, async ({ service }) => {
          await service.withCallbacks();
          await service.withCallbacks({ after: '3' });
          await service.withCallbacks({ after: '6' });

          // A param-less call is stale, so query-core rebuilds all cached pages.
          // This exercises the full-rebuild path, which must use the consumer's
          // page-param callbacks and not any resolvers injected while paging.
          const rebuilt = await service.withCallbacks();
          expect(rebuilt.data).toStrictEqual(['item-0', 'item-1', 'item-2']);

          const page2Again = await service.withCallbacks({ after: '3' });
          expect(page2Again.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
        });
      });
    });

    describe('without page-param callbacks', () => {
      it('fetches an arbitrary page by explicit cursor (forward)', async () => {
        await withService(async ({ service }) => {
          const page1 = await service.withoutCallbacks();
          expect(page1.data).toStrictEqual(['item-0', 'item-1', 'item-2']);

          const page2 = await service.withoutCallbacks({ after: '3' });
          expect(page2.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
        });
      });

      it('fetches the correct page content for a `before` cursor', async () => {
        await withService(async ({ service }) => {
          // Cold jump into the middle, then ask for the page before it.
          const middle = await service.withoutCallbacks({ after: '3' });
          expect(middle.data).toStrictEqual(['item-3', 'item-4', 'item-5']);

          const previous = await service.withoutCallbacks({ before: '3' });
          expect(previous.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
        });
      });

      it('refetches stale multi-page state without page-param callbacks', async () => {
        await withService({ staleTime: 0 }, async ({ service }) => {
          await service.withoutCallbacks();
          await service.withoutCallbacks({ after: '3' });
          await service.withoutCallbacks({ after: '6' });

          // Stale, so query-core rebuilds every cached page by walking forward
          // from the first one. With no consumer `getNextPageParam`, that walk
          // must not throw (the base service supplies a no-op resolver).
          const rebuilt = await service.withoutCallbacks();
          expect(rebuilt.data).toStrictEqual(['item-0', 'item-1', 'item-2']);

          // Navigation still works after the rebuild.
          const page2Again = await service.withoutCallbacks({ after: '3' });
          expect(page2Again.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
        });
      });
    });
  });
});
