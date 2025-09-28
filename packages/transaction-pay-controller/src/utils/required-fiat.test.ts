import { calculateFiat } from './required-fiat';
import { getTokenFiatRate } from './token';
import type {
  TransactionPayControllerMessenger,
  TransactionTokenRequired,
} from '../types';

jest.mock('./token');

const TRANSACTION_TOKEN_MOCK: TransactionTokenRequired = {
  address: '0x123',
  allowUnderMinimum: false,
  amountHuman: '1.23',
  amountRaw: '1230000',
  balanceHuman: '4.56',
  balanceRaw: '4560000',
  chainId: '0x1',
  decimals: 6,
  skipIfBalance: false,
  symbol: 'TST',
};

const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

describe('Required Fiat Utils', () => {
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '2.0',
      fiatRate: '3.0',
    });
  });

  describe('calculateFiat', () => {
    it('calculates fiat properties', () => {
      const result = calculateFiat(TRANSACTION_TOKEN_MOCK, MESSENGER_MOCK);

      expect(result).toStrictEqual({
        amountFiat: '3.69',
        amountUsd: '2.46',
        balanceFiat: '13.68',
        balanceUsd: '9.12',
      });
    });

    it('returns undefined if no fiat rates', () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      const result = calculateFiat(TRANSACTION_TOKEN_MOCK, MESSENGER_MOCK);

      expect(result).toBeUndefined();
    });

    it('returns undefined if no fiat rate', () => {
      getTokenFiatRateMock.mockReturnValue({
        usdRate: '2.0',
      } as never);

      const result = calculateFiat(TRANSACTION_TOKEN_MOCK, MESSENGER_MOCK);

      expect(result).toBeUndefined();
    });

    it('returns undefined if no usd rate', () => {
      getTokenFiatRateMock.mockReturnValue({
        fiatRate: '2.0',
      } as never);

      const result = calculateFiat(TRANSACTION_TOKEN_MOCK, MESSENGER_MOCK);

      expect(result).toBeUndefined();
    });
  });
});
