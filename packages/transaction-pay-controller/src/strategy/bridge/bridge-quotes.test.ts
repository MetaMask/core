import { Messenger } from '@metamask/base-controller';
import type {
  BridgeController,
  QuoteResponse,
} from '@metamask/bridge-controller';

import { getBridgeQuotes } from './bridge-quotes';
import type { AllowedActions } from '../../types';
import {
  type QuoteRequest,
  type TransactionPayControllerMessenger,
} from '../../types';
import { getTokenFiatRate } from '../../utils/token';

jest.mock('../../utils/token');

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
} as unknown as QuoteResponse;

const QUOTE_2_MOCK = {
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

describe('Bridge Quotes Utils', () => {
  let bridgeControllerMock: jest.Mocked<BridgeController>;
  let messengerMock: TransactionPayControllerMessenger;
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getFeatureFlagsMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    const baseMessenger = new Messenger<AllowedActions, never>();

    bridgeControllerMock = {
      fetchQuotes: jest.fn(),
    } as unknown as jest.Mocked<BridgeController>;

    bridgeControllerMock.fetchQuotes
      .mockResolvedValueOnce([QUOTE_1_MOCK])
      .mockResolvedValueOnce([QUOTE_2_MOCK]);

    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '3',
    });

    baseMessenger.registerActionHandler(
      'BridgeController:fetchQuotes',
      bridgeControllerMock.fetchQuotes,
    );

    baseMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      () => ({
        cacheTimestamp: 0,
        remoteFeatureFlags: {
          confirmation_pay: getFeatureFlagsMock(),
        },
      }),
    );

    getFeatureFlagsMock.mockReturnValue(FEATURE_FLAGS_MOCK);

    messengerMock =
      baseMessenger as unknown as TransactionPayControllerMessenger;
  });

  describe('getBridgeQuotes', () => {
    it('returns quotes', async () => {
      const quotesPromise = getBridgeQuotes(
        [QUOTE_REQUEST_1_MOCK, QUOTE_REQUEST_2_MOCK],
        messengerMock,
      );

      const quotes = await quotesPromise;

      expect(quotes.map((q) => q.original)).toStrictEqual([
        expect.objectContaining(QUOTE_1_MOCK),
        expect.objectContaining(QUOTE_2_MOCK),
      ]);
    });

    it('requests quotes', async () => {
      await getBridgeQuotes(
        [QUOTE_REQUEST_1_MOCK, QUOTE_REQUEST_2_MOCK],
        messengerMock,
      );

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledWith(
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
      );

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledWith(
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
      );
    });

    it('throws if no quotes', async () => {
      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes.mockResolvedValue([]);

      await expect(
        getBridgeQuotes(
          [QUOTE_REQUEST_1_MOCK, QUOTE_REQUEST_2_MOCK],
          messengerMock,
        ),
      ).rejects.toThrow('No quotes found');
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes.mockResolvedValue(QUOTES);

      const quotes = await getBridgeQuotes(
        [QUOTE_REQUEST_1_MOCK],
        messengerMock,
      );

      expect(quotes.map((q) => q.original)).toStrictEqual([
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes.mockResolvedValue(QUOTES);

      await expect(
        getBridgeQuotes([QUOTE_REQUEST_1_MOCK], messengerMock),
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 2,
      });

      const quotes = await getBridgeQuotes(
        [{ ...QUOTE_REQUEST_1_MOCK }],
        messengerMock,
      );

      expect(quotes.map((q) => q.original)).toStrictEqual([
        expect.objectContaining(QUOTES_ATTEMPT_2[0]),
      ]);

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledTimes(2);
      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
      );
      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1500000000000000000',
        }),
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_3);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      await expect(
        getBridgeQuotes([{ ...QUOTE_REQUEST_1_MOCK }], messengerMock),
      ).rejects.toThrow('All quotes under minimum');

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledTimes(3);
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      await expect(
        getBridgeQuotes(
          [
            {
              ...QUOTE_REQUEST_1_MOCK,
              sourceBalanceRaw: '1500000000000000000',
            },
          ],
          messengerMock,
        ),
      ).rejects.toThrow('All quotes under minimum');

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledTimes(2);
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      const quotes = await getBridgeQuotes(
        [
          {
            ...QUOTE_REQUEST_1_MOCK,
            sourceBalanceRaw: '1400000000000000000',
          },
        ],
        messengerMock,
      );

      expect(quotes.map((q) => q.original)).toStrictEqual([
        expect.objectContaining(QUOTES_ATTEMPT_2[0]),
      ]);

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledTimes(2);
      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
      );
      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledWith(
        expect.objectContaining({
          srcTokenAmount: '1400000000000000000',
        }),
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      await expect(
        getBridgeQuotes(
          [
            {
              ...QUOTE_REQUEST_1_MOCK,
            },
            {
              ...QUOTE_REQUEST_2_MOCK,
            },
          ],
          messengerMock,
        ),
      ).rejects.toThrow('All quotes under minimum');

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledTimes(2);

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
      );

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
        }),
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

      bridgeControllerMock.fetchQuotes.mockReset();
      bridgeControllerMock.fetchQuotes
        .mockResolvedValueOnce(QUOTES_ATTEMPT_1)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_2)
        .mockResolvedValueOnce(QUOTES_ATTEMPT_3);

      getFeatureFlagsMock.mockReturnValue({
        ...FEATURE_FLAGS_MOCK,
        attemptsMax: 3,
      });

      const quotes = await getBridgeQuotes(
        [
          {
            ...QUOTE_REQUEST_1_MOCK,
            sourceBalanceRaw: '2400000000000000000',
          },
          QUOTE_REQUEST_2_MOCK,
        ],
        messengerMock,
      );

      expect(quotes.map((q) => q.original)).toStrictEqual([
        expect.objectContaining(QUOTES_ATTEMPT_2[0]),
        expect.objectContaining(QUOTES_ATTEMPT_3[0]),
      ]);

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenCalledTimes(3);

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
          destTokenAddress: QUOTE_REQUEST_1_MOCK.targetTokenAddress,
        }),
      );

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          srcTokenAmount: '1000000000000000000',
          destTokenAddress: QUOTE_REQUEST_2_MOCK.targetTokenAddress,
        }),
      );

      expect(bridgeControllerMock.fetchQuotes).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          srcTokenAmount: '1400000000000000000',
          destTokenAddress: QUOTE_REQUEST_1_MOCK.targetTokenAddress,
        }),
      );
    });

    it('returns normalized quote', async () => {
      const quotes = await getBridgeQuotes(
        [QUOTE_REQUEST_1_MOCK],
        messengerMock,
      );

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
  });
});
