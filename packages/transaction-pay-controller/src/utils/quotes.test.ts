import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { BatchTransaction } from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import type { UpdateQuotesRequest } from './quotes';
import { refreshQuotes, updateQuotes } from './quotes';
import { getStrategy, getStrategyByName } from './strategy';
import { getLiveTokenBalance, getTokenFiatRate } from './token';
import { calculateTotals } from './totals';
import { getTransaction, updateTransaction } from './transaction';
import { getMessengerMock } from '../tests/messenger-mock';
import type {
  TransactionPaySourceAmount,
  TransactionData,
  TransactionPayQuote,
  TransactionPayTotals,
  TransactionPaymentToken,
  TransactionPayRequiredToken,
} from '../types';

jest.mock('./strategy');
jest.mock('./transaction');
jest.mock('./totals');
jest.mock('./token', () => ({
  ...jest.createMockFromModule<typeof import('./token')>('./token'),
  computeTokenAmounts:
    jest.requireActual<typeof import('./token')>('./token').computeTokenAmounts,
}));

jest.useFakeTimers();

const TRANSACTION_ID_MOCK = '123-456';

const TRANSACTION_DATA_MOCK: TransactionData = {
  isLoading: false,
  paymentToken: {
    address: '0x123' as Hex,
    balanceFiat: '123.45',
    balanceHuman: '1.23',
    balanceRaw: '2000000000000000000',
    balanceUsd: '234.56',
    chainId: '0x123',
    decimals: 6,
    symbol: 'ETH',
  } as TransactionPaymentToken,
  sourceAmounts: [
    {
      sourceAmountRaw: '1000000000000000000',
    } as TransactionPaySourceAmount,
  ],
  tokens: [{} as TransactionPayRequiredToken],
};

const TRANSACTION_META_MOCK = {
  id: TRANSACTION_ID_MOCK,
  status: TransactionStatus.unapproved,
  txParams: { from: '0xabc' as Hex },
} as TransactionMeta;

const QUOTE_MOCK = {
  dust: {
    usd: '1.23',
    fiat: '2.34',
  },
} as TransactionPayQuote<Json>;

const TOTALS_MOCK = {
  fees: {
    provider: {
      fiat: '7.89',
      usd: '8.90',
    },
    sourceNetwork: {
      estimate: {
        fiat: '9.01',
        usd: '1.12',
      },
    },
  },
  targetAmount: {
    fiat: '5.67',
    usd: '6.78',
  },
  total: {
    fiat: '1.23',
    usd: '4.56',
  },
} as TransactionPayTotals;

const BATCH_TRANSACTION_MOCK = {
  to: '0xdef' as Hex,
} as BatchTransaction;

