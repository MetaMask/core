import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { calculateGasCost, calculateTransactionGasCost } from './gas';
import { getTokenFiatRate } from './token';
import type { GasFeeEstimates } from '../../../gas-fee-controller/src';
import type { TransactionMeta } from '../../../transaction-controller/src';
import { getMessengerMock } from '../tests/messenger-mock';

jest.mock('./token');

const GAS_USED_MOCK = toHex(21000);
const GAS_LIMIT_NO_BUFFER_MOCK = toHex(30000);
const GAS_MOCK = toHex(40000);
const MAX_PRIORITY_FEE_PER_GAS_MOCK = toHex(2500000000);
const MAX_FEE_PER_GAS_MOCK = toHex(5500000000);
const CHAIN_ID_MOCK = '0x1' as Hex;

const TRANSACTION_META_MOCK = {
  chainId: CHAIN_ID_MOCK as Hex,
  gasUsed: GAS_USED_MOCK,
  txParams: {
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS_MOCK,
  },
} as TransactionMeta;

const GAS_FEE_CONTROLLER_STATE_MOCK = {
  gasFeeEstimatesByChainId: {
    [CHAIN_ID_MOCK]: {
      gasFeeEstimates: {
        estimatedBaseFee: '4',
        medium: {
          suggestedMaxFeePerGas: '5',
          suggestedMaxPriorityFeePerGas: '2',
        },
      } as GasFeeEstimates,
    },
  },
};

describe('Gas Utils', () => {
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const { messenger, getGasFeeControllerStateMock } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getGasFeeControllerStateMock.mockReturnValue(GAS_FEE_CONTROLLER_STATE_MOCK);

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '4000',
      fiatRate: '2000',
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
        fiat: '0.4',
        usd: '0.8',
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
        fiat: '0.44',
        usd: '0.88',
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
  });

  describe('calculateTransactionGasCost', () => {
    it('returns gas cost used gas used', () => {
      const result = calculateTransactionGasCost(
        TRANSACTION_META_MOCK,
        messenger,
      );

      expect(result).toStrictEqual({
        fiat: '0.273',
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
        usd: '0',
      });
    });
  });
});
