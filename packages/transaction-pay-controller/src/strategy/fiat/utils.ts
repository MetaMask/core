import {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';

import { FIAT_ASSET_ID_BY_TX_TYPE, TransactionPayFiatAsset } from './constants';

export function deriveFiatAssetForFiatPayment(
  transaction: TransactionMeta,
): TransactionPayFiatAsset | undefined {
  const transactionType = transaction?.type;

  if (transactionType === TransactionType.batch) {
    const firstMatchingType = transaction.nestedTransactions?.[0]?.type;
    if (firstMatchingType) {
      return FIAT_ASSET_ID_BY_TX_TYPE[firstMatchingType];
    }
  }

  return FIAT_ASSET_ID_BY_TX_TYPE[transactionType as TransactionType];
}