describe('Quotes Utils', () => {
  const { messenger, getControllerStateMock } = getMessengerMock();
  const updateTransactionDataMock = jest.fn();
  const getStrategyMock = jest.mocked(getStrategy);
  const getStrategyByNameMock = jest.mocked(getStrategyByName);
  const getTransactionMock = jest.mocked(getTransaction);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const calculateTotalsMock = jest.mocked(calculateTotals);
  const getLiveTokenBalanceMock = jest.mocked(getLiveTokenBalance);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getQuotesMock = jest.fn();
  const getBatchTransactionsMock = jest.fn();

  /**
   * Run the updateQuotes function.
   *
   * @param params - Partial params to override the defaults.
   * @returns Return value from updateQuotes.
   */
  async function run(params?: Partial<UpdateQuotesRequest>): Promise<boolean> {
    return await updateQuotes({
      messenger,
      transactionData: cloneDeep(TRANSACTION_DATA_MOCK),
      transactionId: TRANSACTION_ID_MOCK,
      updateTransactionData: updateTransactionDataMock,
      ...params,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();

    getStrategyMock.mockReturnValue({
      execute: jest.fn(),
      getQuotes: getQuotesMock,
      getBatchTransactions: getBatchTransactionsMock,
    });

    getStrategyByNameMock.mockReturnValue({
      execute: jest.fn(),
      getQuotes: getQuotesMock,
      getBatchTransactions: getBatchTransactionsMock,
    });

    getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
    getQuotesMock.mockResolvedValue([QUOTE_MOCK]);
    getBatchTransactionsMock.mockResolvedValue([BATCH_TRANSACTION_MOCK]);
    calculateTotalsMock.mockReturnValue(TOTALS_MOCK);

    getLiveTokenBalanceMock.mockResolvedValue('5000000');
    getTokenFiatRateMock.mockReturnValue({
      usdRate: '1.0',
      fiatRate: '0.85',
    });
  });

  describe('updateQuotes', () => {
    it('updates quotes in state', async () => {
      await run();

      const transactionDataMock = {};

      updateTransactionDataMock.mock.calls.map((call) =>
        call[1](transactionDataMock),
      );

      expect(transactionDataMock).toMatchObject({
        quotes: [QUOTE_MOCK],
      });
    });

    it('clears quotes in state if no source amounts', async () => {
      await run({
        transactionData: {
          ...TRANSACTION_DATA_MOCK,
          sourceAmounts: undefined,
        },
      });

      const transactionDataMock = {
        quotes: [QUOTE_MOCK],
      };

      updateTransactionDataMock.mock.calls.map((call) =>
        call[1](transactionDataMock),
      );

      expect(transactionDataMock).toMatchObject({
        quotes: [],
      });
    });

    it('throws if no transaction', async () => {
      getTransactionMock.mockReturnValue(undefined);

      await expect(run()).rejects.toThrow('Transaction not found');
    });

    it('clears quotes in state if strategy throws', async () => {
      getQuotesMock.mockRejectedValue(new Error('Strategy error'));

      await run();

      const transactionDataMock = {
        quotes: [QUOTE_MOCK],
      };

      updateTransactionDataMock.mock.calls.map((call) =>
        call[1](transactionDataMock),
      );

      expect(transactionDataMock).toMatchObject({
        quotes: [],
      });
    });

    it('clears state if no payment token', async () => {
      await run({
        transactionData: {
          ...TRANSACTION_DATA_MOCK,
          paymentToken: undefined,
        },
      });

      const transactionDataMock = {
        quotes: [QUOTE_MOCK],
        quotesLastUpdated: undefined,
      };

      updateTransactionDataMock.mock.calls.map((call) =>
        call[1](transactionDataMock),
      );

      expect(transactionDataMock).toMatchObject({
        quotes: [],
        quotesLastUpdated: expect.any(Number),
      });
    });

    it('gets quotes from strategy', async () => {
      await run();

      expect(getQuotesMock).toHaveBeenCalledWith({
        messenger,
        requests: [
          {
            isMaxAmount: false,
            from: TRANSACTION_META_MOCK.txParams.from,
            sourceBalanceRaw: '5000000',
            sourceTokenAmount:
              TRANSACTION_DATA_MOCK.sourceAmounts?.[0].sourceAmountRaw,
            sourceChainId: TRANSACTION_DATA_MOCK.paymentToken?.chainId,
            sourceTokenAddress: TRANSACTION_DATA_MOCK.paymentToken?.address,
            targetAmountMinimum: TRANSACTION_DATA_MOCK.tokens?.[0].amountRaw,
            targetChainId: TRANSACTION_DATA_MOCK.tokens?.[0].chainId,
            targetTokenAddress: TRANSACTION_DATA_MOCK.tokens?.[0].address,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });
    });

    it('gets quotes with no minimum if allowUnderMinimum is true', async () => {
      await run({
        transactionData: {
          ...TRANSACTION_DATA_MOCK,
          tokens: [
            {
              ...TRANSACTION_DATA_MOCK.tokens?.[0],
              allowUnderMinimum: true,
            } as TransactionPayRequiredToken,
          ],
        },
      });

      expect(getQuotesMock).toHaveBeenCalledWith({
        messenger,
        requests: [
          expect.objectContaining({
            targetAmountMinimum: '0',
          }),
        ],
        transaction: TRANSACTION_META_MOCK,
      });
    });

    it('updates totals in state', async () => {
      await run();

      const transactionDataMock = {};

      updateTransactionDataMock.mock.calls.map((call) =>
        call[1](transactionDataMock),
      );

      expect(transactionDataMock).toStrictEqual(
        expect.objectContaining({ totals: TOTALS_MOCK }),
      );
    });

    it('updates batch transactions', async () => {
      await run();

      const transactionMetaMock = {} as TransactionMeta;
      updateTransactionMock.mock.calls[0][1](transactionMetaMock);

      expect(transactionMetaMock).toMatchObject(
        expect.objectContaining({
          batchTransactions: [BATCH_TRANSACTION_MOCK],
          batchTransactionsOptions: {},
        }),
      );
    });

    it('updates metrics in metadata', async () => {
      await run();

      const transactionMetaMock = {} as TransactionMeta;
      updateTransactionMock.mock.calls[0][1](transactionMetaMock);

      expect(transactionMetaMock).toMatchObject({
        metamaskPay: {
          bridgeFeeFiat: TOTALS_MOCK.fees.provider.usd,
          chainId: TRANSACTION_DATA_MOCK.paymentToken?.chainId,
          networkFeeFiat: TOTALS_MOCK.fees.sourceNetwork.estimate.usd,
          targetFiat: TOTALS_MOCK.targetAmount.usd,
          tokenAddress: TRANSACTION_DATA_MOCK.paymentToken?.address,
          totalFiat: TOTALS_MOCK.total.usd,
        },
      });
    });

    it('does nothing if transaction is not unapproved', async () => {
      getTransactionMock.mockReturnValue({
        ...TRANSACTION_META_MOCK,
        status: TransactionStatus.confirmed,
      });

      const result = await run();

      expect(updateTransactionDataMock).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('refreshes payment token balance with live on-chain balance after quotes update', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('9000000');

      await run();

      expect(getLiveTokenBalanceMock).toHaveBeenCalledWith(
        messenger,
        TRANSACTION_META_MOCK.txParams.from,
        TRANSACTION_DATA_MOCK.paymentToken?.chainId,
        TRANSACTION_DATA_MOCK.paymentToken?.address,
      );

      const transactionDataMock: Record<string, unknown> = {};

      updateTransactionDataMock.mock.calls.forEach(
        (call: [string, (data: Record<string, unknown>) => void]) =>
          call[1](transactionDataMock),
      );

      expect(
        (transactionDataMock.paymentToken as TransactionPaymentToken)
          .balanceRaw,
      ).toBe('9000000');
    });

    it('computes correct balanceHuman, balanceUsd, and balanceFiat from live balance', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('3500000');
      getTokenFiatRateMock.mockReturnValue({
        usdRate: '2.0',
        fiatRate: '1.7',
      });

      await run();

      const transactionDataMock: Record<string, unknown> = {};

      updateTransactionDataMock.mock.calls.forEach(
        (call: [string, (data: Record<string, unknown>) => void]) =>
          call[1](transactionDataMock),
      );

      const updatedToken =
        transactionDataMock.paymentToken as TransactionPaymentToken;

      // decimals = 6, so 3500000 / 10^6 = 3.5
      expect(updatedToken.balanceRaw).toBe('3500000');
      expect(updatedToken.balanceHuman).toBe('3.5');
      expect(updatedToken.balanceUsd).toBe('7');
      expect(updatedToken.balanceFiat).toBe('5.95');
    });

    it('continues with stale balance if live balance fetch fails', async () => {
      getLiveTokenBalanceMock.mockRejectedValue(new Error('RPC timeout'));

      await run();

      const transactionDataMock: Record<string, unknown> = {};

      updateTransactionDataMock.mock.calls.forEach(
        (call: [string, (data: Record<string, unknown>) => void]) =>
          call[1](transactionDataMock),
      );

      // Quotes should still be updated
      expect(transactionDataMock).toMatchObject({
        quotes: [QUOTE_MOCK],
      });

      // paymentToken should NOT be overwritten when balance fetch fails
      expect(transactionDataMock.paymentToken).toBeUndefined();
    });

    it('does not refresh balance if no payment token', async () => {
      await run({
        transactionData: {
          ...TRANSACTION_DATA_MOCK,
          paymentToken: undefined,
        },
      });

      expect(getLiveTokenBalanceMock).not.toHaveBeenCalled();
    });

    it('does not refresh balance if fiat rate unavailable', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      await run();

      const transactionDataMock: Record<string, unknown> = {};

      updateTransactionDataMock.mock.calls.forEach(
        (call: [string, (data: Record<string, unknown>) => void]) =>
          call[1](transactionDataMock),
      );

      // Quotes should still be updated
      expect(transactionDataMock).toMatchObject({
        quotes: [QUOTE_MOCK],
      });

      // paymentToken should NOT be overwritten when fiat rate is unavailable
      expect(transactionDataMock.paymentToken).toBeUndefined();
    });
  });

  describe('refreshQuotes', () => {
    it('updates quotes after refresh interval', async () => {
      getControllerStateMock.mockReturnValue({
        transactionData: {
          [TRANSACTION_ID_MOCK]: {
            isLoading: false,
            paymentToken: TRANSACTION_DATA_MOCK.paymentToken,
            quotes: [QUOTE_MOCK],
            quotesLastUpdated: 1,
          } as TransactionData,
        },
      });

      await refreshQuotes(messenger, updateTransactionDataMock);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(4);

      const transactionDataMock = {};
      updateTransactionDataMock.mock.calls.map((call) =>
        call[1](transactionDataMock),
      );

      expect(transactionDataMock).toMatchObject({
        quotes: [],
      });
    });

    it('updates quotes after refresh interval if no last updated', async () => {
      getControllerStateMock.mockReturnValue({
        transactionData: {
          [TRANSACTION_ID_MOCK]: {
            isLoading: false,
            paymentToken: TRANSACTION_DATA_MOCK.paymentToken,
            quotes: [QUOTE_MOCK],
          } as TransactionData,
        },
      });

      await refreshQuotes(messenger, updateTransactionDataMock);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(4);

      const transactionDataMock = {};
      updateTransactionDataMock.mock.calls.map((call) =>
        call[1](transactionDataMock),
      );

      expect(transactionDataMock).toMatchObject({
        quotes: [],
      });
    });

    it('does nothing if transaction loading', async () => {
      getControllerStateMock.mockReturnValue({
        transactionData: {
          [TRANSACTION_ID_MOCK]: {
            isLoading: true,
            paymentToken: TRANSACTION_DATA_MOCK.paymentToken,
            quotes: [QUOTE_MOCK],
            quotesLastUpdated: 0,
          } as TransactionData,
        },
      });

      await refreshQuotes(messenger, updateTransactionDataMock);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(0);
    });

    it('does nothing if transaction last updated less than refresh interval', async () => {
      getControllerStateMock.mockReturnValue({
        transactionData: {
          [TRANSACTION_ID_MOCK]: {
            isLoading: false,
            paymentToken: TRANSACTION_DATA_MOCK.paymentToken,
            quotes: [QUOTE_MOCK],
            quotesLastUpdated: Date.now(),
          } as TransactionData,
        },
      });

      await refreshQuotes(messenger, updateTransactionDataMock);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(0);
    });
  });

  describe('post-quote (withdrawal) flow', () => {
    const DESTINATION_TOKEN_MOCK: TransactionPaymentToken = {
      address: '0xdef' as Hex,
      balanceFiat: '100.00',
      balanceHuman: '1.00',
      balanceRaw: '1000000000000000000',
      balanceUsd: '100.00',
      chainId: '0x38',
      decimals: 18,
      symbol: 'BNB',
    };

    const SOURCE_TOKEN_MOCK: TransactionPayRequiredToken = {
      address: '0x456' as Hex,
      amountHuman: '10',
      amountRaw: '10000000',
      balanceRaw: '50000000',
      chainId: '0x89' as Hex,
      decimals: 6,
      symbol: 'USDC.e',
      skipIfBalance: false,
    } as TransactionPayRequiredToken;

    const POST_QUOTE_TRANSACTION_DATA: TransactionData = {
      isLoading: false,
      isPostQuote: true,
      paymentToken: DESTINATION_TOKEN_MOCK,
      sourceAmounts: [
        {
          sourceAmountHuman: '10',
          sourceAmountRaw: '10000000',
          sourceBalanceRaw: SOURCE_TOKEN_MOCK.balanceRaw,
          sourceChainId: SOURCE_TOKEN_MOCK.chainId,
          sourceTokenAddress: SOURCE_TOKEN_MOCK.address,
          targetTokenAddress: DESTINATION_TOKEN_MOCK.address,
        } as TransactionPaySourceAmount,
      ],
      tokens: [SOURCE_TOKEN_MOCK],
    };

    it('builds post-quote request with paymentToken as target', async () => {
      await run({
        transactionData: POST_QUOTE_TRANSACTION_DATA,
      });

      expect(getQuotesMock).toHaveBeenCalledWith({
        messenger,
        requests: [
          {
            from: TRANSACTION_META_MOCK.txParams.from,
            isMaxAmount: false,
            isPostQuote: true,
            sourceBalanceRaw: SOURCE_TOKEN_MOCK.balanceRaw,
            sourceChainId: SOURCE_TOKEN_MOCK.chainId,
            sourceTokenAddress: SOURCE_TOKEN_MOCK.address,
            sourceTokenAmount: '10000000',
            targetAmountMinimum: '0',
            targetChainId: DESTINATION_TOKEN_MOCK.chainId,
            targetTokenAddress: DESTINATION_TOKEN_MOCK.address,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });
    });

    it('does not fetch quotes when sourceAmounts is empty (same-token filtered in source-amounts)', async () => {
      const sameTokenData: TransactionData = {
        ...POST_QUOTE_TRANSACTION_DATA,
        // Same-token-same-chain cases are filtered out in source-amounts.ts,
        // so sourceAmounts would be empty
        sourceAmounts: [],
      };

      await run({
        transactionData: sameTokenData,
      });

      // When requests array is empty, getQuotes is not called
      expect(getQuotesMock).not.toHaveBeenCalled();
    });

    it('does not fetch quotes if sourceAmounts missing required fields', async () => {
      const noSourceTokenData: TransactionData = {
        ...POST_QUOTE_TRANSACTION_DATA,
        sourceAmounts: [
          {
            sourceAmountHuman: '10',
            sourceAmountRaw: '10000000',
            // Missing sourceTokenAddress, sourceChainId, sourceBalanceRaw
            targetTokenAddress: DESTINATION_TOKEN_MOCK.address,
          } as TransactionPaySourceAmount,
        ],
      };

      await run({
        transactionData: noSourceTokenData,
      });

      // When sourceAmounts missing required fields, requests array is empty
      expect(getQuotesMock).not.toHaveBeenCalled();
    });

    it('returns empty requests if no paymentToken', async () => {
      const noPaymentTokenData: TransactionData = {
        ...POST_QUOTE_TRANSACTION_DATA,
        paymentToken: undefined,
      };

      await run({
        transactionData: noPaymentTokenData,
      });

      expect(getQuotesMock).not.toHaveBeenCalled();
    });

    it('does not fetch quotes when no matching sourceAmount found', async () => {
      const noMatchingSourceAmountData: TransactionData = {
        ...POST_QUOTE_TRANSACTION_DATA,
        sourceAmounts: [
          {
            sourceAmountRaw: '99999',
            targetTokenAddress: '0xdifferent' as Hex,
          } as TransactionPaySourceAmount,
        ],
      };

      await run({
        transactionData: noMatchingSourceAmountData,
      });

      // When no matching sourceAmount is found, requests array is empty
      expect(getQuotesMock).not.toHaveBeenCalled();
    });
  });
});
