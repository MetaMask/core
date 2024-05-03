import { toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type {
  GasFeeEstimates as FeeMarketGasPriceEstimate,
  GasFeeState,
  LegacyGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';

import type {
  FeeMarketGasFeeEstimates,
  GasPriceGasFeeEstimates,
  LegacyGasFeeEstimates,
  TransactionMeta,
} from '../types';
import { GasFeeEstimateType, TransactionStatus } from '../types';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';

const ETH_QUERY_MOCK = {} as EthQuery;

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

const GAS_PRICE_RESPONSE_MOCK = {
  gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
  gasFeeEstimates: {
    gasPrice: '3',
  },
} as GasFeeState;

const FEE_MARKET_EXPECTED_RESULT: FeeMarketGasFeeEstimates = {
  type: GasFeeEstimateType.FeeMarket,
  low: {
    maxFeePerGas: toHex(1e9),
    maxPriorityFeePerGas: toHex(2e9),
  },
  medium: {
    maxFeePerGas: toHex(3e9),
    maxPriorityFeePerGas: toHex(4e9),
  },
  high: {
    maxFeePerGas: toHex(5e9),
    maxPriorityFeePerGas: toHex(6e9),
  },
};

const LEGACY_EXPECTED_RESULT: LegacyGasFeeEstimates = {
  type: GasFeeEstimateType.Legacy,
  low: toHex(1e9),
  medium: toHex(3e9),
  high: toHex(5e9),
};

const GAS_PRICE_EXPECTED_RESULT: GasPriceGasFeeEstimates = {
  type: GasFeeEstimateType.GasPrice,
  gasPrice: toHex(3e9),
};

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

      const response = await defaultGasFeeFlow.getGasFees({
        ethQuery: ETH_QUERY_MOCK,
        gasFeeControllerData: FEE_MARKET_RESPONSE_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(response).toStrictEqual({
        estimates: FEE_MARKET_EXPECTED_RESULT,
      });
    });

    it('returns legacy values if estimate type is legacy', async () => {
      const defaultGasFeeFlow = new DefaultGasFeeFlow();

      const response = await defaultGasFeeFlow.getGasFees({
        ethQuery: ETH_QUERY_MOCK,
        gasFeeControllerData: LEGACY_RESPONSE_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(response).toStrictEqual({
        estimates: LEGACY_EXPECTED_RESULT,
      });
    });

    it('returns gas price value if estimate type is gas price', async () => {
      const defaultGasFeeFlow = new DefaultGasFeeFlow();

      const response = await defaultGasFeeFlow.getGasFees({
        ethQuery: ETH_QUERY_MOCK,
        gasFeeControllerData: GAS_PRICE_RESPONSE_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      expect(response).toStrictEqual({
        estimates: GAS_PRICE_EXPECTED_RESULT,
      });
    });

    it('throws if estimate type not supported', async () => {
      const defaultGasFeeFlow = new DefaultGasFeeFlow();

      const response = defaultGasFeeFlow.getGasFees({
        ethQuery: ETH_QUERY_MOCK,
        gasFeeControllerData: {
          gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
        } as GasFeeState,
        transactionMeta: TRANSACTION_META_MOCK,
      });

      await expect(response).rejects.toThrow(
        'Unsupported gas estimate type: none',
      );
    });
  });
});
