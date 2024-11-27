import { FirstTimeInteractionError } from '../errors';
import { getAccountAddressRelationship } from './accounts-api';
import type { GetAccountAddressRelationshipRequest } from './accounts-api';

describe('Accounts API', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;
  /**
   * Mock a JSON response from fetch.
   * @param jsonResponse - The response body to return.
   * @param status - The status code to return.
   */
  function mockFetchResponse(jsonResponse: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue(jsonResponse),
      status,
    } as unknown as Response);
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
      typeof fetch
    >;
  });

  describe('getAccountAddressRelationship', () => {
    const CHAIN_ID_SUPPORTED = 1;
    const CHAIN_ID_UNSUPPORTED = 999;
    const FROM_ADDRESS = '0xSender';
    const TO_ADDRESS = '0xRecipient';

    const REQUEST_MOCK: GetAccountAddressRelationshipRequest = {
      chainId: CHAIN_ID_SUPPORTED,
      from: FROM_ADDRESS,
      to: TO_ADDRESS,
    };

    const EXISTING_RELATIONSHIP_RESPONSE_MOCK = {
      count: 1,
    };

    describe('returns API response', () => {
      it('for 204 responses', async () => {
        mockFetchResponse({}, 204);

        const result = await getAccountAddressRelationship(REQUEST_MOCK);

        expect(result).toStrictEqual({
          count: 0,
        });
      });

      it('when there is no existing relationship', async () => {
        mockFetchResponse({ count: 0 });

        const result = await getAccountAddressRelationship(REQUEST_MOCK);

        expect(result).toStrictEqual({
          count: 0,
        });
      });
    });

    it('returns correct response for existing relationship', async () => {
      mockFetchResponse(EXISTING_RELATIONSHIP_RESPONSE_MOCK);

      const result = await getAccountAddressRelationship(REQUEST_MOCK);

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
        mockFetchResponse({
          error: { code: 'error_code', message: 'Some error' },
        });

        await expect(
          getAccountAddressRelationship(REQUEST_MOCK),
        ).rejects.toThrow(FirstTimeInteractionError);
      });
    });
  });
});
