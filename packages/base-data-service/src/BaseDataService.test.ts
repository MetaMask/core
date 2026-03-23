import { BrokenCircuitError } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';
import { hashQueryKey } from '@tanstack/query-core';
import { cleanAll } from 'nock';

import { ExampleDataService, serviceName } from '../tests/ExampleDataService';
import {
  mockAssets,
  mockTransactionsPage1,
  mockTransactionsPage2,
  mockTransactionsPage3,
  TRANSACTIONS_PAGE_2_CURSOR,
  TRANSACTIONS_PAGE_3_CURSOR,
} from '../tests/mocks';

const TEST_ADDRESS = '0x4bbeEB066eD09B7AEd07bF39EEe0460DFa261520';

const MOCK_ASSETS = [
  'eip155:1/slip44:60',
  'bip122:000000000019d6689c085ae165831e93/slip44:0',
  'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
];

describe('BaseDataService', () => {
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

    const hash = hashQueryKey(queryKey);

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
    await new Promise((resolve) => setTimeout(resolve, 0));

    const queryKey = ['ExampleDataService:getAssets', MOCK_ASSETS];

    const hash = hashQueryKey(queryKey);

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
    });
  });
});
