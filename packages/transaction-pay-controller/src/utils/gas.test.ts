import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { clone, cloneDeep } from 'lodash';

import {
  calculateGasCost,
  calculateGasFeeTokenCost,
  calculateTransactionGasCost,
} from './gas';
import { getTokenBalance, getTokenFiatRate, getTokenInfo } from './token';
import type { GasFeeEstimates } from '../../../gas-fee-controller/src';
import type {
  GasFeeToken,
  TransactionMeta,
} from '../../../transaction-controller/src';
import { getMessengerMock } from '../tests/messenger-mock';

jest.mock('./token');

const GAS_USED_MOCK = toHex(21000);
const GAS_LIMIT_NO_BUFFER_MOCK = toHex(30000);
const GAS_MOCK = toHex(40000);
const MAX_PRIORITY_FEE_PER_GAS_MOCK = toHex(2500000000);
const MAX_FEE_PER_GAS_MOCK = toHex(750000000);
const CHAIN_ID_MOCK = '0x1' as Hex;
const TOKEN_ADDRESS_MOCK = '0x789' as Hex;

const GAS_FEE_TOKEN_MOCK = {
  amount: toHex(1230000),
  tokenAddress: TOKEN_ADDRESS_MOCK,
} as GasFeeToken;

const TRANSACTION_META_MOCK = {
  chainId: CHAIN_ID_MOCK as Hex,
  gasUsed: GAS_USED_MOCK,
  txParams: {
    gas: GAS_MOCK,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS_MOCK,
  },
} as TransactionMeta;

const GAS_FEE_CONTROLLER_STATE_MOCK = {
  gasFeeEstimatesByChainId: {
    [CHAIN_ID_MOCK]: {
      gasFeeEstimates: {
        estimatedBaseFee: '4',
        medium: {
          suggestedMaxFeePerGas: '7',
          suggestedMaxPriorityFeePerGas: '2',
        },
      } as GasFeeEstimates,
    },
  },
};

