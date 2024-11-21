import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import type { GetAccountTransactionsResponse } from './accounts-api';
import { getAccountTransactions } from './accounts-api';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const ADDRESS_MOCK = '0x123';
const CHAIN_IDS_MOCK = ['0x1', '0x2'] as Hex[];
const CURSOR_MOCK = '0x456';
const END_TIMESTAMP_MOCK = 123;
const START_TIMESTAMP_MOCK = 456;

const RESPONSE_MOCK = {
  data: [{}],
} as unknown as GetAccountTransactionsResponse;

describe('Accounts API', () => {
  const fetchMock = jest.mocked(successfulFetch);

  /**
   * Mock the fetch function to return the given response JSON.
   * @param responseJson - The response JSON.
   * @returns The fetch mock.
   */
  function mockFetch(responseJson: GetAccountTransactionsResponse) {
    return jest.mocked(successfulFetch).mockResolvedValueOnce({
      json: async () => responseJson,
    } as Response);
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getAccountTransactions', () => {
    it('queries the accounts API with the correct parameters', async () => {
      mockFetch(RESPONSE_MOCK);

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
        expect.any(Object),
      );
    });
  });
});
