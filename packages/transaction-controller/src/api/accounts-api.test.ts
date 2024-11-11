import type { Hex } from '@metamask/utils';

import type {
  GetAccountTransactionsResponse,
  TransactionResponse,
} from './accounts-api';
import {
  getAccountTransactions,
  getAccountTransactionsAllPages,
} from './accounts-api';

const ADDRESS_MOCK = '0x123';
const CHAIN_IDS_MOCK = ['0x1', '0x2'] as Hex[];
const CURSOR_MOCK = '0x456';
const END_TIMESTAMP_MOCK = 123;
const START_TIMESTAMP_MOCK = 456;

const RESPONSE_MOCK = {
  data: [{}],
} as unknown as GetAccountTransactionsResponse;

/**
 * Mock the fetch function to return the given response JSON.
 * @param responseJson - The response JSON.
 * @param mock - The existing fetch mock to use.
 * @returns The fetch mock.
 */
function mockFetch(
  responseJson: GetAccountTransactionsResponse,
  mock?: jest.SpyInstance,
) {
  return (mock ?? jest.spyOn(global, 'fetch')).mockResolvedValueOnce({
    json: async () => responseJson,
  } as Response);
}

describe('Accounts API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getAccountTransactions', () => {
    it('queries the accounts API with the correct parameters', async () => {
      const fetchMock = mockFetch(RESPONSE_MOCK);

      const response = await getAccountTransactions({
        address: ADDRESS_MOCK,
        chainIds: CHAIN_IDS_MOCK,
        cursor: CURSOR_MOCK,
        endTimestamp: END_TIMESTAMP_MOCK,
        startTimestamp: START_TIMESTAMP_MOCK,
      });

      expect(response).toStrictEqual(RESPONSE_MOCK);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://accounts.api.cx.metamask.io/v1/accounts/${ADDRESS_MOCK}/transactions?networks=${CHAIN_IDS_MOCK[0]},${CHAIN_IDS_MOCK[1]}&startTimestamp=${START_TIMESTAMP_MOCK}&endTimestamp=${END_TIMESTAMP_MOCK}&cursor=${CURSOR_MOCK}`,
      );
    });
  });

  describe('getAccountTransactionsAllPages', () => {
    it('queries the accounts API until no more pages', async () => {
      const fetchMock = mockFetch({
        data: [{ hash: '0x111' } as unknown as TransactionResponse],
        pageInfo: { hasNextPage: true, cursor: '0x1', count: 1 },
      });

      mockFetch(
        {
          data: [{ hash: '0x222' } as unknown as TransactionResponse],
          pageInfo: { hasNextPage: true, cursor: '0x2', count: 1 },
        },
        fetchMock,
      );

      mockFetch(
        {
          data: [{ hash: '0x333' } as unknown as TransactionResponse],
          pageInfo: { hasNextPage: false, count: 1 },
        },
        fetchMock,
      );

      const response = await getAccountTransactionsAllPages({
        address: ADDRESS_MOCK,
      });

      expect(response).toStrictEqual([
        { hash: '0x111' },
        { hash: '0x222' },
        { hash: '0x333' },
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://accounts.api.cx.metamask.io/v1/accounts/${ADDRESS_MOCK}/transactions`,
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `https://accounts.api.cx.metamask.io/v1/accounts/${ADDRESS_MOCK}/transactions?cursor=0x1`,
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `https://accounts.api.cx.metamask.io/v1/accounts/${ADDRESS_MOCK}/transactions?cursor=0x2`,
      );
    });
  });
});
