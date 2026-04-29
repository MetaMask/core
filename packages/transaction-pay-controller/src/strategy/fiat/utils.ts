import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../../types';
import { getFiatAssetPerTransactionType } from '../../utils/feature-flags';
import type { TransactionPayFiatAsset } from './constants';
import { ETH_MAINNET_FIAT_ASSET, FIAT_ASSET_ID_BY_TX_TYPE } from './constants';

function resolveTransactionType(
  transaction: TransactionMeta,
): TransactionType | undefined {
  if (transaction.type === TransactionType.batch) {
    return transaction.nestedTransactions?.[0]?.type;
  }
  return transaction.type;
}

export function deriveFiatAssetForFiatPayment(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayFiatAsset {
  const txType = resolveTransactionType(transaction);

  if (txType) {
    const flagAsset = getFiatAssetPerTransactionType(messenger, txType);
    if (flagAsset) {
      return flagAsset;
    }

    const hardcodedAsset = FIAT_ASSET_ID_BY_TX_TYPE[txType];
    if (hardcodedAsset) {
      return hardcodedAsset;
    }
  }

  return ETH_MAINNET_FIAT_ASSET;
}
