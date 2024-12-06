import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import { FirstTimeInteractionError } from '../errors';
import type {
  GetAccountAddressRelationshipRequest,
  GetAccountTransactionsResponse,
} from './accounts-api';
import {
  getAccountAddressRelationship,
  getAccountTransactions,
} from './accounts-api';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const ADDRESS_MOCK = '0x123';
const CHAIN_IDS_MOCK = ['0x1', '0x2'] as Hex[];
const CURSOR_MOCK = '0x456';
const END_TIMESTAMP_MOCK = 123;
const START_TIMESTAMP_MOCK = 456;
const CHAIN_ID_SUPPORTED = 1;
const CHAIN_ID_UNSUPPORTED = 999;
const FROM_ADDRESS = '0xSender';
const TO_ADDRESS = '0xRecipient';
const SORT_DIRECTION_MOCK = 'ASC';

const ACCOUNT_RESPONSE_MOCK = {
  data: [{}],
} as unknown as GetAccountTransactionsResponse;

const FIRST_TIME_REQUEST_MOCK: GetAccountAddressRelationshipRequest = {
  chainId: CHAIN_ID_SUPPORTED,
  from: FROM_ADDRESS,
  to: TO_ADDRESS,
};

describe('Accounts API', () => {
  const fetchMock = jest.mocked(successfulFetch);

  /**
   * Mock the fetch function to return the given response JSON.
   * @param responseJson - The response JSON.
   * @param status - The status code.
   * @returns The fetch mock.
   */
  function mockFetch(responseJson: Record<string, unknown>, status = 200) {
    return jest.mocked(successfulFetch).mockResolvedValueOnce({
      status,
      json: async () => responseJson,
    } as Response);
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getAccountAddressRelationship', () => {
    const EXISTING_RELATIONSHIP_RESPONSE_MOCK = {
      count: 1,
    };

    describe('returns API response', () => {
      it('for 204 responses', async () => {
        mockFetch({}, 204);

        const result = await getAccountAddressRelationship(
          FIRST_TIME_REQUEST_MOCK,
        );

        expect(result).toStrictEqual({
          count: 0,
        });
      });

      it('when there is no existing relationship', async () => {
        mockFetch({ count: 0 });

        const result = await getAccountAddressRelationship(
          FIRST_TIME_REQUEST_MOCK,
        );

        expect(result).toStrictEqual({
          count: 0,
        });
      });
    });

    it('returns correct response for existing relationship', async () => {
      mockFetch(EXISTING_RELATIONSHIP_RESPONSE_MOCK);

      const result = await getAccountAddressRelationship(
        FIRST_TIME_REQUEST_MOCK,
      );

      expect(result).toStrictEqual(EXISTING_RELATIONSHIP_RESPONSE_MOCK);
    });

    describe('throws FirstTimeInteractionError', () => {
      it('for unsupported chains', async () => {
        const request = {
          chainId: CHAIN_ID_UNSUPPORTED,
          from: FROM_ADDRESS,
          to: TO_ADDRESS,
        };

        await expect(getAccountAddressRelationship(request)).rejects.toThrow(
          FirstTimeInteractionError,
        );
      });

      it('on error response', async () => {
        mockFetch({
          error: { code: 'error_code', message: 'Some error' },
        });

        await expect(
          getAccountAddressRelationship(FIRST_TIME_REQUEST_MOCK),
        ).rejects.toThrow(FirstTimeInteractionError);
      });
    });
  });

  describe('getAccountTransactions', () => {
    it('queries the accounts API with the correct parameters', async () => {
      mockFetch(ACCOUNT_RESPONSE_MOCK);

      const response = await getAccountTransactions({
        address: ADDRESS_MOCK,
        chainIds: CHAIN_IDS_MOCK,
        cursor: CURSOR_MOCK,
        endTimestamp: END_TIMESTAMP_MOCK,
        startTimestamp: START_TIMESTAMP_MOCK,
        sortDirection: SORT_DIRECTION_MOCK,
      });

      expect(response).toStrictEqual(ACCOUNT_RESPONSE_MOCK);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://accounts.api.cx.metamask.io/v1/accounts/${ADDRESS_MOCK}/transactions?networks=${CHAIN_IDS_MOCK[0]},${CHAIN_IDS_MOCK[1]}&startTimestamp=${START_TIMESTAMP_MOCK}&endTimestamp=${END_TIMESTAMP_MOCK}&cursor=${CURSOR_MOCK}&sortDirection=${SORT_DIRECTION_MOCK}`,
        expect.any(Object),
      );
    });
  });
});
