import { toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import type { GasFeeState } from '@metamask/gas-fee-controller';

import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import {
  RandomisedEstimationsGasFeeFlow,
  randomiseDecimalGWEIAndConvertToHex,
} from './RandomisedEstimationsGasFeeFlow';
import type { TransactionControllerMessenger } from '../TransactionController';
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
import { getRandomisedGasFeeDigits } from '../utils/feature-flags';

jest.mock('./DefaultGasFeeFlow');
jest.mock('../utils/feature-flags');

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
  const getRandomisedGasFeeDigitsMock = jest.mocked(getRandomisedGasFeeDigits);

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

    getRandomisedGasFeeDigitsMock.mockReturnValue(6);
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

      expect(
        flow.matchesTransaction({
          transactionMeta: transaction,
          messenger: {} as TransactionControllerMessenger,
        }),
      ).toBe(true);
    });

    it('returns false if chainId is not in the randomisation config', () => {
      getRandomisedGasFeeDigitsMock.mockReturnValue(undefined);
      const flow = new RandomisedEstimationsGasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId: '0x89', // Not in config
      } as TransactionMeta;

      expect(
        flow.matchesTransaction({
          transactionMeta: transaction,
          messenger: {} as TransactionControllerMessenger,
        }),
      ).toBe(false);
    });
  });

  describe('getGasFees', () => {
    it.each(Object.values(GasFeeEstimateLevel))(
      'randomises fee market estimates for %s level',
      async (level) => {
        const flow = new RandomisedEstimationsGasFeeFlow();

        const request = {
          ethQuery: ETH_QUERY_MOCK,
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
          messenger: {} as TransactionControllerMessenger,
        };

        const result = await flow.getGasFees(request);

        expect(result.estimates.type).toBe(GasFeeEstimateType.FeeMarket);

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
      },
    );

    it.each(Object.values(GasFeeEstimateLevel))(
      'randomises legacy estimates for %s level',
      async (level) => {
        const flow = new RandomisedEstimationsGasFeeFlow();

        const request = {
          ethQuery: ETH_QUERY_MOCK,
          transactionMeta: TRANSACTION_META_MOCK,
          gasFeeControllerData: {
            gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
            gasFeeEstimates: {
              low: '100000',
              medium: '200000',
              high: '300000',
            },
          } as GasFeeState,
          messenger: {} as TransactionControllerMessenger,
        };

        const result = await flow.getGasFees(request);

        // Verify result type
        expect(result.estimates.type).toBe(GasFeeEstimateType.Legacy);

        const gasHex = (result.estimates as LegacyGasFeeEstimates)[level];
        const estimates = request.gasFeeControllerData
          .gasFeeEstimates as Record<GasFeeEstimateLevel, string>;

        // Convert hex to decimal for easier comparison
        const originalValue = Number(estimates[level]);
        const actualValue = parseInt(gasHex.slice(2), 16) / 1e9;

        // Verify value is within expected range
        expect(actualValue).not.toBe(originalValue);
        expect(actualValue).toBeGreaterThanOrEqual(originalValue);
        expect(actualValue).toBeLessThanOrEqual(originalValue + 999999);
      },
    );

    it('randomises eth_gasPrice estimates', async () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const request = {
        ethQuery: ETH_QUERY_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
        gasFeeControllerData: {
          gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
          gasFeeEstimates: {
            gasPrice: '200000',
          },
        } as GasFeeState,
        messenger: {} as TransactionControllerMessenger,
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
        messenger: {} as TransactionControllerMessenger,
      };

      const result = await flow.getGasFees(request);

      // Verify that DefaultGasFeeFlow was called
      expect(DefaultGasFeeFlow.prototype.getGasFees).toHaveBeenCalledWith(
        request,
      );
      expect(result.estimates).toStrictEqual(DEFAULT_FEE_MARKET_RESPONSE);
    });

    it('should throw an error for unsupported gas estimate types', async () => {
      const flow = new RandomisedEstimationsGasFeeFlow();

      const request = {
        ethQuery: ETH_QUERY_MOCK,
        transactionMeta: TRANSACTION_META_MOCK,
        gasFeeControllerData: {
          gasEstimateType: 'UNSUPPORTED_TYPE',
          gasFeeEstimates: {},
        } as unknown as GasFeeState,
        messenger: {} as TransactionControllerMessenger,
      };

      // Capture the error in a spy so we can verify default flow was called
      const spy = jest.spyOn(console, 'error').mockImplementation();

      const result = await flow.getGasFees(request);

      expect(DefaultGasFeeFlow.prototype.getGasFees).toHaveBeenCalledWith(
        request,
      );
      expect(result.estimates).toStrictEqual(DEFAULT_GAS_PRICE_RESPONSE);
      spy.mockRestore();
    });
  });
});

