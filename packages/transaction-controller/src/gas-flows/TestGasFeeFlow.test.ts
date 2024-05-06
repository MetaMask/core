import {
  GasFeeEstimateType,
  type GasFeeFlowRequest,
  type TransactionMeta,
} from '../types';
import { TestGasFeeFlow } from './TestGasFeeFlow';

describe('TestGasFeeFlow', () => {
  describe('matchesTransaction', () => {
    it('should return true', () => {
      const testGasFeeFlow = new TestGasFeeFlow();
      const result = testGasFeeFlow.matchesTransaction({} as TransactionMeta);
      expect(result).toBe(true);
    });
  });

  describe('getGasFees', () => {
    it('returns estimates matching call count', async () => {
      const requestMock = {
        transactionMeta: {
          txParams: {
            gas: '0x2',
          },
        },
      } as GasFeeFlowRequest;

      const testGasFeeFlow = new TestGasFeeFlow();

      await testGasFeeFlow.getGasFees(requestMock);
      await testGasFeeFlow.getGasFees(requestMock);
      const result = await testGasFeeFlow.getGasFees(requestMock);

      expect(result.estimates).toStrictEqual({
        type: GasFeeEstimateType.FeeMarket,
        low: {
          maxFeePerGas: '0x6379da05b6000',
          maxPriorityFeePerGas: '0x470de4df82000',
        },
        medium: {
          maxFeePerGas: '0x71afd498d0000',
          maxPriorityFeePerGas: '0x5543df729c000',
        },
        high: {
          maxFeePerGas: '0x7fe5cf2bea000',
          maxPriorityFeePerGas: '0x6379da05b6000',
        },
      });
    });

    it('throws if transaction has no gas', async () => {
      const requestMock = {
        transactionMeta: {
          txParams: {},
        },
      } as GasFeeFlowRequest;

      const testGasFeeFlow = new TestGasFeeFlow();

      await expect(testGasFeeFlow.getGasFees(requestMock)).rejects.toThrow(
        'Cannot estimate fee without gas value',
      );
    });
  });
});
