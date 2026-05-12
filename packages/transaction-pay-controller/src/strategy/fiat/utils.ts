import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../../types';
import { getFiatAssetPerTransactionType } from '../../utils/feature-flags';
import type { TransactionPayFiatAsset } from './constants';
import { FIAT_ASSET_ID_BY_TX_TYPE } from './constants';

export function deriveFiatAssetForFiatPayment(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayFiatAsset {
  const txType = resolveTransactionType(transaction);

  return getFiatAssetPerTransactionType(messenger, txType);
}

function resolveTransactionType(
  transaction: TransactionMeta,
): TransactionType | undefined {
  if (transaction.type !== TransactionType.batch) {
    return transaction.type;
  }

  return transaction.nestedTransactions?.find(
    (tx) => tx.type && FIAT_ASSET_ID_BY_TX_TYPE[tx.type] !== undefined,
  )?.type;
}
