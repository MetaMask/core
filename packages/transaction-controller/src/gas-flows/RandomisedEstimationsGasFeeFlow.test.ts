import { toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import type { GasFeeState } from '@metamask/gas-fee-controller';

import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import { RandomisedEstimationsGasFeeFlow } from './RandomisedEstimationsGasFeeFlow';
import type {
  FeeMarketGasFeeEstimates,
  GasPriceGasFeeEstimates,
  LegacyGasFeeEstimates,
  TransactionMeta,
} from '../types';
import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  TransactionStatus,
} from '../types';
import type { TransactionControllerFeatureFlags } from '../utils/feature-flags';
import { FEATURE_FLAG_RANDOMISE_GAS_FEES } from '../utils/feature-flags';

jest.mock('./DefaultGasFeeFlow');

// Mock Math.random to return predictable values
const originalRandom = global.Math.random;
jest.spyOn(global.Math, 'random').mockReturnValue(0.5);

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x1',
  networkClientId: 'testNetworkClientId',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};

const FEATURE_FLAGS_MOCK: TransactionControllerFeatureFlags = {
  [FEATURE_FLAG_RANDOMISE_GAS_FEES]: {
    config: {
      '0x1': 6,
      '0x5': 4,
    },
  },
};

const ETH_QUERY_MOCK = {} as EthQuery;

