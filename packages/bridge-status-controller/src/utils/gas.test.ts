import {
  BRIDGE_PREFERRED_GAS_ESTIMATE,
  TxData,
} from '@metamask/bridge-controller';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { FeeMarketGasFeeEstimates } from '@metamask/transaction-controller';
import { GasFeeEstimateLevel } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import { calculateGasFees, getTxGasEstimates } from './transaction';

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

const mockMessengerCall = jest.fn();
const mockMessenger = { call: mockMessengerCall };

describe('gas calculation utils', () => {
  describe('getTxGasEstimates', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return gas fee estimates with baseAndPriorityFeePerGas when maxPriorityFeePerGas is provided', async () => {
      mockMessenger.call.mockReturnValueOnce({
        gasFeeEstimates: mockNetworkGasFeeEstimates,
      });
      mockMessenger.call.mockReturnValueOnce({
        estimates: mockTxGasFeeEstimates,
      });
      // Call the function
      const result = await getTxGasEstimates(mockMessenger, {
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

    it('should handle missing property in txGasFeeEstimates', async () => {
      mockMessenger.call.mockReturnValueOnce({
        gasFeeEstimates: {
          estimatedBaseFee: '0.00000001',
        } as GasFeeState['gasFeeEstimates'],
      });
      mockMessenger.call.mockReturnValueOnce({
        estimates: {},
      });

      const result = await getTxGasEstimates(mockMessenger);

      expect(result).toStrictEqual({
        baseAndPriorityFeePerGas: undefined,
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
      });
    });

    it('should use Bridge preferred gas estimate as gas estimates', async () => {
      const estimates = {
        type: 'fee-market',
        [GasFeeEstimateLevel.Low]: {
          maxFeePerGas: '0xLOW',
          maxPriorityFeePerGas: '0xLOW_PRIORITY',
        },
        [GasFeeEstimateLevel.Medium]: {
          maxFeePerGas: '0xMEDIUM',
          maxPriorityFeePerGas: '0xMEDIUM_PRIORITY',
        },
        [GasFeeEstimateLevel.High]: {
          maxFeePerGas: '0xHIGH',
          maxPriorityFeePerGas: '0xHIGH_PRIORITY',
        },
      } as FeeMarketGasFeeEstimates;

      mockMessenger.call.mockReturnValueOnce({
        gasFeeEstimates: mockNetworkGasFeeEstimates,
      });
      mockMessenger.call.mockReturnValueOnce({
        estimates,
      });

      const result = await getTxGasEstimates(mockMessenger, {
        txGasFeeEstimates: estimates,
        networkGasFeeEstimates: mockNetworkGasFeeEstimates,
      });

      expect(result.maxFeePerGas).toBe(
        estimates[BRIDGE_PREFERRED_GAS_ESTIMATE]?.maxFeePerGas,
      );
      expect(result.maxPriorityFeePerGas).toBe(
        estimates[BRIDGE_PREFERRED_GAS_ESTIMATE]?.maxPriorityFeePerGas,
      );
    });

    it('should use default estimatedBaseFee when not provided in networkGasFeeEstimates', async () => {
      // Mock data
      mockMessengerCall.mockClear();
      mockMessengerCall.mockReturnValueOnce({
        gasFeeEstimates: {},
      });
      mockMessengerCall.mockResolvedValueOnce({
        estimates: mockTxGasFeeEstimates,
      });

      // Call the function
      const result = await getTxGasEstimates(mockMessenger, {
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
    const mockTrade: TxData = {
      chainId: 1,
      gasLimit: 1231,
      to: '0x1',
      data: '0x1',
      from: '0x1',
      value: '0x1',
    };

    it('should return empty object if gas fields should be skipped (skipGasFields is true)', async () => {
      const result = await calculateGasFees(
        true,
        null as never,
        mockTrade,
        'mainnet',
        '0x1',
      );
      expect(result).toStrictEqual({});
    });

    it('should txFee when provided', async () => {
      const result = await calculateGasFees(
        false,
        null as never,
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
        mockCall.mockResolvedValueOnce({
          estimates: {
            [GasFeeEstimateLevel.Medium]: {
              maxFeePerGas: '0x1234567890',
              maxPriorityFeePerGas: '0x1234567890',
            },
          },
        });
        const result = await calculateGasFees(
          false,
          { call: mockCall } as never,
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
