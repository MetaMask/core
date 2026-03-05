import type {
  Quote as RampsQuote,
  QuotesResponse as RampsQuotesResponse,
} from '@metamask/ramps-controller';
import {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';

import {
  MMPAY_FIAT_ASSET_ID_BY_TX_TYPE,
  TransactionPayFiatAsset,
} from '../constants';

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

export function pickBestFiatQuote(
  quotes: RampsQuotesResponse,
): RampsQuote | undefined {
  return quotes.success?.find(
    // TODO: Implement provider selection logic; force Transak staging for now.
    (quote) => quote.provider === '/providers/transak-native-staging',
  );
}
