import { CHAIN_IDS } from '../constants';
import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { ScrollLayer1GasFeeFlow } from './ScrollLayer1GasFeeFlow';

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

describe('ScrollLayer1GasFeeFlow', () => {
  describe('matchesTransaction', () => {
    it.each([
      ['Scroll', CHAIN_IDS.SCROLL],
      ['Scroll Sepolia', CHAIN_IDS.SCROLL_SEPOLIA],
    ])('returns true if chain ID is %s', (_title, chainId) => {
      const flow = new ScrollLayer1GasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId,
      };

      expect(flow.matchesTransaction(transaction)).toBe(true);
    });
  });
});