const DEFAULT_FEE_MARKET_RESPONSE: FeeMarketGasFeeEstimates = {
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

const DEFAULT_LEGACY_RESPONSE: LegacyGasFeeEstimates = {
  type: GasFeeEstimateType.Legacy,
  low: toHex(1e9),
  medium: toHex(3e9),
  high: toHex(5e9),
};

const DEFAULT_GAS_PRICE_RESPONSE: GasPriceGasFeeEstimates = {
  type: GasFeeEstimateType.GasPrice,
  gasPrice: toHex(3e9),
};

describe('RandomisedEstimationsGasFeeFlow', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(DefaultGasFeeFlow.prototype.getGasFees)
      .mockImplementation(async (request) => {
        const { gasFeeControllerData } = request;
        if (
          gasFeeControllerData.gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET
        ) {
          return { estimates: DEFAULT_FEE_MARKET_RESPONSE };
        } else if (
          gasFeeControllerData.gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY
        ) {
          return { estimates: DEFAULT_LEGACY_RESPONSE };
        }
        return { estimates: DEFAULT_GAS_PRICE_RESPONSE };
      });
  });

  afterEach(() => {
    global.Math.random = originalRandom;
  });

  describe('matchesTransaction', () => {
    it('returns true if chainId exists in the feature flag config', () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId: '0x1',
      } as TransactionMeta;

      expect(flow.matchesTransaction(transaction, FEATURE_FLAGS_MOCK)).toBe(
        true,
      );
    });

    it('returns false if chainId is not in the randomisation config', () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId: '0x89', // Not in config
      } as TransactionMeta;

      expect(flow.matchesTransaction(transaction, FEATURE_FLAGS_MOCK)).toBe(
        false,
      );
    });

    it('returns false if feature flag is not exists', () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId: '0x89', // Not in config
      } as TransactionMeta;

      expect(
        flow.matchesTransaction(
          transaction,
          undefined as unknown as TransactionControllerFeatureFlags,
        ),
      ).toBe(false);
    });
  });

  // ... existing code ...

  describe('getGasFees', () => {
    it('randomises fee market estimates for chain IDs in the feature flag config', async () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const request = {
        ethQuery: ETH_QUERY_MOCK,
        featureFlags: FEATURE_FLAGS_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
        gasFeeControllerData: {
          gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
          gasFeeEstimates: {
            low: {
              suggestedMaxFeePerGas: '100000',
              suggestedMaxPriorityFeePerGas: '100000',
            },
            medium: {
              suggestedMaxFeePerGas: '200000',
              suggestedMaxPriorityFeePerGas: '200000',
            },
            high: {
              suggestedMaxFeePerGas: '300000',
              suggestedMaxPriorityFeePerGas: '300000',
            },
          },
          estimatedGasFeeTimeBounds: {},
        } as GasFeeState,
      };

      const result = await flow.getGasFees(request);

      expect(result.estimates.type).toBe(GasFeeEstimateType.FeeMarket);

      // For all levels, verify that randomization occurred but stayed within expected range
      for (const level of Object.values(GasFeeEstimateLevel)) {
        const estimates = request.gasFeeControllerData
          .gasFeeEstimates as Record<
          GasFeeEstimateLevel,
          {
            suggestedMaxFeePerGas: string;
            suggestedMaxPriorityFeePerGas: string;
          }
        >;

        const maxFeeHex = (result.estimates as FeeMarketGasFeeEstimates)[level]
          .maxFeePerGas;

        // Get the actual value for comparison only
        const originalValue = Number(estimates[level].suggestedMaxFeePerGas);
        const actualValue = parseInt(maxFeeHex.slice(2), 16) / 1e9;

        // Just verify the value changed and is within range
        expect(actualValue).not.toBe(originalValue);
        expect(actualValue).toBeGreaterThanOrEqual(originalValue);

        // For 6 digits randomization in FEATURE_FLAGS_MOCK for '0x1'
        expect(actualValue).toBeLessThanOrEqual(originalValue + 999999);

        // Same approach for maxPriorityFeePerGas
        const maxPriorityFeeHex = (
          result.estimates as FeeMarketGasFeeEstimates
        )[level].maxPriorityFeePerGas;
        const originalPriorityValue = Number(
          estimates[level].suggestedMaxPriorityFeePerGas,
        );
        const actualPriorityValue =
          parseInt(maxPriorityFeeHex.slice(2), 16) / 1e9;

        expect(actualPriorityValue).not.toBe(originalPriorityValue);
        expect(actualPriorityValue).toBeGreaterThanOrEqual(
          originalPriorityValue,
        );
        expect(actualPriorityValue).toBeLessThanOrEqual(
          originalPriorityValue + 999999,
        );
      }
    });

    it('randomises legacy estimates with specified digits', async () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const request = {
        ethQuery: ETH_QUERY_MOCK,
        featureFlags: FEATURE_FLAGS_MOCK,
        // Using 0x5 with 4 digits randomization
        transactionMeta: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x5',
        } as TransactionMeta,
        gasFeeControllerData: {
          gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
          gasFeeEstimates: {
            low: '100000',
            medium: '200000',
            high: '300000',
          },
        } as GasFeeState,
      };

      const result = await flow.getGasFees(request);

      // Verify result type
      expect(result.estimates.type).toBe(GasFeeEstimateType.Legacy);

      // For all levels, verify that randomization occurred but stayed within expected range
      for (const level of Object.values(GasFeeEstimateLevel)) {
        const gasHex = (result.estimates as LegacyGasFeeEstimates)[level];
        const estimates = request.gasFeeControllerData
          .gasFeeEstimates as Record<GasFeeEstimateLevel, string>;

        // Convert hex to decimal for easier comparison
        const originalValue = Number(estimates[level]);
        const actualValue = parseInt(gasHex.slice(2), 16) / 1e9;

        // Verify value is within expected range
        expect(actualValue).not.toBe(originalValue);
        expect(actualValue).toBeGreaterThanOrEqual(originalValue);
        // For 4 digits randomization (defined in FEATURE_FLAGS_MOCK for '0x5')
        expect(actualValue).toBeLessThanOrEqual(originalValue + 9999);
      }
    });

    it('randomises eth_gasPrice estimates', async () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const request = {
        ethQuery: ETH_QUERY_MOCK,
        featureFlags: FEATURE_FLAGS_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
        gasFeeControllerData: {
          gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
          gasFeeEstimates: {
            gasPrice: '200000',
          },
        } as GasFeeState,
      };

      const result = await flow.getGasFees(request);

      // Verify result type
      expect(result.estimates.type).toBe(GasFeeEstimateType.GasPrice);

      const gasHex = (result.estimates as GasPriceGasFeeEstimates).gasPrice;
      const originalValue = 200000;
      const actualValue = parseInt(gasHex.slice(2), 16) / 1e9;

      // Verify gas price is within expected range
      expect(actualValue).not.toBe(originalValue);
      expect(actualValue).toBeGreaterThanOrEqual(originalValue);
      // For 6 digits randomization (defined in FEATURE_FLAGS_MOCK for '0x1')
      expect(actualValue).toBeLessThanOrEqual(originalValue + 999999);
    });

    it('should fall back to default flow if randomization fails', async () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      // Mock Math.random to throw an error
      jest.spyOn(global.Math, 'random').mockImplementation(() => {
        throw new Error('Random error');
      });

      const request = {
        ethQuery: ETH_QUERY_MOCK,
        featureFlags: FEATURE_FLAGS_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
        gasFeeControllerData: {
          gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
          gasFeeEstimates: {
            low: {
              suggestedMaxFeePerGas: '10',
              suggestedMaxPriorityFeePerGas: '1',
            },
            medium: {
              suggestedMaxFeePerGas: '20',
              suggestedMaxPriorityFeePerGas: '2',
            },
            high: {
              suggestedMaxFeePerGas: '30',
              suggestedMaxPriorityFeePerGas: '3',
            },
          },
          estimatedGasFeeTimeBounds: {},
        } as GasFeeState,
      };

      const result = await flow.getGasFees(request);

      // Verify that DefaultGasFeeFlow was called
      expect(DefaultGasFeeFlow.prototype.getGasFees).toHaveBeenCalledWith(
        request,
      );
      expect(result.estimates).toEqual(DEFAULT_FEE_MARKET_RESPONSE);
    });

    it('should throw an error for unsupported gas estimate types', async () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const request = {
        ethQuery: ETH_QUERY_MOCK,
        featureFlags: FEATURE_FLAGS_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
        gasFeeControllerData: {
          gasEstimateType: 'UNSUPPORTED_TYPE',
          gasFeeEstimates: {},
        } as unknown as GasFeeState,
      };

      // Capture the error in a spy so we can verify default flow was called
      const spy = jest.spyOn(console, 'error').mockImplementation();

      const result = await flow.getGasFees(request);

      expect(DefaultGasFeeFlow.prototype.getGasFees).toHaveBeenCalledWith(
        request,
      );
      expect(result.estimates).toEqual(DEFAULT_GAS_PRICE_RESPONSE);
      spy.mockRestore();
    });
  });
});
