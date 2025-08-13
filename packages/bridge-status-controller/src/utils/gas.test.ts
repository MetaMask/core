import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { FeeMarketGasFeeEstimates } from '@metamask/transaction-controller';
import { GasFeeEstimateLevel } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import { calculateGasFees, getTxGasEstimates } from './gas';

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

describe('gas calculation utils', () => {
  describe('getTxGasEstimates', () => {
    it('should return gas fee estimates with baseAndPriorityFeePerGas when maxPriorityFeePerGas is provided', () => {
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
      // Call the function
      const result = getTxGasEstimates({
        txGasFeeEstimates: {} as never,
        networkGasFeeEstimates: {
          estimatedBaseFee: '0.00000001',
        } as GasFeeState['gasFeeEstimates'],
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

      // Call the function
      const result = getTxGasEstimates({
        txGasFeeEstimates: mockTxGasFeeEstimates,
        networkGasFeeEstimates: {},
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

  describe('calculateGasFees', () => {
    const mockTrade = {
      chainId: 1,
      gasLimit: 1231,
      to: '0x1',
      data: '0x1',
      from: '0x1',
      value: '0x1',
    };

    it('should return empty object if 7702 is enabled (disable7702 is false)', async () => {
      const result = await calculateGasFees(
        false,
        null as never,
        jest.fn(),
        mockTrade,
        'mainnet',
        '0x1',
      );
      expect(result).toStrictEqual({});
    });

    it('should txFee when provided', async () => {
      const result = await calculateGasFees(
        true,
        null as never,
        jest.fn(),
        mockTrade,
        'mainnet',
        '0x1',
        {
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        },
      );
      expect(result).toStrictEqual({
        maxFeePerGas: '0x1234567890',
        maxPriorityFeePerGas: '0x1234567890',
        gas: '1231',
      });
    });

    it.each([
      {
        gasLimit: 1231,
        expectedGas: '0x4cf',
      },
      {
        gasLimit: null,
        expectedGas: '0x0',
      },
    ])(
      'should return $expectedGas if trade.gasLimit is $gasLimit',
      async ({ gasLimit, expectedGas }) => {
        const mockCall = jest.fn().mockReturnValueOnce({
          gasFeeEstimates: {
            estimatedBaseFee: '0x1234',
          },
        });
        const mockEstimateGasFeeFn = jest.fn().mockResolvedValueOnce({
          estimates: {
            [GasFeeEstimateLevel.High]: {
              maxFeePerGas: '0x1234567890',
              maxPriorityFeePerGas: '0x1234567890',
            },
          },
        });
        const result = await calculateGasFees(
          true,
          { call: mockCall } as never,
          mockEstimateGasFeeFn,
          { ...mockTrade, gasLimit },
          'mainnet',
          '0x1',
        );
        expect(result).toStrictEqual({
          gas: expectedGas,
          maxFeePerGas: '0x1234567890',
          maxPriorityFeePerGas: '0x1234567890',
        });
      },
    );
  });
});
