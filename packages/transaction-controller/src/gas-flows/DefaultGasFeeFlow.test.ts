import type {
  GasFeeEstimates as FeeMarketGasPriceEstimate,
  GasFeeState,
  LegacyGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';

import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import type { GasFeeEstimates, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';

const ETH_QUERY_MOCK = {};

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x123',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};

const FEE_MARKET_ESTIMATES_MOCK = {
  low: {
    suggestedMaxFeePerGas: '1',
    suggestedMaxPriorityFeePerGas: '2',
  },
  medium: {
    suggestedMaxFeePerGas: '3',
    suggestedMaxPriorityFeePerGas: '4',
  },
  high: {
    suggestedMaxFeePerGas: '5',
    suggestedMaxPriorityFeePerGas: '6',
  },
} as FeeMarketGasPriceEstimate;

const LEGACY_ESTIMATES_MOCK: LegacyGasPriceEstimate = {
  low: '1',
  medium: '3',
  high: '5',
};

const FEE_MARKET_RESPONSE_MOCK = {
  gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
  gasFeeEstimates: FEE_MARKET_ESTIMATES_MOCK,
} as GasFeeState;

const LEGACY_RESPONSE_MOCK = {
  gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
  gasFeeEstimates: LEGACY_ESTIMATES_MOCK,
} as GasFeeState;

// Converted to Hex and multiplied by 1 billion.
const FEE_MARKET_EXPECTED_RESULT: GasFeeEstimates = {
  low: {
    maxFeePerGas: '0x3b9aca00',
    maxPriorityFeePerGas: '0x77359400',
  },
  medium: {
    maxFeePerGas: '0xb2d05e00',
    maxPriorityFeePerGas: '0xee6b2800',
  },
  high: {
    maxFeePerGas: '0x12a05f200',
    maxPriorityFeePerGas: '0x165a0bc00',
  },
} as any;

// Converted to Hex and multiplied by 1 billion.
const LEGACY_EXPECTED_RESULT: GasFeeEstimates = {
  low: {
    maxFeePerGas: '0x3b9aca00',
    maxPriorityFeePerGas: '0x3b9aca00',
  },
  medium: {
    maxFeePerGas: '0xb2d05e00',
    maxPriorityFeePerGas: '0xb2d05e00',
  },
  high: {
    maxFeePerGas: '0x12a05f200',
    maxPriorityFeePerGas: '0x12a05f200',
  },
} as any;

describe('DefaultGasFeeFlow', () => {
  describe('matchesTransaction', () => {
    it('returns true', () => {
      const defaultGasFeeFlow = new DefaultGasFeeFlow();
      const result = defaultGasFeeFlow.matchesTransaction(
        TRANSACTION_META_MOCK,
      );
      expect(result).toBe(true);
    });
  });

  describe('getGasFees', () => {
    it('returns fee market values if estimate type is fee market', async () => {
      const defaultGasFeeFlow = new DefaultGasFeeFlow();

      const getGasFeeControllerEstimates = jest
        .fn()
        .mockResolvedValue(FEE_MARKET_RESPONSE_MOCK);

      const response = await defaultGasFeeFlow.getGasFees({
        ethQuery: ETH_QUERY_MOCK,
        getGasFeeControllerEstimates,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(response).toStrictEqual({
        estimates: FEE_MARKET_EXPECTED_RESULT,
      });
    });

    it('returns legacy values if estimate type is legacy', async () => {
      const defaultGasFeeFlow = new DefaultGasFeeFlow();

      const getGasFeeControllerEstimates = jest
        .fn()
        .mockResolvedValue(LEGACY_RESPONSE_MOCK);

      const response = await defaultGasFeeFlow.getGasFees({
        ethQuery: ETH_QUERY_MOCK,
        getGasFeeControllerEstimates,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(response).toStrictEqual({
        estimates: LEGACY_EXPECTED_RESULT,
      });
    });

    it('throws if estimate type not supported', async () => {
      const defaultGasFeeFlow = new DefaultGasFeeFlow();

      const getGasFeeControllerEstimates = jest.fn().mockResolvedValue({
        gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
      });

      const response = defaultGasFeeFlow.getGasFees({
        ethQuery: ETH_QUERY_MOCK,
        getGasFeeControllerEstimates,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      await expect(response).rejects.toThrow('No gas fee estimates available');
    });
  });
});
