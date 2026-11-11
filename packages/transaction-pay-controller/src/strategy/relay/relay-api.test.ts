import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { TransactionPayClientId } from '../../constants.js';
import type { FeatureFlags } from '../../utils/feature-flags.js';
import { getFeatureFlags } from '../../utils/feature-flags.js';
import { TradeType } from '../../utils/trade-type.js';
import { RELAY_STATUS_URL, RELAY_TRANSACTIONS_INDEX_URL } from './constants.js';
import {
  RelayApiError,
  fetchRelayQuote,
  fetchRelaySolanaQuote,
  getRelayStatus,
  notifyRelayTransaction,
  submitRelayExecute,
} from './relay-api.js';
import type {
  RelayExecuteRequest,
  RelayQuoteRequest,
  RelaySolanaQuoteRequest,
} from './types.js';

vi.mock(import('../../utils/feature-flags.js'));

const getFeatureFlagsMock = vi.mocked(getFeatureFlags);

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

const QUOTE_URL_MOCK = 'https://proxy.test/relay/quote';
const EXECUTE_URL_MOCK = 'https://proxy.test/relay/execute';

let callMock: MockInstance;
let MESSENGER_MOCK: Parameters<typeof fetchRelayQuote>[0];

describe('relay-api', () => {
  beforeEach(() => {
    fetchMock = vi.spyOn(global, 'fetch');

    callMock = vi.fn().mockReturnValue(undefined);

    MESSENGER_MOCK = {
      call: callMock,
    } as unknown as Parameters<typeof fetchRelayQuote>[0];

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

    it('includes the client ID header when the controller provides one', async () => {
      callMock.mockReturnValue(TransactionPayClientId.Extension);
      mockOkResponse(QUOTE_RESPONSE_MOCK);

      await fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:getClientId',
      );

      expect(fetchMock).toHaveBeenCalledWith(
        QUOTE_URL_MOCK,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': 'extension',
          },
        }),
      );
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
      });

      await expect(
        fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK),
      ).rejects.toThrow('500');
    });
  });

  describe('fetchRelaySolanaQuote', () => {
    const SOLANA_QUOTE_REQUEST_MOCK: RelaySolanaQuoteRequest = {
      amount: '1000000',
      destinationChainId: 42161,
      destinationCurrency: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      originChainId: 792703809,
      originCurrency: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      recipient: '0x1234567890123456789012345678901234567890',
      refundTo: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
      tradeType: 'EXACT_INPUT',
      user: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
    };

    it('posts the Solana request to the configured Relay quote URL', async () => {
      mockOkResponse({ requestId: 'relay-request-123', steps: [] });

      const quote = await fetchRelaySolanaQuote(
        MESSENGER_MOCK,
        SOLANA_QUOTE_REQUEST_MOCK,
      );

      expect(fetchMock).toHaveBeenCalledWith(QUOTE_URL_MOCK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SOLANA_QUOTE_REQUEST_MOCK),
        signal: undefined,
      });
      expect(quote.request).toStrictEqual(SOLANA_QUOTE_REQUEST_MOCK);
    });

    it('throws a RelayApiError carrying the Relay errorCode on non-OK', async () => {
      mockErrorResponse(400, {
        message: 'no routes found',
        errorCode: 'NO_SWAP_ROUTES_FOUND',
        requestId: '0x1234',
      });

      const error = await fetchRelaySolanaQuote(
        MESSENGER_MOCK,
        SOLANA_QUOTE_REQUEST_MOCK,
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RelayApiError);
      expect(error).toHaveProperty('message', '400 - no routes found');
      expect(error).toHaveProperty('errorCode', 'NO_SWAP_ROUTES_FOUND');
    });

    it('throws a RelayApiError without errorCode when the body has none', async () => {
      mockErrorResponse(500, { message: 'Internal' });

      const error = await fetchRelaySolanaQuote(
        MESSENGER_MOCK,
        SOLANA_QUOTE_REQUEST_MOCK,
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RelayApiError);
      expect(error).toHaveProperty('errorCode', undefined);
    });
  });

  describe('notifyRelayTransaction', () => {
    it('posts stable request and source transaction correlation', async () => {
      mockOkResponse({});
      const request = {
        chainId: '792703809',
        requestId: 'relay-request-123',
        txHash: 'solana-signature-123',
      };

      await notifyRelayTransaction(MESSENGER_MOCK, request);

      expect(fetchMock).toHaveBeenCalledWith(RELAY_TRANSACTIONS_INDEX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    });
  });

  describe('submitRelayExecute', () => {
    const EXECUTE_REQUEST_MOCK: RelayExecuteRequest = {
      executionKind: 'rawCalls',
      data: {
        chainId: 1,
        to: '0xaaa',
        data: '0xbbb',
        value: '0',
      },
      executionOptions: { subsidizeFees: false },
      requestId: '0xreq',
      metamask: {
        isSubsidized: false,
        quoteRequest: {
          amount: '1000000',
          destinationChainId: 1,
          destinationCurrency: '0xaaa',
          originChainId: 137,
          originCurrency: '0xbbb',
          recipient: '0xccc',
          tradeType: TradeType.ExactOutput,
          user: '0xccc',
        },
        signature: '0xsignature',
      },
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

    it('includes the client ID header when the controller provides one', async () => {
      callMock.mockReturnValue(TransactionPayClientId.Extension);
      mockOkResponse(EXECUTE_RESPONSE_MOCK);

      await submitRelayExecute(MESSENGER_MOCK, EXECUTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        EXECUTE_URL_MOCK,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': 'extension',
          },
        }),
      );
    });

    it('omits the client ID header when none is configured', async () => {
      mockOkResponse(EXECUTE_RESPONSE_MOCK);

      await submitRelayExecute(MESSENGER_MOCK, EXECUTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(EXECUTE_URL_MOCK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(EXECUTE_REQUEST_MOCK),
      });
    });

    it('still sends the request when the client ID lookup throws', async () => {
      callMock.mockImplementation(() => {
        throw new Error('no handler registered');
      });
      mockOkResponse(EXECUTE_RESPONSE_MOCK);

      await submitRelayExecute(MESSENGER_MOCK, EXECUTE_REQUEST_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(EXECUTE_URL_MOCK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(EXECUTE_REQUEST_MOCK),
      });
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

      await getRelayStatus(MESSENGER_MOCK, REQUEST_ID_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
        { method: 'GET' },
      );
    });

    it('returns the parsed status', async () => {
      mockOkResponse(STATUS_RESPONSE_MOCK);

      const result = await getRelayStatus(MESSENGER_MOCK, REQUEST_ID_MOCK);

      expect(result).toStrictEqual(STATUS_RESPONSE_MOCK);
    });

    it('includes the client ID header when the controller provides one', async () => {
      callMock.mockReturnValue(TransactionPayClientId.Mobile);
      mockOkResponse(STATUS_RESPONSE_MOCK);

      await getRelayStatus(MESSENGER_MOCK, REQUEST_ID_MOCK);

      expect(fetchMock).toHaveBeenCalledWith(
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
        expect.objectContaining({
          headers: { 'X-Client-Id': 'mobile' },
        }),
      );
    });
  });
});
