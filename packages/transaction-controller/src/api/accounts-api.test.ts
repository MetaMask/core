import { successfulFetch } from '@metamask/controller-utils';

import { FirstTimeInteractionError } from '../errors';
import type { GetAccountAddressRelationshipRequest } from './accounts-api';
import { getAccountAddressRelationship } from './accounts-api';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const CHAIN_ID_SUPPORTED = 1;
const CHAIN_ID_UNSUPPORTED = 123456789;
const FROM_ADDRESS = '0xSender';
const TO_ADDRESS = '0xRecipient';
const FIRST_TIME_REQUEST_MOCK: GetAccountAddressRelationshipRequest = {
  chainId: CHAIN_ID_SUPPORTED,
  from: FROM_ADDRESS,
  to: TO_ADDRESS,
};

describe('Accounts API', () => {
  /**
   * Mock the fetch function to return the given response JSON.
   *
   * @param responseJson - The response JSON.
   * @param status - The status code.
   * @returns The fetch mock.
   */
  function mockFetch(
    responseJson: Record<string, unknown>,
    status = 200,
  ): jest.MockedFunction<typeof successfulFetch> {
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
});
