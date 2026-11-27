import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { TransactionPayClientId } from '../../constants.js';
import type { PayStrategiesConfig } from '../../utils/feature-flags.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { TradeType } from '../../utils/trade-type.js';
import {
  fetchServerQuote,
  getServerStatus,
  ServerApiError,
  submitServerIntent,
} from './server-api.js';
import { ServerStatus } from './types.js';
import type { ServerQuoteRequest, ServerSubmitRequest } from './types.js';

vi.mock(import('../../utils/feature-flags.js'));

const getPayStrategiesConfigMock = vi.mocked(getPayStrategiesConfig);

let fetchMock: MockInstance;

const mockOkResponse = (body: unknown): MockInstance =>
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });

const mockErrorResponse = (status: number, body: unknown): MockInstance =>
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  });

const BASE_URL_MOCK = 'https://proxy.test/server';

let callMock: MockInstance;
let MESSENGER_MOCK: Parameters<typeof fetchServerQuote>[0];

describe('server-api', () => {
  beforeEach(() => {
    fetchMock = vi.spyOn(global, 'fetch');

    callMock = vi.fn().mockReturnValue(undefined);

    MESSENGER_MOCK = {
      call: callMock,
    } as unknown as Parameters<typeof fetchServerQuote>[0];

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
      sourceAsset: 'eip155:137/erc20:0xbbb',
      targetAsset: 'eip155:1/erc20:0xaaa',
      amount: '1000000',
      tradeType: TradeType.ExpectedOutput,
      sender: '0xccc',
      recipient: '0xccc',
    };

    const QUOTE_RESPONSE_MOCK = {
      results: [
        {
          provider: 'relay',
          quote: {
            id: '0xid',
            input: {
              asset: 'eip155:137/erc20:0xbbb',
              decimals: 6,
              formatted: '1.0',
              raw: '1000000',
            },
            output: {
              asset: 'eip155:1/erc20:0xaaa',
              decimals: 6,
              formatted: '0.999',
              raw: '999000',
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

    it('includes the client ID header when the controller provides one', async () => {
      callMock.mockReturnValue(TransactionPayClientId.Mobile);
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      await fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:getClientId',
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/quote`,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': 'mobile',
          },
        }),
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
      });

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
      provider: 'relay',
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

    it('includes the client ID header when the controller provides one', async () => {
      callMock.mockReturnValue(TransactionPayClientId.Extension);
      mockOkResponse(SUBMIT_RESPONSE_MOCK);

      await submitServerIntent(MESSENGER_MOCK, SUBMIT_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/submit`,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': 'extension',
          },
        }),
      );
    });
  });

  describe('getServerStatus', () => {
    const STATUS_PARAMS_MOCK = {
      provider: 'relay',
      id: '0xabc',
    };

    const STATUS_RESPONSE_MOCK = {
      status: ServerStatus.Confirmed,
      sourceHash: '0xsource' as const,
      targetHash: '0xtarget' as const,
    };

    it('posts provider and id to the status URL', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getServerStatus(MESSENGER_MOCK, STATUS_PARAMS_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL_MOCK}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'relay', id: '0xabc' }),
      });
    });

    it('includes hash and logs in the body when provided', async () => {
      const logs = [
        {
          address: '0x1234' as const,
          data: '0xdata' as const,
          topics: ['0xtopic1' as const, '0xtopic2' as const],
        },
      ];

      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getServerStatus(MESSENGER_MOCK, {
        ...STATUS_PARAMS_MOCK,
        hash: '0xdeadbeef',
        logs,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL_MOCK}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'relay',
          id: '0xabc',
          hash: '0xdeadbeef',
          logs,
        }),
      });
    });

    it('includes elapsedMs in the body when provided', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getServerStatus(MESSENGER_MOCK, {
        ...STATUS_PARAMS_MOCK,
        elapsedMs: 0,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL_MOCK}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'relay', id: '0xabc', elapsedMs: 0 }),
      });
    });

    it('throws a ServerApiError with the response status on non-OK', async () => {
      mockErrorResponse(400, { message: 'Missing logs' });

      const error = await getServerStatus(
        MESSENGER_MOCK,
        STATUS_PARAMS_MOCK,
      ).catch((caughtError: unknown) => caughtError);

      expect(error).toBeInstanceOf(ServerApiError);
      expect(error).toMatchObject({
        message: '400 - Missing logs',
        name: 'ServerApiError',
        status: 400,
      });
    });

    it('returns the parsed response', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      const result = await getServerStatus(MESSENGER_MOCK, STATUS_PARAMS_MOCK);

      expect(result).toStrictEqual(STATUS_RESPONSE_MOCK);
    });

    it('includes the client ID header when the controller provides one', async () => {
      callMock.mockReturnValue(TransactionPayClientId.Mobile);
      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getServerStatus(MESSENGER_MOCK, STATUS_PARAMS_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/status`,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': 'mobile',
          },
        }),
      );
    });
  });

  describe('client ID header', () => {
    const QUOTE_REQUEST_MOCK = {} as ServerQuoteRequest;

    it('omits the header when no client ID is configured', async () => {
      callMock.mockReturnValue(undefined);
      mockOkResponse({});

      await fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/quote`,
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('still sends the request when retrieving the client ID throws', async () => {
      callMock.mockImplementation(() => {
        throw new Error('handler not registered');
      });
      mockOkResponse({});

      await fetchServerQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL_MOCK}/quote`,
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });
});
