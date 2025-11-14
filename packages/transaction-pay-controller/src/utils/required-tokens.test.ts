import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { parseRequiredTokens } from './required-tokens';
import { getTokenBalance, getTokenFiatRate, getTokenInfo } from './token';
import { toHex } from '../../../controller-utils/src';
import { NATIVE_TOKEN_ADDRESS } from '../constants';
import type { TransactionPayControllerMessenger } from '../types';

jest.mock('./token', () => ({
  ...jest.requireActual('./token'),
  getTokenBalance: jest.fn(),
  getTokenFiatRate: jest.fn(),
  getTokenInfo: jest.fn(),
}));

const TRANSACTION_META_MOCK = {
  chainId: '0x1' as Hex,
  txParams: {
    data: '0xa9059cbb0000000000000000000000005a52e96bacdabb82fd05763e25335261b270efcb000000000000000000000000000000000000000000000000000000000001E240',
    gas: toHex(100000),
    maxFeePerGas: toHex(10000000000),
    to: '0x123',
  },
} as TransactionMeta;

const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

describe('Required Tokens Utils', () => {
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('parseRequiredTokens', () => {
    it('returns token transfer required token', () => {
      getTokenInfoMock.mockReturnValue({ decimals: 3, symbol: 'TST' });
      getTokenBalanceMock.mockReturnValue('789000');

      getTokenFiatRateMock.mockReturnValue({
        usdRate: '1.5',
        fiatRate: '2',
      });

      const result = parseRequiredTokens(TRANSACTION_META_MOCK, MESSENGER_MOCK);

      expect(result).toStrictEqual([
        {
          address: TRANSACTION_META_MOCK.txParams.to,
          allowUnderMinimum: false,
          amountFiat: '246.912',
          amountHuman: '123.456',
          amountRaw: '123456',
          amountUsd: '185.184',
          balanceFiat: '1578',
          balanceHuman: '789',
          balanceRaw: '789000',
          balanceUsd: '1183.5',
          chainId: TRANSACTION_META_MOCK.chainId,
          decimals: 3,
          skipIfBalance: false,
          symbol: 'TST',
        },
        expect.anything(),
      ]);
    });

    it('returns token transfer required token from nested call', () => {
      getTokenInfoMock.mockReturnValue({ decimals: 3, symbol: 'TST' });
      getTokenBalanceMock.mockReturnValue('789000');

      getTokenFiatRateMock.mockReturnValue({
        usdRate: '1.5',
        fiatRate: '2',
      });

      const transactionMeta: TransactionMeta = {
        ...TRANSACTION_META_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          data: '0x1234',
          to: '0x456',
        },
        nestedTransactions: [
          {
            data: TRANSACTION_META_MOCK.txParams.data as Hex,
            to: TRANSACTION_META_MOCK.txParams.to as Hex,
          },
        ],
      };

      const result = parseRequiredTokens(transactionMeta, MESSENGER_MOCK);

      expect(result).toStrictEqual([
        {
          address: TRANSACTION_META_MOCK.txParams.to,
          allowUnderMinimum: false,
          amountFiat: '246.912',
          amountHuman: '123.456',
          amountRaw: '123456',
          amountUsd: '185.184',
          balanceFiat: '1578',
          balanceHuman: '789',
          balanceRaw: '789000',
          balanceUsd: '1183.5',
          chainId: TRANSACTION_META_MOCK.chainId,
          decimals: 3,
          skipIfBalance: false,
          symbol: 'TST',
        },
        expect.anything(),
      ]);
    });

    it('ignores token transfer with bad data', () => {
      getTokenInfoMock.mockReturnValue({ decimals: 3, symbol: 'TST' });
      getTokenBalanceMock.mockReturnValue('789000');

      getTokenFiatRateMock.mockReturnValue({
        usdRate: '1.5',
        fiatRate: '2',
      });

      const transactionMeta: TransactionMeta = {
        ...TRANSACTION_META_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          data: '0xa9059cbb',
        },
      };

      const result = parseRequiredTokens(transactionMeta, MESSENGER_MOCK);

      expect(result).toStrictEqual([expect.anything()]);
    });

    it('returns gas fee required token', () => {
      getTokenInfoMock.mockReturnValue({ decimals: 18, symbol: 'TST' });
      getTokenBalanceMock.mockReturnValue('1230000000000000000');

      getTokenFiatRateMock.mockReturnValue({
        usdRate: '4000',
        fiatRate: '2000',
      });

      const result = parseRequiredTokens(
        {
          ...TRANSACTION_META_MOCK,
          txParams: { ...TRANSACTION_META_MOCK.txParams, data: '0x1234' },
        },
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual([
        {
          address: NATIVE_TOKEN_ADDRESS,
          allowUnderMinimum: true,
          amountFiat: '2',
          amountHuman: '0.001',
          amountRaw: '1000000000000000',
          amountUsd: '4',
          balanceFiat: '2460',
          balanceHuman: '1.23',
          balanceRaw: '1230000000000000000',
          balanceUsd: '4920',
          chainId: TRANSACTION_META_MOCK.chainId,
          decimals: 18,
          skipIfBalance: true,
          symbol: 'TST',
        },
      ]);
    });

    it('returns gas fee required token as one dollar if less than one dollar', () => {
      getTokenInfoMock.mockReturnValue({ decimals: 18, symbol: 'TST' });
      getTokenBalanceMock.mockReturnValue('900000000000');

      getTokenFiatRateMock.mockReturnValue({
        usdRate: '4000',
        fiatRate: '2000',
      });

      const result = parseRequiredTokens(
        {
          ...TRANSACTION_META_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            data: '0x1234',
            gas: toHex(100),
          },
        },
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual([
        {
          address: NATIVE_TOKEN_ADDRESS,
          allowUnderMinimum: true,
          amountFiat: '0.5',
          amountHuman: '0.00025',
          amountRaw: '250000000000000',
          amountUsd: '1',
          balanceFiat: '0.0018',
          balanceHuman: '0.0000009',
          balanceRaw: '900000000000',
          balanceUsd: '0.0036',
          chainId: TRANSACTION_META_MOCK.chainId,
          decimals: 18,
          skipIfBalance: true,
          symbol: 'TST',
        },
      ]);
    });

    it('returns gas fee required token as zero if no gas or maxFeePerGas', () => {
      getTokenInfoMock.mockReturnValue({ decimals: 18, symbol: 'TST' });
      getTokenBalanceMock.mockReturnValue('900000000000');

      getTokenFiatRateMock.mockReturnValue({
        usdRate: '4000',
        fiatRate: '2000',
      });

      const result = parseRequiredTokens(
        {
          ...TRANSACTION_META_MOCK,
          txParams: {
            ...TRANSACTION_META_MOCK.txParams,
            data: '0x1234',
            gas: undefined,
            maxFeePerGas: undefined,
          },
        },
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual([
        {
          address: NATIVE_TOKEN_ADDRESS,
          allowUnderMinimum: true,
          amountFiat: '0',
          amountHuman: '0',
          amountRaw: '0',
          amountUsd: '0',
          balanceFiat: '0.0018',
          balanceHuman: '0.0000009',
          balanceRaw: '900000000000',
          balanceUsd: '0.0036',
          chainId: TRANSACTION_META_MOCK.chainId,
          decimals: 18,
          skipIfBalance: true,
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

    it('returns undefined if token info not found', () => {
      getTokenInfoMock.mockReturnValue(undefined);

      const result = parseRequiredTokens(TRANSACTION_META_MOCK, MESSENGER_MOCK);

      expect(result).toStrictEqual([]);
    });
  });
});
