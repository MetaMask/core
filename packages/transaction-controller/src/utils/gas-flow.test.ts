import type {
  GasFeeEstimates as GasFeeControllerEstimates,
  LegacyGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';

import type { GasFeeEstimates, GasFeeFlow, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { getGasFeeFlow, mergeGasFeeEstimates } from './gas-flow';

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x123',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};

const GAS_FEE_CONTROLLER_FEE_MARKET_ESTIMATES_MOCK = {
  baseFeeTrend: 'up',
  low: {
    minWaitTimeEstimate: 10,
    maxWaitTimeEstimate: 20,
    suggestedMaxFeePerGas: '1',
    suggestedMaxPriorityFeePerGas: '2',
  },
  medium: {
    minWaitTimeEstimate: 30,
    maxWaitTimeEstimate: 40,
    suggestedMaxFeePerGas: '3',
    suggestedMaxPriorityFeePerGas: '4',
  },
  high: {
    minWaitTimeEstimate: 50,
    maxWaitTimeEstimate: 60,
    suggestedMaxFeePerGas: '5',
    suggestedMaxPriorityFeePerGas: '6',
  },
} as GasFeeControllerEstimates;

const GAS_FEE_CONTROLLER_LEGACY_ESTIMATES_MOCK: LegacyGasPriceEstimate = {
  low: '1',
  medium: '2',
  high: '3',
};

const TRANSACTION_GAS_FEE_ESTIMATES_MOCK: GasFeeEstimates = {
  low: {
    maxFeePerGas: '0x7',
    maxPriorityFeePerGas: '0x8',
  },
  medium: {
    maxFeePerGas: '0x9',
    maxPriorityFeePerGas: '0xA',
  },
  high: {
    maxFeePerGas: '0xB',
    maxPriorityFeePerGas: '0xC',
  },
};

/**
 * Creates a mock GasFeeFlow.
 * @returns The mock GasFeeFlow.
 */
function createGasFeeFlowMock(): jest.Mocked<GasFeeFlow> {
  return {
    matchesTransaction: jest.fn(),
    getGasFees: jest.fn(),
  };
}

describe('gas-flow', () => {
  describe('getGasFeeFlow', () => {
    it('returns undefined if no gas fee flow matches transaction', () => {
      const gasFeeFlow1 = createGasFeeFlowMock();
      const gasFeeFlow2 = createGasFeeFlowMock();

      gasFeeFlow1.matchesTransaction.mockReturnValue(false);
      gasFeeFlow2.matchesTransaction.mockReturnValue(false);

      expect(
        getGasFeeFlow(TRANSACTION_META_MOCK, [gasFeeFlow1, gasFeeFlow2]),
      ).toBeUndefined();
    });

    it('returns first gas fee flow that matches transaction', () => {
      const gasFeeFlow1 = createGasFeeFlowMock();
      const gasFeeFlow2 = createGasFeeFlowMock();

      gasFeeFlow1.matchesTransaction.mockReturnValue(false);
      gasFeeFlow2.matchesTransaction.mockReturnValue(true);

      expect(
        getGasFeeFlow(TRANSACTION_META_MOCK, [gasFeeFlow1, gasFeeFlow2]),
      ).toBe(gasFeeFlow2);
    });
  });

  describe('mergeGasFeeEstimates', () => {
    it('uses transaction estimates and other gas fee controller properties if estimate type is fee market', () => {
      const result = mergeGasFeeEstimates({
        gasFeeControllerEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
        gasFeeControllerEstimates: GAS_FEE_CONTROLLER_FEE_MARKET_ESTIMATES_MOCK,
        transactionGasFeeEstimates: TRANSACTION_GAS_FEE_ESTIMATES_MOCK,
      });

      expect(result).toStrictEqual({
        baseFeeTrend: 'up',
        low: {
          minWaitTimeEstimate: 10,
          maxWaitTimeEstimate: 20,
          suggestedMaxFeePerGas: '0.000000007',
          suggestedMaxPriorityFeePerGas: '0.000000008',
        },
        medium: {
          minWaitTimeEstimate: 30,
          maxWaitTimeEstimate: 40,
          suggestedMaxFeePerGas: '0.000000009',
          suggestedMaxPriorityFeePerGas: '0.00000001',
        },
        high: {
          minWaitTimeEstimate: 50,
          maxWaitTimeEstimate: 60,
          suggestedMaxFeePerGas: '0.000000011',
          suggestedMaxPriorityFeePerGas: '0.000000012',
        },
      });
    });

    it('uses transaction estimates only if estimate type is legacy', () => {
      const result = mergeGasFeeEstimates({
        gasFeeControllerEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
        gasFeeControllerEstimates: GAS_FEE_CONTROLLER_LEGACY_ESTIMATES_MOCK,
        transactionGasFeeEstimates: TRANSACTION_GAS_FEE_ESTIMATES_MOCK,
      });

      expect(result).toStrictEqual({
        low: '0.000000007',
        medium: '0.000000009',
        high: '0.000000011',
      });
    });

    it('uses unchanged gas fee controller estimates if estimate type is gas price', () => {
      const result = mergeGasFeeEstimates({
        gasFeeControllerEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
        gasFeeControllerEstimates: GAS_FEE_CONTROLLER_LEGACY_ESTIMATES_MOCK,
        transactionGasFeeEstimates: TRANSACTION_GAS_FEE_ESTIMATES_MOCK,
      } as never);

      expect(result).toStrictEqual(GAS_FEE_CONTROLLER_LEGACY_ESTIMATES_MOCK);
    });
  });
});
