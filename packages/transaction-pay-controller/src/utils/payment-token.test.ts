import { BigNumber } from 'bignumber.js';

import { getPaymentToken } from './payment-token';
import { getTokenBalance, getTokenDecimals } from './token';

jest.mock('./token');

const TOKEN_ADDRESS_MOCK = '0x123';
const CHAIN_ID_MOCK = '0x1';
const FROM_MOCK = '0x456';

describe('Payment Token Utils', () => {
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenDecimalsMock = jest.mocked(getTokenDecimals);

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenDecimalsMock.mockReturnValue(6);
    getTokenBalanceMock.mockReturnValue('1230000');
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
        balanceHuman: '1.23',
        balanceRaw: '1230000',
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
