import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import { deriveFiatAssetForFiatPayment, pickBestFiatQuote } from './fiat';
import { MMPAY_FIAT_ASSET_ID_BY_TX_TYPE } from '../constants';
import type { FiatQuotesResponse } from '../strategy/fiat/types';

describe('Fiat Utils', () => {
  describe('deriveFiatAssetForFiatPayment', () => {
    it('returns mapped fiat asset for direct transaction type', () => {
      const transaction = {
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction);

      expect(result).toStrictEqual(
        MMPAY_FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.predictDeposit],
      );
    });

    it('returns mapped fiat asset for first nested transaction in batch', () => {
      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDeposit }],
        type: TransactionType.batch,
      } as TransactionMeta;

      const result = deriveFiatAssetForFiatPayment(transaction);

      expect(result).toStrictEqual(
        MMPAY_FIAT_ASSET_ID_BY_TX_TYPE[TransactionType.perpsDeposit],
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

  describe('pickBestFiatQuote', () => {
    it('returns transak-native-staging quote when present', () => {
      const quotes = {
        customActions: [],
        error: [],
        sorted: [],
        success: [
          {
            provider: '/providers/moonpay',
            quote: { amountIn: 10, amountOut: 20, paymentMethod: 'card' },
          },
          {
            provider: '/providers/transak-native-staging',
            quote: { amountIn: 11, amountOut: 22, paymentMethod: 'card' },
          },
        ],
      } as FiatQuotesResponse;

      const result = pickBestFiatQuote(quotes);

      expect(result).toStrictEqual(quotes.success[1]);
    });

    it('returns undefined when transak-native-staging quote is missing', () => {
      const quotes = {
        customActions: [],
        error: [],
        sorted: [],
        success: [
          {
            provider: '/providers/moonpay',
            quote: { amountIn: 10, amountOut: 20, paymentMethod: 'card' },
          },
        ],
      } as FiatQuotesResponse;

      const result = pickBestFiatQuote(quotes);

      expect(result).toBeUndefined();
    });
  });
});
