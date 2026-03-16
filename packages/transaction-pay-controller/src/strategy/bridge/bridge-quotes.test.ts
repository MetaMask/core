import { FeatureId } from '@metamask/bridge-controller';
import type { QuoteResponse } from '@metamask/bridge-controller';
import type { TxData } from '@metamask/bridge-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import {
  getBridgeBatchTransactions,
  getBridgeQuotes,
  getBridgeRefreshInterval,
  refreshQuote,
} from './bridge-quotes';
import type { TransactionPayBridgeQuote } from './types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import type { QuoteRequest } from '../../types';
import { calculateGasCost, calculateTransactionGasCost } from '../../utils/gas';
import { getTokenFiatRate } from '../../utils/token';

jest.mock('../../utils/token');
jest.mock('../../utils/gas');

jest.useFakeTimers();

const QUOTE_REQUEST_1_MOCK: QuoteRequest = {
  from: '0x123',
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0xdef',
};

const QUOTE_REQUEST_2_MOCK: QuoteRequest = {
  ...QUOTE_REQUEST_1_MOCK,
  targetTokenAddress: '0x456',
};

const QUOTE_1_MOCK = {
  estimatedProcessingTimeInSeconds: 40,
  quote: {
    destAsset: {
      address: QUOTE_REQUEST_1_MOCK.targetTokenAddress,
      decimals: 1,
    },
    destChainId: 1,
    minDestTokenAmount: '124',
    srcAsset: {
      address: QUOTE_REQUEST_1_MOCK.sourceTokenAddress,
      decimals: 3,
    },
    srcChainId: QUOTE_REQUEST_1_MOCK.sourceChainId,
  },
  trade: {
    chainId: 1,
  },
} as unknown as QuoteResponse;

const QUOTE_2_MOCK = {
  ...QUOTE_1_MOCK,
  quote: {
    ...QUOTE_1_MOCK.quote,
    destAsset: {
      ...QUOTE_1_MOCK.quote.destAsset,
      address: QUOTE_REQUEST_2_MOCK.targetTokenAddress,
    },
  },
} as unknown as QuoteResponse;

const FEATURE_FLAGS_MOCK = {
  attemptsMax: 1,
  bufferInitial: 1,
  bufferStep: 1,
  bufferSubsequent: 2,
  slippage: 0.005,
};

const ORIGINAL_QUOTE_MOCK = {
  quote: {
    srcChainId: 1,
    destChainId: 1,
  },
  trade: {
    chainId: 1,
    data: '0x1234' as const,
    gasLimit: 21000,
    to: '0xabcd' as const,
    value: '0x4567' as const,
  },
};

const TRANSACTION_META_MOCK = {} as TransactionMeta;

