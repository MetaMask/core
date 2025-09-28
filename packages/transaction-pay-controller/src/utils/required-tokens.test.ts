import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { parseRequiredTokens } from './required-tokens';
import { getTokenBalance, getTokenInfo } from './token';
import type { TransactionPayControllerMessenger } from '../types';

jest.mock('./token');

const TRANSACTION_META_MOCK = {
  chainId: '0x1' as Hex,
  txParams: {
    data: '0xa9059cbb0000000000000000000000005a52e96bacdabb82fd05763e25335261b270efcb000000000000000000000000000000000000000000000000000000000001E240',
    to: '0x123',
  },
} as TransactionMeta;

const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

describe('Required Tokens Utils', () => {
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenInfoMock = jest.mocked(getTokenInfo);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('parseRequiredTokens', () => {
    it('returns token transfer required token', () => {
      getTokenInfoMock.mockReturnValue({ decimals: 3, symbol: 'TST' });
      getTokenBalanceMock.mockReturnValue('789000');

      const result = parseRequiredTokens(TRANSACTION_META_MOCK, MESSENGER_MOCK);

      expect(result).toStrictEqual([
        {
          address: TRANSACTION_META_MOCK.txParams.to,
          allowUnderMinimum: false,
          amountHuman: '123.456',
          amountRaw: '123456',
          balanceHuman: '789',
          balanceRaw: '789000',
          chainId: TRANSACTION_META_MOCK.chainId,
          decimals: 3,
          skipIfBalance: false,
          symbol: 'TST',
        },
      ]);
    });

    it('returns empty array if no to', () => {
      const result = parseRequiredTokens(
        {
          ...TRANSACTION_META_MOCK,
          txParams: { ...TRANSACTION_META_MOCK.txParams, to: undefined },
        },
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual([]);
    });

    it('returns empty array if no data', () => {
      const result = parseRequiredTokens(
        {
          ...TRANSACTION_META_MOCK,
          txParams: { ...TRANSACTION_META_MOCK.txParams, data: undefined },
        },
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual([]);
    });

    it('returns empty array if not transfer', () => {
      const result = parseRequiredTokens(
        {
          ...TRANSACTION_META_MOCK,
          txParams: { ...TRANSACTION_META_MOCK.txParams, data: '0x12345678' },
        },
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual([]);
    });
  });
});
