import type { Hex } from '@metamask/utils';

import { ScrollLayer1GasFeeFlow } from './ScrollLayer1GasFeeFlow';
import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: CHAIN_IDS.OPTIMISM,
  networkClientId: 'testNetworkClientId',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
    gas: '0x1234',
  },
};

describe('ScrollLayer1GasFeeFlow', () => {
  class TestableScrollLayer1GasFeeFlow extends ScrollLayer1GasFeeFlow {
    exposeOracleAddress(chainId: Hex) {
      return super.getOracleAddressForChain(chainId);
    }

    exposeShouldSignTransaction() {
      return super.shouldSignTransaction();
    }
  }

  describe('matchesTransaction', () => {
    const messenger = {} as TransactionControllerMessenger;
    it.each([
      ['Scroll', CHAIN_IDS.SCROLL],
      ['Scroll Sepolia', CHAIN_IDS.SCROLL_SEPOLIA],
    ])('returns true if chain ID is %s', async (_title, chainId) => {
      const flow = new ScrollLayer1GasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId,
      };

      expect(
        await flow.matchesTransaction({
          transactionMeta: transaction,
          messenger,
        }),
      ).toBe(true);
    });
  });

  describe('configuration overrides', () => {
    it('uses the Scroll oracle contract address', () => {
      const flow = new TestableScrollLayer1GasFeeFlow();
      expect(flow.exposeOracleAddress(CHAIN_IDS.SCROLL)).toBe(
        '0x5300000000000000000000000000000000000002',
      );
    });

    it('requires signing requests before querying the oracle', () => {
      const flow = new TestableScrollLayer1GasFeeFlow();
      expect(flow.exposeShouldSignTransaction()).toBe(true);
    });
  });
});
