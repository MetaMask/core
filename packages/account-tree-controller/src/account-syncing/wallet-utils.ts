import { AccountWalletType } from '@metamask/account-api';
import type { AccountWalletId } from '@metamask/account-api';

import type { AccountSyncingContext } from './types';
import type { AccountGroupMultichainAccountObject } from '../group';
import type { AccountWalletEntropyObject } from '../wallet';

/**
 * Gets all local entropy wallets that can be synced.
 *
 * @param context - The account syncing context.
 * @returns Array of entropy wallet objects.
 */
export function getLocalEntropyWallets(
  context: AccountSyncingContext,
): AccountWalletEntropyObject[] {
  return Object.values(context.controller.state.accountTree.wallets).filter(
    (wallet) => wallet.type === AccountWalletType.Entropy,
  );
}

/**
 * Gets all groups for a specific entropy wallet.
 *
 * @param context - The account syncing context.
 * @param walletId - The wallet ID to get groups for.
 * @returns Array of multichain account group objects.
 */
export function getLocalGroupsForEntropyWallet(
  context: AccountSyncingContext,
  walletId: AccountWalletId,
): AccountGroupMultichainAccountObject[] {
  const wallet = context.controller.state.accountTree.wallets[walletId];
  if (!wallet || wallet.type !== AccountWalletType.Entropy) {
    console.warn(`Wallet ${walletId} not found or is not an entropy wallet`);
    return [];
  }

  return Object.values(wallet.groups);
}