describe('Bridge Quotes Utils', () => {
  let request: PayStrategyGetQuotesRequest;

  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getFeatureFlagsMock = jest.fn();
  const calculateGasCostMock = jest.mocked(calculateGasCost);
  const calculateTransactionGasCostMock = jest.mocked(
    calculateTransactionGasCost,
  );

  const {
    messenger,
    fetchQuotesMock,
    getRemoteFeatureFlagControllerStateMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    fetchQuotesMock
      .mockResolvedValueOnce([QUOTE_1_MOCK])
      .mockResolvedValueOnce([QUOTE_2_MOCK]);

    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '3',
    });

    getRemoteFeatureFlagControllerStateMock.mockImplementation(() => ({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: getFeatureFlagsMock(),
      },
    }));

    getFeatureFlagsMock.mockReturnValue(FEATURE_FLAGS_MOCK);

    calculateGasCostMock.mockReturnValue({
      fiat: '0.1',
      human: '0.051',
      raw: '51000000000000',
      usd: '0.2',
    });

    request = {
      requests: [QUOTE_REQUEST_1_MOCK, QUOTE_REQUEST_2_MOCK],
      messenger,
      transaction: TRANSACTION_META_MOCK,
    };
  });

  describe('getBridgeQuotes', () => {
    it('returns quotes', async () => {
      const quotes = await getBridgeQuotes(request);

      expect(quotes.map((quote) => quote.original)).toStrictEqual([
        expect.objectContaining(QUOTE_1_MOCK),
        expect.objectContaining(QUOTE_2_MOCK),
      ]);
    });

    it('returns quote metrics', async () => {
      const quotes = await getBridgeQuotes(request);

      expect(quotes[0].original.metrics).toStrictEqual({
        attempts: 1,
        buffer: 1,
        latency: expect.any(Number),
      });
    });

    it('requests quotes', async () => {
      await getBridgeQuotes(request);

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: QUOTE_REQUEST_1_MOCK.from,
          srcChainId: QUOTE_REQUEST_1_MOCK.sourceChainId,
          srcTokenAddress: QUOTE_REQUEST_1_MOCK.sourceTokenAddress,
          srcTokenAmount: QUOTE_REQUEST_1_MOCK.sourceTokenAmount,
          destChainId: QUOTE_REQUEST_1_MOCK.targetChainId,
          destTokenAddress: QUOTE_REQUEST_1_MOCK.targetTokenAddress,
          slippage: 0.5,
          insufficientBal: false,
        }),
        undefined,
        undefined,
      );

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: QUOTE_REQUEST_2_MOCK.from,
          srcChainId: QUOTE_REQUEST_2_MOCK.sourceChainId,
          srcTokenAddress: QUOTE_REQUEST_2_MOCK.sourceTokenAddress,
          srcTokenAmount: QUOTE_REQUEST_2_MOCK.sourceTokenAmount,
          destChainId: QUOTE_REQUEST_2_MOCK.targetChainId,
          destTokenAddress: QUOTE_REQUEST_2_MOCK.targetTokenAddress,
          slippage: 0.5,
          insufficientBal: false,
        }),
        undefined,
        undefined,
      );
    });

    it('throws if no quotes', async () => {
      fetchQuotesMock.mockReset();
      fetchQuotesMock.mockResolvedValue([]);

      await expect(getBridgeQuotes(request)).rejects.toThrow('No quotes found');
    });

    it('selects cheapest quote of 3 fastest quotes', async () => {
      const QUOTES = [
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '129',
          },
        },
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 10,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '126',
          },
        },
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 20,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '128',
          },
        },
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 30,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '127',
          },
        },
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 50,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '130',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock.mockResolvedValue(QUOTES);

      const quotes = await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
      });

      expect(quotes.map((quote) => quote.original)).toStrictEqual([
        expect.objectContaining(QUOTES[2]),
      ]);
    });

    it('throws if all fastest quotes have token amount less than minimum', async () => {
      const QUOTES = [
        {
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            minDestTokenAmount: '124',
          },
        },
        {
          estimatedProcessingTimeInSeconds: 10,
          cost: { valueInCurrency: '1.5' },
          quote: {
            minDestTokenAmount: '122',
          },
        },
        {
          estimatedProcessingTimeInSeconds: 20,
          cost: { valueInCurrency: '1' },
          quote: {
            minDestTokenAmount: '122',
          },
        },
        {
          estimatedProcessingTimeInSeconds: 30,
          cost: { valueInCurrency: '2' },
          quote: {
            minDestTokenAmount: '122',
          },
        },
        {
          estimatedProcessingTimeInSeconds: 50,
          cost: { valueInCurrency: '0.9' },
          quote: {
            minDestTokenAmount: '124',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock.mockResolvedValue(QUOTES);

      await expect(
        getBridgeQuotes({
          ...request,
          requests: [QUOTE_REQUEST_1_MOCK],
        }),
      ).rejects.toThrow('All quotes under minimum');
    });

    it('increases source amount until target amount minimum reached', async () => {
      const QUOTES_ATTEMPT_1 = [
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '122',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_2 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '124',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 2,
      });

      const quotes = await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
      });

      expect(quotes.map((quote) => quote.original)).toStrictEqual([
        expect.objectContaining(QUOTES_ATTEMPT_2[0]),
      ]);

      expect(fetchQuotesMock).toHaveBeenCalledTimes(2);

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
        undefined,
        undefined,
      );

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1500000000000000000',
        }),
        undefined,
        undefined,
      );
    });

    it('throws if target amount minimum not reached after max attempts', async () => {
      const QUOTES_ATTEMPT_1 = [
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '120',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_2 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '121',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_3 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '122',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_3);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      await expect(
        getBridgeQuotes({
          ...request,
          requests: [QUOTE_REQUEST_1_MOCK],
        }),
      ).rejects.toThrow('All quotes under minimum');

      expect(fetchQuotesMock).toHaveBeenCalledTimes(3);
    });

    it('throws if target amount minimum not reached and at balance limit', async () => {
      const QUOTES_ATTEMPT_1 = [
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '120',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_2 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '121',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      await expect(
        getBridgeQuotes({
          ...request,
          requests: [
            {
              ...QUOTE_REQUEST_1_MOCK,
              sourceBalanceRaw: '1500000000000000000',
            },
          ],
        }),
      ).rejects.toThrow('All quotes under minimum');

      expect(fetchQuotesMock).toHaveBeenCalledTimes(2);
    });

    it('uses balance as source token amount if next amount greater than balance', async () => {
      const QUOTES_ATTEMPT_1 = [
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '120',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_2 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '123',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      const quotes = await getBridgeQuotes({
        ...request,
        requests: [
          {
            ...QUOTE_REQUEST_1_MOCK,
            sourceBalanceRaw: '1400000000000000000',
          },
        ],
      });

      expect(quotes.map((quote) => quote.original)).toStrictEqual([
        expect.objectContaining(QUOTES_ATTEMPT_2[0]),
      ]);

      expect(fetchQuotesMock).toHaveBeenCalledTimes(2);
      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
        undefined,
        undefined,
      );

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1400000000000000000',
        }),
        undefined,
        undefined,
      );
    });

    it('does not increase source amount if not first request', async () => {
      const QUOTES_ATTEMPT_1 = [
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '123',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_2 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '122',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      await expect(
        getBridgeQuotes({
          ...request,
          requests: [
            {
              ...QUOTE_REQUEST_1_MOCK,
            },
            {
              ...QUOTE_REQUEST_2_MOCK,
            },
          ],
        }),
      ).rejects.toThrow('All quotes under minimum');

      expect(fetchQuotesMock).toHaveBeenCalledTimes(2);

      expect(fetchQuotesMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
        undefined,
        undefined,
      );

      expect(fetchQuotesMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
        undefined,
        undefined,
      );
    });

    it('limits increased source amount to balance minus source amount of subsequent requests', async () => {
      const QUOTES_ATTEMPT_1 = [
        {
          ...QUOTE_1_MOCK,
          estimatedProcessingTimeInSeconds: 40,
          quote: {
            ...QUOTE_1_MOCK.quote,
            minDestTokenAmount: '122',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_2 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '123',
          },
        },
      ] as QuoteResponse[];

      const QUOTES_ATTEMPT_3 = [
        {
          ...QUOTES_ATTEMPT_1[0],
          quote: {
            ...QUOTES_ATTEMPT_1[0].quote,
            minDestTokenAmount: '123',
          },
        },
      ] as QuoteResponse[];

      fetchQuotesMock.mockReset();
      fetchQuotesMock
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_3);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      const quotes = await getBridgeQuotes({
        ...request,
        requests: [
          {
            ...QUOTE_REQUEST_1_MOCK,
            sourceBalanceRaw: '2400000000000000000',
          },
          QUOTE_REQUEST_2_MOCK,
        ],
      });

      expect(quotes.map((quote) => quote.original)).toStrictEqual([
        expect.objectContaining(QUOTES_ATTEMPT_2[0]),
        expect.objectContaining(QUOTES_ATTEMPT_3[0]),
      ]);

      expect(fetchQuotesMock).toHaveBeenCalledTimes(3);

      expect(fetchQuotesMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
          destTokenAddress: QUOTE_REQUEST_1_MOCK.targetTokenAddress,
        }),
        undefined,
        undefined,
      );

      expect(fetchQuotesMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
          destTokenAddress: QUOTE_REQUEST_2_MOCK.targetTokenAddress,
        }),
        undefined,
        undefined,
      );

      expect(fetchQuotesMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          srcTokenAmount: '1400000000000000000',
          destTokenAddress: QUOTE_REQUEST_1_MOCK.targetTokenAddress,
        }),
        undefined,
        undefined,
      );
    });

    it('returns normalized quote', async () => {
      const quotes = await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
      });

      expect(quotes[0]).toMatchObject({
        dust: {
          fiat: '0.2',
          usd: '0.3',
        },
        estimatedDuration: 40,
        original: QUOTE_1_MOCK,
        request: QUOTE_REQUEST_1_MOCK,
      });
    });

    it('returns target amount in quote', async () => {
      const quotes = await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
      });

      expect(quotes[0].targetAmount).toStrictEqual({
        fiat: '24.6',
        usd: '36.9',
      });
    });

    it('returns zero metaMask fee in quote', async () => {
      const quotes = await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
      });

      expect(quotes[0].fees.metaMask).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('returns target network fee in quote', async () => {
      calculateTransactionGasCostMock.mockReturnValue({
        fiat: '1.23',
        human: '0.000123',
        raw: '123000000000000',
        usd: '2.34',
      });

      const quotes = await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
      });

      expect(quotes[0].fees).toMatchObject({
        targetNetwork: {
          fiat: '1.23',
          usd: '2.34',
        },
      });
    });

    describe('returns source network fee in quote', () => {
      it('for trade only', async () => {
        calculateGasCostMock.mockReturnValue({
          fiat: '1.23',
          human: '0.000123',
          raw: '123000000000000',
          usd: '2.34',
        });

        fetchQuotesMock.mockReset();
        fetchQuotesMock.mockResolvedValue([
          {
            ...QUOTE_1_MOCK,
            trade: {
              ...(QUOTE_1_MOCK.trade as TxData),
              gasLimit: 21000,
            },
          } as unknown as QuoteResponse,
        ]);

        const quotes = await getBridgeQuotes({
          ...request,
          requests: [QUOTE_REQUEST_1_MOCK],
        });

        expect(quotes[0].fees).toMatchObject({
          sourceNetwork: {
            estimate: { fiat: '1.23', usd: '2.34' },
          },
        });
      });

      it('for trade and approval', async () => {
        calculateGasCostMock.mockReturnValue({
          fiat: '1.23',
          human: '0.000123',
          raw: '123000000000000',
          usd: '2.34',
        });

        fetchQuotesMock.mockReset();
        fetchQuotesMock.mockResolvedValue([
          {
            ...QUOTE_1_MOCK,
            approval: {
              ...(QUOTE_1_MOCK.trade as TxData),
              gasLimit: 21000,
            },
            trade: {
              ...(QUOTE_1_MOCK.trade as TxData),
              gasLimit: 21000,
            },
          } as unknown as QuoteResponse,
        ]);

        const quotes = await getBridgeQuotes({
          ...request,
          requests: [QUOTE_REQUEST_1_MOCK],
        });

        expect(quotes[0].fees).toMatchObject({
          sourceNetwork: {
            estimate: {
              fiat: '2.46',
              usd: '4.68',
            },
          },
        });
      });
    });

    it('throws if missing fiat source rate', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      await expect(
        getBridgeQuotes({
          ...request,
          requests: [QUOTE_REQUEST_1_MOCK],
        }),
      ).rejects.toThrow(
        `Failed to fetch bridge quotes: Error: Fiat rate not found for source token - Chain ID: 0x1, Address: 0xabc`,
      );
    });

    it('throws if missing fiat target rate', async () => {
      getTokenFiatRateMock
        .mockReturnValueOnce({ usdRate: '3', fiatRate: '2' })
        .mockReturnValueOnce(undefined);

      await expect(
        getBridgeQuotes({
          ...request,
          requests: [QUOTE_REQUEST_1_MOCK],
        }),
      ).rejects.toThrow(
        `Failed to fetch bridge quotes: Error: Fiat rate not found for target token - Chain ID: 0x2, Address: 0xdef`,
      );
    });

    it('uses defaults if no feature flags', async () => {
      getFeatureFlagsMock.mockReturnValue(undefined);

      const quotes = await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
      });

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          slippage: 0.5,
        }),
        undefined,
        undefined,
      );

      expect(quotes.map((quote) => quote.original)).toStrictEqual([
        expect.objectContaining(QUOTE_1_MOCK),
      ]);
    });

    it('includes feature ID in request if perps deposit', async () => {
      await getBridgeQuotes({
        ...request,
        requests: [QUOTE_REQUEST_1_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.perpsDeposit,
        },
      });

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        FeatureId.PERPS,
      );
    });
  });

  describe('getBridgeBatchTransactions', () => {
    it('returns batch for trade transaction', async () => {
      const batchTransactions = await getBridgeBatchTransactions({
        quotes: [
          {
            original: ORIGINAL_QUOTE_MOCK,
          },
        ],
      } as PayStrategyGetBatchRequest<TransactionPayBridgeQuote>);

      expect(batchTransactions).toStrictEqual([
        {
          data: '0x1234',
          gas: '0x5208',
          isAfter: false,
          to: '0xabcd',
          type: TransactionType.swap,
          value: '0x4567',
        },
      ]);
    });

    it('returns batch for approve transaction', async () => {
      const batchTransactions = await getBridgeBatchTransactions({
        quotes: [
          {
            original: {
              ...ORIGINAL_QUOTE_MOCK,
              approval: ORIGINAL_QUOTE_MOCK.trade,
            },
          },
        ],
      } as PayStrategyGetBatchRequest<TransactionPayBridgeQuote>);

      expect(batchTransactions).toStrictEqual([
        {
          data: '0x1234',
          gas: '0x5208',
          isAfter: false,
          to: '0xabcd',
          type: TransactionType.swapApproval,
          value: '0x4567',
        },
        {
          data: '0x1234',
          gas: '0x5208',
          isAfter: false,
          to: '0xabcd',
          type: TransactionType.swap,
          value: '0x4567',
        },
      ]);
    });

    it('returns empty array if source and destination chains are different', async () => {
      const batchTransactions = await getBridgeBatchTransactions({
        quotes: [
          {
            original: {
              ...ORIGINAL_QUOTE_MOCK,
              quote: {
                ...ORIGINAL_QUOTE_MOCK.quote,
                srcChainId: 1,
                destChainId: 2,
              },
            },
          },
        ],
      } as PayStrategyGetBatchRequest<TransactionPayBridgeQuote>);

      expect(batchTransactions).toStrictEqual([]);
    });

    it('handles missing gas in trade transaction', async () => {
      const batchTransactions = await getBridgeBatchTransactions({
        quotes: [
          {
            original: {
              ...ORIGINAL_QUOTE_MOCK,
              trade: {
                ...ORIGINAL_QUOTE_MOCK.trade,
                gasLimit: null,
              },
            },
          },
        ],
      } as PayStrategyGetBatchRequest<TransactionPayBridgeQuote>);

      expect(batchTransactions).toStrictEqual([
        {
          data: '0x1234',
          gas: undefined,
          isAfter: false,
          to: '0xabcd',
          type: TransactionType.swap,
          value: '0x4567',
        },
      ]);
    });
  });

  describe('refreshQuote', () => {
    it('fetches a new quote based on an existing one', async () => {
      fetchQuotesMock.mockReset();
      fetchQuotesMock.mockResolvedValue([QUOTE_2_MOCK]);

      const newQuote = await refreshQuote(
        {
          original: { ...QUOTE_2_MOCK, request: QUOTE_REQUEST_2_MOCK },
        } as TransactionPayQuote<TransactionPayBridgeQuote>,
        messenger,
        TRANSACTION_META_MOCK,
      );

      expect(fetchQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: QUOTE_REQUEST_2_MOCK.from,
          srcChainId: QUOTE_REQUEST_2_MOCK.sourceChainId,
          srcTokenAddress: QUOTE_REQUEST_2_MOCK.sourceTokenAddress,
          srcTokenAmount: QUOTE_REQUEST_2_MOCK.sourceTokenAmount,
          destChainId: QUOTE_REQUEST_2_MOCK.targetChainId,
          destTokenAddress: QUOTE_REQUEST_2_MOCK.targetTokenAddress,
          insufficientBal: false,
        }),
        undefined,
        undefined,
      );

      expect(newQuote).toMatchObject(QUOTE_2_MOCK);
    });
  });

  describe('getBridgeRefreshInterval', () => {
    it('returns chain interval from feature flags', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          bridgeConfigV2: {
            chains: {
              '1': {
                refreshRate: 123000,
              },
            },
          },
        },
      });

      const result = getBridgeRefreshInterval({
        chainId: '0x1',
        messenger,
      });

      expect(result).toBe(123000);
    });

    it('returns global interval from feature flags', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          bridgeConfigV2: {
            chains: {
              '2': {
                refreshRate: 123000,
              },
            },
            refreshRate: 456000,
          },
        },
      });

      const result = getBridgeRefreshInterval({
        chainId: '0x1',
        messenger,
      });

      expect(result).toBe(456000);
    });

    it('returns undefined if no chain or global interval', () => {
      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          bridgeConfigV2: {
            chains: {
              '2': {
                refreshRate: 123000,
              },
            },
          },
        },
      });

      const result = getBridgeRefreshInterval({
        chainId: '0x1',
        messenger,
      });

      expect(result).toBeUndefined();
    });
  });
});
