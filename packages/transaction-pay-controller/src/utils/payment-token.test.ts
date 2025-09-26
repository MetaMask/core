import { getPaymentToken } from './payment-token';
import { getTokenBalance, getTokenDecimals, getTokenFiatRate } from './token';

jest.mock('./token');

const TOKEN_ADDRESS_MOCK = '0x123';
const CHAIN_ID_MOCK = '0x1';
const FROM_MOCK = '0x456';

describe('Payment Token Utils', () => {
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenDecimalsMock = jest.mocked(getTokenDecimals);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenDecimalsMock.mockReturnValue(6);
    getTokenBalanceMock.mockReturnValue('1230000');
    getTokenFiatRateMock.mockReturnValue({ fiatRate: '2.0', usdRate: '3.0' });
  });

  describe('getPaymentToken', () => {
    it('returns payment token data', () => {
      const result = getPaymentToken({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: {} as never,
        tokenAddress: TOKEN_ADDRESS_MOCK,
      });

      expect(result).toStrictEqual({
        address: TOKEN_ADDRESS_MOCK,
        balanceFiat: '2.46',
        balanceHuman: '1.23',
        balanceRaw: '1230000',
        balanceUsd: '3.69',
        chainId: CHAIN_ID_MOCK,
        decimals: 6,
      });
    });

    it('returns undefined if no decimals', () => {
      getTokenDecimalsMock.mockReturnValue(undefined);

      const result = getPaymentToken({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: {} as never,
        tokenAddress: TOKEN_ADDRESS_MOCK,
      });

      expect(result).toBeUndefined();
    });
  });
});
