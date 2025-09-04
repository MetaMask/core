import type { GasFeeEstimates } from '@metamask/gas-fee-controller';
import type {
  FeeMarketGasFeeEstimates,
  TransactionController,
} from '@metamask/transaction-controller';

import {
  generateActionId,
  getTransaction1559GasFeeEstimates,
  getTxGasEstimates,
} from './utils';

describe('utils', () => {
  describe('generateActionId', () => {
    it('returns a deterministic string when time and random are mocked', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const randomSpy = jest
        .spyOn(global.Math, 'random')
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.2);

      const id1 = generateActionId();
      const id2 = generateActionId();

      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).toBe('1700000000000.1');
      expect(id2).toBe('1700000000000.2');

      nowSpy.mockRestore();
      randomSpy.mockRestore();
    });

    it('generates different values for subsequent calls (sanity)', () => {
      const a = generateActionId();
      const b = generateActionId();
      expect(a).not.toBe(b);
    });
  });

  describe('getTransaction1559GasFeeEstimates', () => {
    it('computes baseAndPriorityFeePerGas when maxPriorityFeePerGas is provided', () => {
      const input = {
        high: {
          maxFeePerGas: '0x5208',
          maxPriorityFeePerGas: 'a',
        },
      } as unknown as FeeMarketGasFeeEstimates;

      const estimates = getTransaction1559GasFeeEstimates(input, '2');

      expect(estimates.maxFeePerGas).toBe('0x5208');
      expect(estimates.maxPriorityFeePerGas).toBe('a');
      // 2 gwei -> 2e9 wei, plus 10 (priority) = 2000000010
      expect(estimates.baseAndPriorityFeePerGas?.toString()).toBe('2000000010');
    });

    it('returns undefined baseAndPriorityFeePerGas when maxPriorityFeePerGas is missing', () => {
      const input = {
        high: undefined,
      } as unknown as FeeMarketGasFeeEstimates;

      const estimates = getTransaction1559GasFeeEstimates(input, '1');

      expect(estimates.maxPriorityFeePerGas).toBeUndefined();
      expect(estimates.baseAndPriorityFeePerGas).toBeUndefined();
    });
  });

  describe('getTxGasEstimates', () => {
    it('derives estimates using provided tx and network fee data', () => {
      type EstimateReturn = Awaited<
        ReturnType<TransactionController['estimateGasFee']>
      >['estimates'];

      const txGasFeeEstimates = {
        high: {
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: 'a', // 10 (hex)
        },
      } as unknown as EstimateReturn;

      const networkGasFeeEstimates = {
        estimatedBaseFee: '3', // 3 gwei -> 3e9 wei
      } as unknown as GasFeeEstimates;

      const result = getTxGasEstimates({
        txGasFeeEstimates,
        networkGasFeeEstimates,
      });

      expect(result.maxFeePerGas).toBe('0x2');
      expect(result.maxPriorityFeePerGas).toBe('a');
      // 3e9 + 10
      expect(result.baseAndPriorityFeePerGas?.toString()).toBe('3000000010');
    });

    it('defaults estimatedBaseFee to 0 when missing', () => {
      type EstimateReturn = Awaited<
        ReturnType<TransactionController['estimateGasFee']>
      >['estimates'];

      const txGasFeeEstimates = {
        high: {
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: 'a',
        },
      } as unknown as EstimateReturn;

      const networkGasFeeEstimates = {} as unknown as GasFeeEstimates;

      const result = getTxGasEstimates({
        txGasFeeEstimates,
        networkGasFeeEstimates,
      });

      // base=0 gwei -> 0 wei; 0 + 10 = 10
      expect(result.baseAndPriorityFeePerGas?.toString()).toBe('10');
      expect(result.maxFeePerGas).toBe('0x2');
      expect(result.maxPriorityFeePerGas).toBe('a');
    });
  });
});
