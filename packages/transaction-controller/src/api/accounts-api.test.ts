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

    const RESPONSE_ERROR_MOCK = {
      error: 'Some error',
    };

    const EXISTING_RELATIONSHIP_RESPONSE_MOCK = {
      count: 1,
    };

    const NO_COUNT_RESPONSE_MOCK = {};

    describe('returns isFirstTimeInteraction as true', () => {
      it('for 204 responses', async () => {
        mockFetchResponse({}, 204);

        const result = await getAccountAddressRelationship(REQUEST_MOCK);

        expect(result).toStrictEqual({
          isFirstTimeInteraction: true,
          isFirstTimeInteractionDisabled: false,
        });
      });

      it('when there is no existing relationship', async () => {
        mockFetchResponse({ count: 0 });

        const result = await getAccountAddressRelationship(REQUEST_MOCK);

        expect(result).toStrictEqual({
          isFirstTimeInteraction: true,
          isFirstTimeInteractionDisabled: false,
        });
      });
    });

    it('returns isFirstTimeInteraction as false for existing relationship', async () => {
      mockFetchResponse(EXISTING_RELATIONSHIP_RESPONSE_MOCK);

      const result = await getAccountAddressRelationship(REQUEST_MOCK);

      expect(result).toStrictEqual({
        isFirstTimeInteraction: false,
        isFirstTimeInteractionDisabled: false,
      });
    });

    describe('returns isFirstTimeInteractionDisabled as true', () => {
      it('for unsupported chains', async () => {
        const request = {
          chainId: CHAIN_ID_UNSUPPORTED,
          from: FROM_ADDRESS,
          to: TO_ADDRESS,
        };
        const result = await getAccountAddressRelationship(request);

        expect(result).toStrictEqual({
          isFirstTimeInteraction: undefined,
          isFirstTimeInteractionDisabled: true,
        });
      });

      it('if no count property in response', async () => {
        mockFetchResponse(NO_COUNT_RESPONSE_MOCK);

        const result = await getAccountAddressRelationship(REQUEST_MOCK);

        expect(result).toStrictEqual({
          isFirstTimeInteraction: undefined,
          isFirstTimeInteractionDisabled: true,
        });
      });

      it('on error', async () => {
        mockFetchResponse(RESPONSE_ERROR_MOCK);

        const result = await getAccountAddressRelationship(REQUEST_MOCK);

        expect(result).toStrictEqual({
          isFirstTimeInteraction: undefined,
          isFirstTimeInteractionDisabled: true,
        });
      });
    });
  });
});
