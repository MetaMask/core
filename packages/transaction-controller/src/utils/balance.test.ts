import { query, toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';

import { getNativeBalance } from './balance';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const ETH_QUERY_MOCK = {} as EthQuery;
const BALANCE_MOCK = '123456789123456789123456789';

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
        balanceHuman: '123456789.123456789123456789',
      });
    });
  });
});
