import type { FeatureFlags } from '../../utils/feature-flags';
import { getFeatureFlags } from '../../utils/feature-flags';
import { RELAY_STATUS_URL } from './constants';
import {
  fetchRelayQuote,
  getRelayStatus,
  submitRelayExecute,
} from './relay-api';
import type { RelayQuoteRequest } from './types';

jest.mock('../../utils/feature-flags');

const getFeatureFlagsMock = jest.mocked(getFeatureFlags);

let fetchMock: jest.SpyInstance;

const mockOkResponse = (body: unknown): jest.SpyInstance =>
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  } as Response);

const mockErrorResponse = (status: number, body: unknown): jest.SpyInstance =>
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  } as Response);

const QUOTE_URL_MOCK = 'https://proxy.test/relay/quote';
const EXECUTE_URL_MOCK = 'https://proxy.test/relay/execute';

const MESSENGER_MOCK = {} as Parameters<typeof fetchRelayQuote>[0];

describe('relay-api', () => {
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');

    getFeatureFlagsMock.mockReturnValue({
      relayQuoteUrl: QUOTE_URL_MOCK,
      relayExecuteUrl: EXECUTE_URL_MOCK,
    } as FeatureFlags);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('fetchRelayQuote', () => {
    const QUOTE_REQUEST_MOCK: RelayQuoteRequest = {
      amount: '1000000',
      destinationChainId: 1,
      destinationCurrency: '0xaaa',
      originChainId: 137,
      originCurrency: '0xbbb',
      recipient: '0xccc',
      tradeType: 'EXPECTED_OUTPUT',
      user: '0xccc',
    };

    const QUOTE_RESPONSE_MOCK = {
      details: { currencyIn: {}, currencyOut: {} },
      steps: [],
    };

    it('posts to the quote URL from feature flags', async () => {
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      await fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(QUOTE_URL_MOCK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(QUOTE_REQUEST_MOCK),
      });
    });

    it('attaches the request body to the returned quote', async () => {
      mockOkResponse({ ...QUOTE_RESPONSE_MOCK });

      const quote = await fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(quote.request).toStrictEqual(QUOTE_REQUEST_MOCK);
    });

    it('returns the parsed quote', async () => {
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      const quote = await fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(quote.details).toStrictEqual(QUOTE_RESPONSE_MOCK.details);
    });

    it('forwards the abort signal to the underlying fetch', async () => {
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      const controller = new AbortController();
      await fetchRelayQuote(
        MESSENGER_MOCK,
        QUOTE_REQUEST_MOCK,
        controller.signal,
      );

      expect(fetchMock).toHaveBeenCalledWith(
        QUOTE_URL_MOCK,
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('throws an error containing status code and the response body message field on non-OK', async () => {
      mockErrorResponse(422, { message: 'Insufficient liquidity' });

      await expect(
        fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK),
      ).rejects.toThrow('422 - Insufficient liquidity');
    });

    it('falls back to the response body error field when message is absent', async () => {
      mockErrorResponse(429, { error: 'rate limit exceeded' });

      await expect(
        fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK),
      ).rejects.toThrow('429 - rate limit exceeded');
    });

    it('falls back to the status code only when the body has neither message nor error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      } as Response);

      await expect(
        fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK),
      ).rejects.toThrow('500');
    });
  });

  describe('submitRelayExecute', () => {
    const EXECUTE_REQUEST_MOCK = {
      executionKind: 'rawCalls' as const,
      data: {
        chainId: 1,
        to: '0xaaa' as `0x${string}`,
        data: '0xbbb' as `0x${string}`,
        value: '0',
      },
      executionOptions: { subsidizeFees: false },
      requestId: '0xreq',
    };

    const EXECUTE_RESPONSE_MOCK = {
      message: 'Transaction submitted',
      requestId: '0xreq',
    };

    it('posts to the execute URL from feature flags', async () => {
      mockOkResponse(EXECUTE_RESPONSE_MOCK);

      await submitRelayExecute(MESSENGER_MOCK, EXECUTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(EXECUTE_URL_MOCK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(EXECUTE_REQUEST_MOCK),
      });
    });

    it('returns the parsed response', async () => {
      mockOkResponse(EXECUTE_RESPONSE_MOCK);

      const result = await submitRelayExecute(
        MESSENGER_MOCK,
        EXECUTE_REQUEST_MOCK,
      );

      expect(result).toStrictEqual(EXECUTE_RESPONSE_MOCK);
    });
  });

  describe('getRelayStatus', () => {
    const REQUEST_ID_MOCK = '0xabc123';

    const STATUS_RESPONSE_MOCK = {
      status: 'success',
      txHashes: [{ txHash: '0xhash', chainId: 1 }],
    };

    it('fetches the status URL with the request ID', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getRelayStatus(REQUEST_ID_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
        { method: 'GET' },
      );
    });

    it('returns the parsed status', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      const result = await getRelayStatus(REQUEST_ID_MOCK);

      expect(result).toStrictEqual(STATUS_RESPONSE_MOCK);
    });
  });
});
