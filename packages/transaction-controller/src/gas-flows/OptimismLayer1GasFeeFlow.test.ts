import { CHAIN_IDS } from '../constants';
import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { OptimismLayer1GasFeeFlow } from './OptimismLayer1GasFeeFlow';

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: CHAIN_IDS.OPTIMISM,
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
    gas: '0x1234',
  },
};

describe('OptimismLayer1GasFeeFlow', () => {
  describe('matchesTransaction', () => {
    it.each([
      ['Optimisim mainnet', CHAIN_IDS.OPTIMISM],
      ['Optimisim testnet', CHAIN_IDS.OPTIMISM_TESTNET],
    ])('returns true if chain ID is %s', (_title, chainId) => {
      const flow = new OptimismLayer1GasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId,
      };

      expect(flow.matchesTransaction(transaction)).toBe(true);
    });
  });
});
