import { successfulFetch } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_POLYGON,
  RELAY_URL_QUOTE,
} from './constants';
import { getRelayQuotes } from './relay-quotes';
import type { RelayQuote } from './types';
import { NATIVE_TOKEN_ADDRESS } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type { QuoteRequest } from '../../types';
import { calculateGasCost, calculateTransactionGasCost } from '../../utils/gas';
import { getNativeToken, getTokenFiatRate } from '../../utils/token';

jest.mock('../../utils/token');
jest.mock('../../utils/gas');

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

const QUOTE_MOCK = {
  details: {
    currencyIn: {
      amountUsd: '2.34',
    },
    currencyOut: {
      amountFormatted: '1.0',
      amountUsd: '1.23',
      currency: {
        decimals: 2,
      },
      minimumAmount: '125',
    },
    timeEstimate: 300,
  },
  fees: {
    gas: {
      amountUsd: '3.45',
    },
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
} as RelayQuote;

const TRANSACTION_META_MOCK = {} as TransactionMeta;

describe('Relay Quotes Utils', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const calculateTransactionGasCostMock = jest.mocked(
    calculateTransactionGasCost,
  );
  const calculateGasCostMock = jest.mocked(calculateGasCost);
  const getNativeTokenMock = jest.mocked(getNativeToken);
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '2.0',
      fiatRate: '4.0',
    });

    calculateTransactionGasCostMock.mockReturnValue({
      usd: '1.23',
      fiat: '2.34',
    });

    calculateGasCostMock.mockReturnValue({
      usd: '3.45',
      fiat: '4.56',
    });

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      cacheTimestamp: 0,
      remoteFeatureFlags: {},
    });
  });

  describe('getRelayQuotes', () => {
    it('returns quotes from Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
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
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
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

    it('sends request to url from feature flag', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const relayQuoteUrl = 'https://test.com/quote';

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        cacheTimestamp: 0,
        remoteFeatureFlags: {
          confirmation_pay: {
            relayQuoteUrl,
          },
        },
      });

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        relayQuoteUrl,
        expect.anything(),
      );
    });

    it('ignores requests with no target minimum', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, targetAmountMinimum: '0' }],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).not.toHaveBeenCalled();
    });

    it('includes duration in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].estimatedDuration).toBe(300);
    });

    it('includes provider fee in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '1.11',
        fiat: '2.22',
      });
    });

    it('includes dust in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].dust).toStrictEqual({
        usd: '0.0246',
        fiat: '0.0492',
      });
    });

    it('includes source network fee in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork).toStrictEqual({
        usd: '3.45',
        fiat: '4.56',
      });
    });

    it('includes target network fee in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.targetNetwork).toStrictEqual({
        usd: '1.23',
        fiat: '2.34',
      });
    });

    it('throws if fetching quote fails', async () => {
      successfulFetchMock.mockRejectedValue(new Error('Fetch error'));

      await expect(
        getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow('Fetch error');
    });

    it('throws if source token fiat rate is unavailable', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await expect(
        getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow(`Source token fiat rate not found`);
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
        messenger,
        requests: [arbitrumToHyperliquidRequest],
        transaction: TRANSACTION_META_MOCK,
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

    it('updates request if source is polygon native', async () => {
      getNativeTokenMock.mockReturnValue(
        '0x0000000000000000000000000000000000001010',
      );

      const polygonToHyperliquidRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        sourceChainId: CHAIN_ID_POLYGON,
        sourceTokenAddress: '0x0000000000000000000000000000000000001010',
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [polygonToHyperliquidRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          originCurrency: NATIVE_TOKEN_ADDRESS,
        }),
      );
    });
  });
});
