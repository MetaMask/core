import { updateSourceAmounts } from './source-amounts';
import { getTokenFiatRate } from './token';
import type { TransactionPaymentToken } from '..';
import type { TransactionData, TransactionPayRequiredToken } from '../types';

jest.mock('./token');

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

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenFiatRateMock.mockReturnValue({ fiatRate: '2.0', usdRate: '3.0' });
  });

  describe('updateSourceAmounts', () => {
    it('updated source amounts', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, {} as never);

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

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, {} as never);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
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

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, {} as never);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('returns empty array if no payment token fiat rate', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      getTokenFiatRateMock.mockReturnValue(undefined);

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, {} as never);

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

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, {} as never);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('does nothing if no payment token', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, {} as never);

      expect(transactionData.sourceAmounts).toBeUndefined();
    });

    it('does nothing if no tokens', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, {} as never);

      expect(transactionData.sourceAmounts).toBeUndefined();
    });

    // eslint-disable-next-line jest/expect-expect
    it('does nothing if no transaction data', () => {
      updateSourceAmounts(TRANSACTION_ID_MOCK, undefined, {} as never);
    });
  });
});
