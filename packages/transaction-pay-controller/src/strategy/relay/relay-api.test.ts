import { successfulFetch } from '@metamask/controller-utils';

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

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const successfulFetchMock = jest.mocked(successfulFetch);
const getFeatureFlagsMock = jest.mocked(getFeatureFlags);

const QUOTE_URL_MOCK = 'https://proxy.test/relay/quote';
const EXECUTE_URL_MOCK = 'https://proxy.test/relay/execute';

const MESSENGER_MOCK = {} as Parameters<typeof fetchRelayQuote>[0];

describe('relay-api', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    getFeatureFlagsMock.mockReturnValue({
      relayQuoteUrl: QUOTE_URL_MOCK,
      relayExecuteUrl: EXECUTE_URL_MOCK,
    } as FeatureFlags);
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
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_RESPONSE_MOCK,
      } as Response);

      await fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(successfulFetchMock).toHaveBeenCalledWith(QUOTE_URL_MOCK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(QUOTE_REQUEST_MOCK),
      });
    });

    it('attaches the request body to the returned quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({ ...QUOTE_RESPONSE_MOCK }),
      } as Response);

      const quote = await fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(quote.request).toStrictEqual(QUOTE_REQUEST_MOCK);
    });

    it('returns the parsed quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_RESPONSE_MOCK,
      } as Response);

      const quote = await fetchRelayQuote(MESSENGER_MOCK, QUOTE_REQUEST_MOCK);

      expect(quote.details).toStrictEqual(QUOTE_RESPONSE_MOCK.details);
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
      successfulFetchMock.mockResolvedValue({
        json: async () => EXECUTE_RESPONSE_MOCK,
      } as Response);

      await submitRelayExecute(MESSENGER_MOCK, EXECUTE_REQUEST_MOCK);

      expect(successfulFetchMock).toHaveBeenCalledWith(EXECUTE_URL_MOCK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(EXECUTE_REQUEST_MOCK),
      });
    });

    it('returns the parsed response', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => EXECUTE_RESPONSE_MOCK,
      } as Response);

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
      successfulFetchMock.mockResolvedValue({
        json: async () => STATUS_RESPONSE_MOCK,
      } as Response);

      await getRelayStatus(REQUEST_ID_MOCK);

      expect(successfulFetchMock).toHaveBeenCalledWith(
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
        { method: 'GET' },
      );
    });

    it('returns the parsed status', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => STATUS_RESPONSE_MOCK,
      } as Response);

      const result = await getRelayStatus(REQUEST_ID_MOCK);

      expect(result).toStrictEqual(STATUS_RESPONSE_MOCK);
    });
  });
});
