import type { PayStrategiesConfig } from '../../utils/feature-flags.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import {
  fetchServerQuote,
  getServerStatus,
  submitServerIntent,
} from './server-api.js';
import { ServerProviderName, ServerStatus, ServerTradeType } from './types.js';
import type { ServerQuoteRequest, ServerSubmitRequest } from './types.js';

jest.mock('../../utils/feature-flags');

const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);

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

const BASE_URL_MOCK = 'https://proxy.test/server';

const MESSENGER_MOCK = {} as Parameters<typeof fetchServerQuote>[0];

describe('server-api', () => {
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');

    getPayStrategiesConfigMock.mockReturnValue({
      server: {
        enabled: true,
        baseUrl: BASE_URL_MOCK,
        pollingInterval: 1000,
      },
    } as PayStrategiesConfig);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('fetchServerQuote', () => {
    const QUOTE_REQUEST_MOCK: ServerQuoteRequest = {
      source: { chainId: 137, token: '0xbbb' },
      target: { chainId: 1, token: '0xaaa' },
      amount: '1000000',
      tradeType: ServerTradeType.ExpectedOutput,
      sender: '0xccc',
      recipient: '0xccc',
    };

    const QUOTE_RESPONSE_MOCK = {
      results: [
        {
          provider: ServerProviderName.Relay,
          quote: {
            id: '0xid',
            input: {
              chainId: 137,
              decimals: 6,
              formatted: '1.0',
              raw: '1000000',
              token: '0xbbb',
            },
            output: {
              chainId: 1,
              decimals: 6,
              formatted: '0.999',
              raw: '999000',
              token: '0xaaa',
            },
            fees: { metamask: '0', provider: '0.10', subsidized: false },
            duration: 30,
            steps: [],
            gasless: false,
          },
        },
      ],
    };

    it('posts to the quote URL from feature flags', async () => {
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      await fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL_MOCK}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(QUOTE_REQUEST_MOCK),
      });
    });

    it('returns the parsed response', async () => {
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      const result = await fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(result).toStrictEqual(QUOTE_RESPONSE_MOCK);
    });

    it('forwards the abort signal to the underlying fetch', async () => {
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      const controller = new AbortController();
      await fetchServerQuote(
        MESSENGER_MOCK,
        QUOTE_REQUEST_MOCK,
        controller.signal,
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/quote`,
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('throws an error containing status code and the response body message field on non-OK', async () => {
      mockErrorResponse(422, { message: 'Insufficient liquidity' });

      await expect(
        fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK),
      ).rejects.toThrow('422 - Insufficient liquidity');
    });

    it('falls back to the response body error field when message is absent', async () => {
      mockErrorResponse(429, { error: 'rate limit exceeded' });

      await expect(
        fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK),
      ).rejects.toThrow('429 - rate limit exceeded');
    });

    it('falls back to the status code only when the body is not JSON', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response);

      await expect(
        fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK),
      ).rejects.toThrow('500');
    });
  });

  describe('submitServerIntent', () => {
    const SUBMIT_REQUEST_MOCK: ServerSubmitRequest = {
      chainId: 1,
      data: '0xbbb',
      id: '0xid',
      provider: ServerProviderName.Relay,
      to: '0xaaa',
      value: '0',
    };

    const SUBMIT_RESPONSE_MOCK = {
      success: true,
    };

    it('posts to the submit URL from feature flags', async () => {
      mockOkResponse(SUBMIT_RESPONSE_MOCK);

      await submitServerIntent(MESSENGER_MOCK, SUBMIT_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL_MOCK}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SUBMIT_REQUEST_MOCK),
      });
    });

    it('returns the parsed response', async () => {
      mockOkResponse(SUBMIT_RESPONSE_MOCK);

      const result = await submitServerIntent(
        MESSENGER_MOCK,
        SUBMIT_REQUEST_MOCK,
      );

      expect(result).toStrictEqual(SUBMIT_RESPONSE_MOCK);
    });
  });

  describe('getServerStatus', () => {
    const STATUS_PARAMS_MOCK = {
      provider: ServerProviderName.Relay,
      id: '0xabc',
    };

    const STATUS_RESPONSE_MOCK = {
      status: ServerStatus.Confirmed,
      sourceHash: '0xsource' as const,
      targetHash: '0xtarget' as const,
    };

    it('gets the status URL with provider and id query parameters', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getServerStatus(MESSENGER_MOCK, STATUS_PARAMS_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/status?provider=relay&id=0xabc`,
        { method: 'GET' },
      );
    });

    it('appends hash to the status URL when provided', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getServerStatus(MESSENGER_MOCK, {
        ...STATUS_PARAMS_MOCK,
        hash: '0xdeadbeef',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/status?provider=relay&id=0xabc&hash=0xdeadbeef`,
        { method: 'GET' },
      );
    });

    it('returns the parsed response', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      const result = await getServerStatus(MESSENGER_MOCK, STATUS_PARAMS_MOCK);

      expect(result).toStrictEqual(STATUS_RESPONSE_MOCK);
    });
  });
});
