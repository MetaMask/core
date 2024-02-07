import type { GasFeeFlow, TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { getGasFeeFlow } from './gas-flow';

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x123',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
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
});
