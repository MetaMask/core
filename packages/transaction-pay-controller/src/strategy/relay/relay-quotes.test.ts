import { successfulFetch } from '@metamask/controller-utils';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  RELAY_URL_QUOTE,
} from './constants';
import { getRelayQuotes } from './relay-quotes';
import type { RelayQuote } from './types';
import type { QuoteRequest } from '../../types';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: '0x123',
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0xdef',
};

const QUOTE_MOCK: RelayQuote = {
  details: {
    currencyIn: {
      amountUsd: '2.34',
    },
    currencyOut: {
      amountUsd: '1.23',
    },
    timeEstimate: 300,
  },
  steps: [
    {
      items: [
        {
          check: {
            endpoint: '/test',
            method: 'GET',
          },
          data: {
            chainId: 1,
            data: '0x123',
            from: '0x1',
            gas: '21000',
            maxFeePerGas: '1000000000',
            maxPriorityFeePerGas: '2000000000',
            to: '0x2',
            value: '300000',
          },
          status: 'complete',
        },
      ],
      kind: 'transaction',
    },
  ],
};

describe('Relay Quotes Utils', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getRelayQuotes', () => {
    it('returns quotes from Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger: {} as never,
        requests: [QUOTE_REQUEST_MOCK],
      });

      expect(result).toStrictEqual([
        expect.objectContaining({
          original: QUOTE_MOCK,
        }),
      ]);
    });

    it('sends request to Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger: {} as never,
        requests: [QUOTE_REQUEST_MOCK],
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        RELAY_URL_QUOTE,
        expect.objectContaining({
          body: JSON.stringify({
            amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
            destinationChainId: 2,
            destinationCurrency: QUOTE_REQUEST_MOCK.targetTokenAddress,
            originChainId: 1,
            originCurrency: QUOTE_REQUEST_MOCK.sourceTokenAddress,
            recipient: QUOTE_REQUEST_MOCK.from,
            tradeType: 'EXPECTED_OUTPUT',
            user: QUOTE_REQUEST_MOCK.from,
          }),
        }),
      );
    });

    it('normalizes quotes', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger: {} as never,
        requests: [QUOTE_REQUEST_MOCK],
      });

      expect(result[0]).toStrictEqual(
        expect.objectContaining({
          estimatedDuration: 300,
          fees: expect.objectContaining({
            provider: {
              usd: '1.11',
              fiat: '1.11',
            },
          }),
        }),
      );
    });

    it('throws if fetching quote fails', async () => {
      successfulFetchMock.mockRejectedValue(new Error('Fetch error'));

      await expect(
        getRelayQuotes({
          messenger: {} as never,
          requests: [QUOTE_REQUEST_MOCK],
        }),
      ).rejects.toThrow('Fetch error');
    });

    it('updates request if Arbitrum deposit to Hyperliquid', async () => {
      const arbitrumToHyperliquidRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        targetChainId: CHAIN_ID_ARBITRUM,
        targetTokenAddress: ARBITRUM_USDC_ADDRESS,
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger: {} as never,
        requests: [arbitrumToHyperliquidRequest],
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          amount: '12300',
          destinationChainId: 1337,
          destinationCurrency: '0x00000000000000000000000000000000',
        }),
      );
    });
  });
});
