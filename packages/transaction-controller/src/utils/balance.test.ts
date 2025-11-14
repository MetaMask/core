import { query, toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';

import { getNativeBalance, isNativeBalanceSufficientForGas } from './balance';
import type { TransactionMeta } from '..';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const ETH_QUERY_MOCK = {} as EthQuery;
const BALANCE_MOCK = '21000000000000';

const TRANSACTION_META_MOCK = {
  txParams: {
    from: '0x1234',
    gas: toHex(21000),
    maxFeePerGas: toHex(1000000000), // 1 Gwei
  },
} as TransactionMeta;

describe('Balance Utils', () => {
  const queryMock = jest.mocked(query);

  beforeEach(() => {
    jest.resetAllMocks();

    queryMock.mockResolvedValue(toHex(BALANCE_MOCK));
  });

  describe('getNativeBalance', () => {
    it('returns native balance', async () => {
      const result = await getNativeBalance('0x1234', ETH_QUERY_MOCK);

      expect(result).toStrictEqual({
        balanceRaw: BALANCE_MOCK,
        balanceHuman: '0.000021',
      });
    });
  });

  describe('isNativeBalanceSufficientForGas', () => {
    it('returns true if balance is sufficient for gas', async () => {
      const result = await isNativeBalanceSufficientForGas(
        TRANSACTION_META_MOCK,
        ETH_QUERY_MOCK,
      );

      expect(result).toBe(true);
    });

    it('returns false if balance is insufficient for gas', async () => {
      const result = await isNativeBalanceSufficientForGas(
        {
          ...TRANSACTION_META_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            gas: toHex(21001),
          },
        },
        ETH_QUERY_MOCK,
      );

      expect(result).toBe(false);
    });
  });
});
