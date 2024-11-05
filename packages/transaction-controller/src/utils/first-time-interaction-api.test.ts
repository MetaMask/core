import { FirstTimeInteractionError } from '../errors';
import type {
  FirstTimeInteractionRequest,
  FirstTimeInteractionResponse,
} from './first-time-interaction-api';
import { getFirstTimeInteraction } from './first-time-interaction-api';

describe('FirstTimeInteraction API Utils', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  /**
   * Mock a JSON response from fetch.
   * @param jsonResponse - The response body to return.
   */
  function mockFetchResponse(jsonResponse: unknown) {
    fetchMock.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue(jsonResponse),
    } as unknown as Response);
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
      typeof fetch
    >;
    fetchMock.mockClear();
  });

  describe('getFirstTimeInteraction', () => {
    const requestMock: FirstTimeInteractionRequest = {
      chainId: '0x1',
      from: '0xFromAddress',
      to: '0xToAddress',
    };

    it('returns isFirstTimeInteraction as true when count is 0', async () => {
      mockFetchResponse({ count: 0 });

      const response: FirstTimeInteractionResponse =
        await getFirstTimeInteraction(requestMock);

      expect(response.isFirstTimeInteraction).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns isFirstTimeInteraction as true when count is undefined', async () => {
      mockFetchResponse({});

      const response: FirstTimeInteractionResponse =
        await getFirstTimeInteraction(requestMock);

      expect(response.isFirstTimeInteraction).toBe(true);
    });

    it('returns isFirstTimeInteraction as false when count is greater than 0', async () => {
      mockFetchResponse({ count: 5 });

      const response: FirstTimeInteractionResponse =
        await getFirstTimeInteraction(requestMock);

      expect(response.isFirstTimeInteraction).toBe(false);
    });

    it('throws FirstTimeInteractionError when API returns an error other than FAILED_TO_PARSE_MESSAGE', async () => {
      const errorResponse = {
        error: { message: 'Some other error', code: 500 },
      };
      mockFetchResponse(errorResponse);

      await expect(getFirstTimeInteraction(requestMock)).rejects.toThrow(
        FirstTimeInteractionError,
      );
    });

    it('returns isFirstTimeInteraction as true when API returns FAILED_TO_PARSE_MESSAGE', async () => {
      const errorResponse = {
        error: {
          message: 'Failed to parse account address relationship.',
          code: 400,
        },
      };
      mockFetchResponse(errorResponse);

      const response: FirstTimeInteractionResponse =
        await getFirstTimeInteraction(requestMock);

      expect(response.isFirstTimeInteraction).toBe(true);
    });

    it('sends request to correct URL', async () => {
      mockFetchResponse({ count: 1 });

      const { chainId, from, to } = requestMock;

      await getFirstTimeInteraction(requestMock);

      // The values are not undefined
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const expectedUrl = `https://accounts.api.cx.metamask.io//v1/networks/${chainId}/accounts/${from}/relationships/${to}`;
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, { method: 'GET' });
    });
  });
});
