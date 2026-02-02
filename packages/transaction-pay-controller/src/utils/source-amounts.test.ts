import { updateSourceAmounts } from './source-amounts';
import { getTokenFiatRate } from './token';
import { getTransaction } from './transaction';
import { TransactionPayStrategy } from '..';
import type { TransactionPaymentToken } from '..';
import { ARBITRUM_USDC_ADDRESS, CHAIN_ID_ARBITRUM } from '../constants';
import { getMessengerMock } from '../tests/messenger-mock';
import type { TransactionData, TransactionPayRequiredToken } from '../types';

jest.mock('./token', () => ({
  ...jest.requireActual('./token'),
  getTokenFiatRate: jest.fn(),
}));
jest.mock('./transaction');

const PAYMENT_TOKEN_MOCK: TransactionPaymentToken = {
  address: '0x123',
  balanceFiat: '2.46',
  balanceHuman: '1.23',
  balanceRaw: '1230000',
  balanceUsd: '3.69',
  chainId: '0x1',
  decimals: 6,
  symbol: 'TST',
};

const TRANSACTION_TOKEN_MOCK: TransactionPayRequiredToken = {
  address: '0x456',
  allowUnderMinimum: false,
  amountFiat: '1.23',
  amountHuman: '0.5',
  amountRaw: '500000',
  amountUsd: '6.0',
  balanceFiat: '2.46',
  balanceHuman: '1.23',
  balanceRaw: '1230000',
  balanceUsd: '3.69',
  chainId: '0x1',
  decimals: 6,
  skipIfBalance: false,
  symbol: 'TST2',
};

const TRANSACTION_ID_MOCK = '123-456';

describe('Source Amounts Utils', () => {
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getTransactionMock = jest.mocked(getTransaction);
  const { messenger, getStrategyMock } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenFiatRateMock.mockReturnValue({ fiatRate: '2.0', usdRate: '3.0' });
    getStrategyMock.mockReturnValue(TransactionPayStrategy.Test);
    getTransactionMock.mockReturnValue({ id: TRANSACTION_ID_MOCK } as never);
  });

  describe('updateSourceAmounts', () => {
    it('updated source amounts', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: '2',
          sourceAmountRaw: '2000000',
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('returns empty array if payment token matches', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: PAYMENT_TOKEN_MOCK.address,
            chainId: PAYMENT_TOKEN_MOCK.chainId,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('does not return empty array if payment token matches but hyperliquid deposit and relay strategy', () => {
      getStrategyMock.mockReturnValue(TransactionPayStrategy.Relay);

      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          address: ARBITRUM_USDC_ADDRESS,
          chainId: CHAIN_ID_ARBITRUM,
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: ARBITRUM_USDC_ADDRESS,
            chainId: CHAIN_ID_ARBITRUM,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toHaveLength(1);
    });

    it('returns empty array if skipIfBalance and has balance', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            balanceUsd: TRANSACTION_TOKEN_MOCK.amountUsd,
            skipIfBalance: true,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('returns empty array if no payment token fiat rate', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      getTokenFiatRateMock.mockReturnValue(undefined);

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('returns empty array if zero amount', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            amountRaw: '0',
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('uses payment token balance if isMaxAmount is true', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: PAYMENT_TOKEN_MOCK.balanceHuman,
          sourceAmountRaw: PAYMENT_TOKEN_MOCK.balanceRaw,
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('does nothing if no payment token', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toBeUndefined();
    });

    it('does nothing if no tokens', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toBeUndefined();
    });

    // eslint-disable-next-line jest/expect-expect
    it('does nothing if no transaction data', () => {
      updateSourceAmounts(TRANSACTION_ID_MOCK, undefined, messenger);
    });

    describe('post-quote (withdrawal) flow', () => {
      const DESTINATION_TOKEN_MOCK = {
        address: '0xdef' as const,
        balanceFiat: '100.00',
        balanceHuman: '1.00',
        balanceRaw: '1000000000000000000',
        balanceUsd: '100.00',
        chainId: '0x38' as const,
        decimals: 18,
        symbol: 'BNB',
      };

      it('calculates source amounts from tokens for post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.amountHuman,
            sourceAmountRaw: TRANSACTION_TOKEN_MOCK.amountRaw,
            sourceBalanceRaw: TRANSACTION_TOKEN_MOCK.balanceRaw,
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_MOCK.address,
          },
        ]);
      });

      it('filters out skipIfBalance tokens in post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              skipIfBalance: true,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([]);
      });

      it('does nothing for post-quote if no paymentToken', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          tokens: [TRANSACTION_TOKEN_MOCK],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toBeUndefined();
      });
    });
  });
});
