import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { FeeMarketGasFeeEstimates } from '@metamask/transaction-controller';
import { GasFeeEstimateLevel } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import { getTxGasEstimates } from './gas';

describe('gas calculation utils', () => {
  describe('getTxGasEstimates', () => {
    it('should return gas fee estimates with baseAndPriorityFeePerGas when maxPriorityFeePerGas is provided', () => {
      // Mock data
      const mockTxGasFeeEstimates = {
        type: 'fee-market',
        [GasFeeEstimateLevel.Low]: {
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        },
        [GasFeeEstimateLevel.Medium]: {
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        },
        [GasFeeEstimateLevel.High]: {
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        },
      } as FeeMarketGasFeeEstimates;

      const mockNetworkGasFeeEstimates = {
        estimatedBaseFee: '0.00000001',
      } as GasFeeState['gasFeeEstimates'];

      // Call the function
      const result = getTxGasEstimates({
        txGasFeeEstimates: mockTxGasFeeEstimates,
        networkGasFeeEstimates: mockNetworkGasFeeEstimates,
      });

      // Verify the result
      expect(result).toStrictEqual({
        baseAndPriorityFeePerGas: new BigNumber('0.00000001', 10)
          .times(10 ** 9)
          .plus('0x1234567890', 16),
        maxFeePerGas: '0x1234567890',
        maxPriorityFeePerGas: '0x1234567890',
      });
    });

    it('should handle missing high property in txGasFeeEstimates', () => {
      // Mock data
      const mockTxGasFeeEstimates = {} as FeeMarketGasFeeEstimates;

      const mockNetworkGasFeeEstimates = {
        estimatedBaseFee: '0.00000001',
      } as GasFeeState['gasFeeEstimates'];

      // Call the function
      const result = getTxGasEstimates({
        txGasFeeEstimates: mockTxGasFeeEstimates,
        networkGasFeeEstimates: mockNetworkGasFeeEstimates,
      });

      // Verify the result
      expect(result).toStrictEqual({
        baseAndPriorityFeePerGas: undefined,
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
      });
    });

    it('should use default estimatedBaseFee when not provided in networkGasFeeEstimates', () => {
      // Mock data
      const mockTxGasFeeEstimates = {
        type: 'fee-market',
        [GasFeeEstimateLevel.Low]: {
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        },
        [GasFeeEstimateLevel.Medium]: {
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        },
        [GasFeeEstimateLevel.High]: {
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        },
      } as FeeMarketGasFeeEstimates;

      const mockNetworkGasFeeEstimates = {} as GasFeeState['gasFeeEstimates'];

      // Call the function
      const result = getTxGasEstimates({
        txGasFeeEstimates: mockTxGasFeeEstimates,
        networkGasFeeEstimates: mockNetworkGasFeeEstimates,
      });

      // Verify the result
      expect(result).toStrictEqual({
        baseAndPriorityFeePerGas: new BigNumber('0', 10)
          .times(10 ** 9)
          .plus('0x1234567890', 16),
        maxFeePerGas: '0x1234567890',
        maxPriorityFeePerGas: '0x1234567890',
      });
    });
  });
});