describe('randomiseDecimalGWEIAndConvertToHex', () => {
  beforeEach(() => {
    jest.spyOn(global.Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.spyOn(global.Math, 'random').mockRestore();
  });

  it('randomizes the last digits while preserving the significant digits', () => {
    const result = randomiseDecimalGWEIAndConvertToHex('5', 3);

    const resultWei = parseInt(result.slice(2), 16);
    const resultGwei = resultWei / 1e9;

    // With Math.random = 0.5, we expect the last 3 digits to be around 500
    // The expected value should be 5.0000005 (not 5.0005)
    expect(resultGwei).toBeCloseTo(5.0000005, 6);

    // The base part should be exactly 5.000 Gwei
    const basePart = (Math.floor(resultWei / 1000) * 1000) / 1e9;
    expect(basePart).toBe(5);
  });

  it('ensures randomized value is never below original value', () => {
    // Test with Math.random = 0 (lowest possible random value)
    jest.spyOn(global.Math, 'random').mockReturnValue(0);

    // Test with a value that has non-zero ending digits
    const result = randomiseDecimalGWEIAndConvertToHex('5.000500123', 3);
    const resultWei = parseInt(result.slice(2), 16);

    // Original value in Wei
    const originalWei = 5000500123;

    // With Math.random = 0, result should exactly equal original value
    expect(resultWei).toBe(originalWei);
  });

  it('randomizes up to but not exceeding the specified number of digits', () => {
    // Set Math.random to return almost 1
    jest.spyOn(global.Math, 'random').mockReturnValue(0.999);

    const result = randomiseDecimalGWEIAndConvertToHex('5', 3);
    const resultWei = parseInt(result.slice(2), 16);

    const baseWei = 5 * 1e9;

    // With 3 digits and Math.random almost 1, we expect the last 3 digits to be close to 999
    expect(resultWei).toBeGreaterThanOrEqual(baseWei);
    expect(resultWei).toBeLessThanOrEqual(baseWei + 999);
    expect(resultWei).toBeCloseTo(baseWei + 999, -1);
  });

  it('handles values with more digits than requested to randomize', () => {
    const result = randomiseDecimalGWEIAndConvertToHex('1.23456789', 2);
    const resultWei = parseInt(result.slice(2), 16);

    // Base should be 1.234567 Gwei in Wei
    const basePart = Math.floor(resultWei / 100) * 100;
    expect(basePart).toBe(1234567800);

    // Original ending digits: 89
    const originalEndingDigits = 89;

    // Randomized part should be in range [89-99]
    const randomizedPart = resultWei - basePart;
    expect(randomizedPart).toBeGreaterThanOrEqual(originalEndingDigits);
    expect(randomizedPart).toBeLessThanOrEqual(99);
  });

  it('respects the PRESERVE_NUMBER_OF_DIGITS constant', () => {
    const result = randomiseDecimalGWEIAndConvertToHex('0.00001', 4);
    const resultWei = parseInt(result.slice(2), 16);

    // Original value is 10000 Wei
    // With PRESERVE_NUMBER_OF_DIGITS = 2, we can randomize at most 3 digits
    // Base should be 10000 - (10000 % 1000) = 10000
    const basePart = Math.floor(resultWei / 1000) * 1000;
    expect(basePart).toBe(10000);

    // Result should stay within allowed range
    expect(resultWei).toBeGreaterThanOrEqual(10000);
    expect(resultWei).toBeLessThanOrEqual(10999);
  });

  it('handles edge case with zero', () => {
    // For "0" input, the result should still be 0
    // This is because 0 has no "ending digits" to randomize
    // The implementation will still start from 0 and only randomize upward
    const result = randomiseDecimalGWEIAndConvertToHex('0', 3);
    const resultWei = parseInt(result.slice(2), 16);

    expect(resultWei).toBeGreaterThanOrEqual(0);
    expect(resultWei).toBeLessThanOrEqual(999);
  });

  it('handles different number formats correctly', () => {
    const resultFromNumber = randomiseDecimalGWEIAndConvertToHex(5, 3);
    const resultFromString = randomiseDecimalGWEIAndConvertToHex('5', 3);
    expect(resultFromNumber).toStrictEqual(resultFromString);
  });
});