describe('Gas Utils', () => {
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const { messenger, getGasFeeControllerStateMock } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getGasFeeControllerStateMock.mockReturnValue(GAS_FEE_CONTROLLER_STATE_MOCK);
    getTokenBalanceMock.mockReturnValue('147000000000000');

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '4000',
      fiatRate: '2000',
    });

    getTokenInfoMock.mockReturnValue({
      decimals: 6,
      symbol: 'TST',
    });
  });

  describe('calculateGasCost', () => {
    it('returns gas cost using estimated base fee and estimated priority fee', () => {
      const result = calculateGasCost({
        chainId: CHAIN_ID_MOCK,
        gas: GAS_MOCK,
        messenger,
      });

      expect(result).toStrictEqual({
        fiat: '0.48',
        human: '0.00024',
        raw: '240000000000000',
        usd: '0.96',
      });
    });

    it('returns gas cost using estimted base fee and provided priority fee', () => {
      const gasState = cloneDeep(GAS_FEE_CONTROLLER_STATE_MOCK);

      gasState.gasFeeEstimatesByChainId[
        CHAIN_ID_MOCK
      ].gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas =
        undefined as never;

      getGasFeeControllerStateMock.mockReturnValue(gasState);

      const result = calculateGasCost({
        chainId: CHAIN_ID_MOCK,
        gas: GAS_MOCK,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS_MOCK,
        messenger,
      });

      expect(result).toStrictEqual({
        fiat: '0.52',
        human: '0.00026',
        raw: '260000000000000',
        usd: '1.04',
      });
    });

    it('returns gas cost using estimated max fee', () => {
      const gasState = cloneDeep(GAS_FEE_CONTROLLER_STATE_MOCK);

      gasState.gasFeeEstimatesByChainId[
        CHAIN_ID_MOCK
      ].gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas =
        undefined as never;

      getGasFeeControllerStateMock.mockReturnValue(gasState);

      const result = calculateGasCost({
        chainId: CHAIN_ID_MOCK,
        gas: GAS_MOCK,
        messenger,
      });

      expect(result).toStrictEqual({
        fiat: '0.56',
        human: '0.00028',
        raw: '280000000000000',
        usd: '1.12',
      });
    });

    it('returns gas cost using provided max fee', () => {
      getGasFeeControllerStateMock.mockReturnValue(undefined);

      const result = calculateGasCost({
        chainId: CHAIN_ID_MOCK,
        gas: GAS_MOCK,
        maxFeePerGas: MAX_FEE_PER_GAS_MOCK,
        messenger,
      });

      expect(result).toStrictEqual({
        fiat: '0.06',
        human: '0.00003',
        raw: '30000000000000',
        usd: '0.12',
      });
    });

    it('returns zero gas cost if no fee property', () => {
      getGasFeeControllerStateMock.mockReturnValue(undefined);

      const result = calculateGasCost({
        chainId: CHAIN_ID_MOCK,
        gas: GAS_MOCK,
        messenger,
      });

      expect(result).toStrictEqual({
        fiat: '0',
        human: '0',
        raw: '0',
        usd: '0',
      });
    });

    it('throws if fiat rate is not available', () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      expect(() =>
        calculateGasCost({
          chainId: CHAIN_ID_MOCK,
          gas: GAS_MOCK,
          messenger,
        }),
      ).toThrow('Could not fetch fiat rate for native token');
    });

    it('returns gas cost using max fee if isMax', () => {
      const result = calculateGasCost({
        chainId: CHAIN_ID_MOCK,
        gas: GAS_MOCK,
        isMax: true,
        messenger,
      });

      expect(result).toStrictEqual({
        fiat: '0.56',
        human: '0.00028',
        raw: '280000000000000',
        usd: '1.12',
      });
    });
  });

  describe('calculateTransactionGasCost', () => {
    it('returns gas cost used gas used', () => {
      const result = calculateTransactionGasCost(
        TRANSACTION_META_MOCK,
        messenger,
      );

      expect(result).toStrictEqual({
        fiat: '0.273',
        human: '0.0001365',
        raw: '136500000000000',
        usd: '0.546',
      });
    });

    it('returns gas cost using gas limit with no buffer', () => {
      const transactionMeta = {
        ...TRANSACTION_META_MOCK,
        gasUsed: undefined,
        gasLimitNoBuffer: GAS_LIMIT_NO_BUFFER_MOCK,
      };

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        fiat: '0.39',
        human: '0.000195',
        raw: '195000000000000',
        usd: '0.78',
      });
    });

    it('returns gas cost using gas param', () => {
      const transactionMeta = {
        ...TRANSACTION_META_MOCK,
        gasUsed: undefined,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          gas: GAS_MOCK,
        },
      };

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        fiat: '0.52',
        human: '0.00026',
        raw: '260000000000000',
        usd: '1.04',
      });
    });

    it('returns zero if no gas', () => {
      const transactionMeta = {
        ...TRANSACTION_META_MOCK,
        gasUsed: undefined,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          gas: undefined as never,
        },
      };

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        fiat: '0',
        human: '0',
        raw: '0',
        usd: '0',
      });
    });

    it('does not use gasUsed if isMax', () => {
      const result = calculateTransactionGasCost(
        TRANSACTION_META_MOCK,
        messenger,
        { isMax: true },
      );

      expect(result).toStrictEqual({
        fiat: '0.56',
        human: '0.00028',
        raw: '280000000000000',
        usd: '1.12',
      });
    });

    it('returns gas fee token cost if selected gas fee token', () => {
      const transactionMeta = clone(TRANSACTION_META_MOCK);

      transactionMeta.gasFeeTokens = [GAS_FEE_TOKEN_MOCK];
      transactionMeta.selectedGasFeeToken = TOKEN_ADDRESS_MOCK;

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        isGasFeeToken: true,
        fiat: '2460',
        human: '1.23',
        raw: '1230000',
        usd: '4920',
      });
    });

    it('does not return gas fee token if sufficient native balance and isGasFeeTokenIgnoredIfBalance', () => {
      const transactionMeta = clone(TRANSACTION_META_MOCK);

      transactionMeta.gasFeeTokens = [GAS_FEE_TOKEN_MOCK];
      transactionMeta.selectedGasFeeToken = TOKEN_ADDRESS_MOCK;
      transactionMeta.isGasFeeTokenIgnoredIfBalance = true;

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        fiat: '0.273',
        human: '0.0001365',
        raw: '136500000000000',
        usd: '0.546',
      });
    });

    it('does not return gas fee token if token info is unavailable', () => {
      const transactionMeta = clone(TRANSACTION_META_MOCK);

      transactionMeta.gasFeeTokens = [GAS_FEE_TOKEN_MOCK];
      transactionMeta.selectedGasFeeToken = TOKEN_ADDRESS_MOCK;

      getTokenInfoMock.mockReturnValue(undefined);

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        fiat: '0.273',
        human: '0.0001365',
        raw: '136500000000000',
        usd: '0.546',
      });
    });

    it('does not return gas fee token if fiat rate is unavailable', () => {
      const transactionMeta = clone(TRANSACTION_META_MOCK);

      transactionMeta.gasFeeTokens = [GAS_FEE_TOKEN_MOCK];
      transactionMeta.selectedGasFeeToken = TOKEN_ADDRESS_MOCK;

      getTokenFiatRateMock.mockReset();
      getTokenFiatRateMock
        .mockReturnValueOnce({
          usdRate: '4000',
          fiatRate: '2000',
        })
        .mockReturnValueOnce({
          usdRate: '4000',
          fiatRate: '2000',
        })
        .mockReturnValueOnce(undefined);

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        fiat: '0.273',
        human: '0.0001365',
        raw: '136500000000000',
        usd: '0.546',
      });
    });

    it('does not return gas fee token if selected gas fee token not found', () => {
      const transactionMeta = clone(TRANSACTION_META_MOCK);

      transactionMeta.gasFeeTokens = [GAS_FEE_TOKEN_MOCK];
      transactionMeta.selectedGasFeeToken = '0x0' as Hex;

      const result = calculateTransactionGasCost(transactionMeta, messenger);

      expect(result).toStrictEqual({
        fiat: '0.273',
        human: '0.0001365',
        raw: '136500000000000',
        usd: '0.546',
      });
    });
  });

  describe('calculateGasFeeTokenCost', () => {
    it('returns gas fee token cost', () => {
      const result = calculateGasFeeTokenCost({
        chainId: CHAIN_ID_MOCK,
        gasFeeToken: GAS_FEE_TOKEN_MOCK,
        messenger,
      });

      expect(result).toStrictEqual({
        isGasFeeToken: true,
        fiat: '2460',
        human: '1.23',
        raw: '1230000',
        usd: '4920',
      });
    });

    it('returns undefined if token info is unavailable', () => {
      getTokenInfoMock.mockReturnValue(undefined);

      const result = calculateGasFeeTokenCost({
        chainId: CHAIN_ID_MOCK,
        gasFeeToken: GAS_FEE_TOKEN_MOCK,
        messenger,
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined if fiat rate is unavailable', () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      const result = calculateGasFeeTokenCost({
        chainId: CHAIN_ID_MOCK,
        gasFeeToken: GAS_FEE_TOKEN_MOCK,
        messenger,
      });

      expect(result).toBeUndefined();
    });
  });
});
