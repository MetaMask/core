import {
  TransactionType,
  TransactionMeta,
} from '@metamask/transaction-controller';

import {
  MMPAY_FIAT_ASSET_ID_BY_TX_TYPE,
  TransactionPayFiatAsset,
} from '../constants';
import { FiatQuotesResponse, FiatQuote } from '../strategy/fiat/types';

export function deriveFiatAssetForFiatPayment(
  transaction: TransactionMeta,
): TransactionPayFiatAsset | undefined {
  const transactionType = transaction?.type;

  if (transactionType === TransactionType.batch) {
    const firstMatchingType = transaction.nestedTransactions?.[0]?.type;
    if (firstMatchingType) {
      return MMPAY_FIAT_ASSET_ID_BY_TX_TYPE[firstMatchingType];
    }
  }

  return MMPAY_FIAT_ASSET_ID_BY_TX_TYPE[transactionType as TransactionType];
}

export function deriveFiatAssetIdForFiatPayment(
  transaction: TransactionMeta,
): string | undefined {
  return deriveFiatAssetForFiatPayment(transaction)?.caipAssetId;
}

export function pickBestFiatQuote(
  quotes: FiatQuotesResponse,
): FiatQuote | undefined {
  return quotes.success?.find(
    // Implement to find most reliable quote but return transak for now
    (quote) => quote.provider === '/providers/transak-native-staging',
  );
}
