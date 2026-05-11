import { toHex } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';

import type { TransactionMeta } from '..';
import type { TransactionControllerMessenger } from '../TransactionController';
import { getNativeBalance, isNativeBalanceSufficientForGas } from './balance';
import { rpcRequest } from './provider';

jest.mock('./provider', () => ({
  rpcRequest: jest.fn(),
}));

const MESSENGER_MOCK = {} as unknown as TransactionControllerMessenger;
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId' as NetworkClientId;
const BALANCE_MOCK = '21000000000000';

const TRANSACTION_META_MOCK = {
  txParams: {
    from: '0x1234',
    gas: toHex(21000),
    maxFeePerGas: toHex(1000000000), // 1 Gwei
  },
} as TransactionMeta;

describe('Balance Utils', () => {
  const rpcRequestMock = jest.mocked(rpcRequest);

  beforeEach(() => {
    jest.resetAllMocks();

    rpcRequestMock.mockResolvedValue(toHex(BALANCE_MOCK));
  });

  describe('getNativeBalance', () => {
    it('returns native balance', async () => {
      const result = await getNativeBalance(
        '0x1234',
        MESSENGER_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

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
        MESSENGER_MOCK,
        NETWORK_CLIENT_ID_MOCK,
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
        MESSENGER_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(result).toBe(false);
    });
  });
});
