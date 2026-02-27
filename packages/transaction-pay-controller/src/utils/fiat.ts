import {
  TransactionType,
  TransactionMeta,
} from '@metamask/transaction-controller';

import { MMPAY_FIAT_ASSET_ID_BY_TX_TYPE } from '../constants';

export function deriveFiatAssetIdForFiatPayment(
  transaction: TransactionMeta,
): string | undefined {
  const transactionType = transaction?.type;

  if (transactionType === TransactionType.batch) {
    const firstMatchingType = transaction.nestedTransactions?.[0]?.type;
    if (firstMatchingType) {
      return MMPAY_FIAT_ASSET_ID_BY_TX_TYPE[firstMatchingType];
    }
  }

  return MMPAY_FIAT_ASSET_ID_BY_TX_TYPE[transactionType as TransactionType];
}
