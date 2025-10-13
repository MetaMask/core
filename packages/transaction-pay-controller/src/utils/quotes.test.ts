import { Messenger } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import type { UpdateQuotesRequest } from './quotes';
import { updateQuotes } from './quotes';
import { getStrategy } from './strategy';
import { calculateTotals } from './totals';
import { getTransaction } from './transaction';
import type { TransactionPayControllerMessenger } from '..';
import type {
  SourceAmountValues,
  TransactionData,
  TransactionPayQuote,
  TransactionPayTotals,
  TransactionPaymentToken,
  TransactionToken,
} from '../types';

jest.mock('./strategy');
jest.mock('./transaction');
jest.mock('./totals');

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
    } as SourceAmountValues,
  ],
  tokens: [{} as TransactionToken],
};

const TRANSACTION_META_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: { from: '0xabc' as Hex },
} as TransactionMeta;

const QUOTE_MOCK = {
  dust: {
    usd: '1.23',
    fiat: '2.34',
  },
} as TransactionPayQuote<unknown>;

const TOTALS_MOCK = {
  total: {
    fiat: '1.23',
    usd: '4.56',
  },
} as TransactionPayTotals;

describe('Quotes Utils', () => {
  let messenger: TransactionPayControllerMessenger;
  const updateTransactionDataMock = jest.fn();
  const getStrategyMock = jest.mocked(getStrategy);
  const getTransactionMock = jest.mocked(getTransaction);
  const calculateTotalsMock = jest.mocked(calculateTotals);
  const getQuotesMock = jest.fn();

  /**
   * Run the updateQuotes function.
   *
   * @param params - Partial params to override the defaults.
   */
  async function run(params?: Partial<UpdateQuotesRequest>) {
    await updateQuotes({
      messenger,
      transactionData: cloneDeep(TRANSACTION_DATA_MOCK),
      transactionId: TRANSACTION_ID_MOCK,
      updateTransactionData: updateTransactionDataMock,
      ...params,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    messenger = new Messenger() as never;

    getStrategyMock.mockResolvedValue({
      execute: jest.fn(),
      getQuotes: getQuotesMock,
    });

    getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
    getQuotesMock.mockResolvedValue([QUOTE_MOCK]);
  });

  describe('updateQuotes', () => {
    it('updates quotes in state', async () => {
      await run();

      const transactionDataMock = {};

      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

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

      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

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

      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

      expect(transactionDataMock).toMatchObject({
        quotes: [],
      });
    });

    it('does nothing if no payment token', async () => {
      await run({
        transactionData: {
          ...TRANSACTION_DATA_MOCK,
          paymentToken: undefined,
        },
      });

      expect(updateTransactionDataMock).not.toHaveBeenCalled();
    });

    it('gets quotes from strategy', async () => {
      await run();

      expect(getQuotesMock).toHaveBeenCalledWith({
        messenger,
        requests: [
          {
            from: TRANSACTION_META_MOCK.txParams.from,
            sourceBalanceRaw: TRANSACTION_DATA_MOCK.paymentToken?.balanceRaw,
            sourceTokenAmount:
              TRANSACTION_DATA_MOCK.sourceAmounts?.[0].sourceAmountRaw,
            sourceChainId: TRANSACTION_DATA_MOCK.paymentToken?.chainId,
            sourceTokenAddress: TRANSACTION_DATA_MOCK.paymentToken?.address,
            targetAmountMinimum: TRANSACTION_DATA_MOCK.tokens?.[0].amountRaw,
            targetChainId: TRANSACTION_DATA_MOCK.tokens?.[0].chainId,
            targetTokenAddress: TRANSACTION_DATA_MOCK.tokens?.[0].address,
          },
        ],
      });
    });

    it('updates totals in state', async () => {
      calculateTotalsMock.mockReturnValue(TOTALS_MOCK);

      await run();

      const transactionDataMock = {};

      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

      expect(transactionDataMock).toStrictEqual(
        expect.objectContaining({ totals: TOTALS_MOCK }),
      );
    });
  });
});
