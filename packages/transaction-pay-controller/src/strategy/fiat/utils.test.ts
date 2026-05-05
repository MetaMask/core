import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import { FIAT_ASSET_ID_BY_TX_TYPE } from './constants';
import { deriveFiatAssetForFiatPayment } from './utils';

describe('Fiat Utils', () => {
  describe('deriveFiatAssetForFiatPayment', () => {
    it('returns mapped fiat asset for direct transaction type', () => {
      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.predictDeposit],
      );
    });

    it('returns mapped fiat asset for first nested transaction in batch', () => {
      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDeposit }],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction);

      expect(result).toStrictEqual(
        FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
      );
    });

    it('returns undefined for unsupported type', () => {
      const transaction = {
        type: TransactionType.contractInteraction,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction);

      expect(result).toBeUndefined();
    });
  });
});
