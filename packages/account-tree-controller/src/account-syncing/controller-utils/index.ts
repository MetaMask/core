import { AccountWalletType } from '@metamask/account-api';
import type { AccountWalletId } from '@metamask/account-api';

import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountTreeControllerState } from '../../types';
import type { AccountWalletEntropyObject } from '../../wallet';
import type { AccountSyncingContext } from '../types';

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
    if (context.enableDebugLogging) {
      console.warn(`Wallet ${walletId} not found or is not an entropy wallet`);
    }
    return [];
  }

  return Object.values(wallet.groups);
}

/**
 * State snapshot type for rollback operations.
 */
export type StateSnapshot = {
  accountGroupsMetadata: AccountTreeControllerState['accountGroupsMetadata'];
  accountWalletsMetadata: AccountTreeControllerState['accountWalletsMetadata'];
  selectedAccountGroup: AccountTreeControllerState['accountTree']['selectedAccountGroup'];
};

/**
 * Creates a snapshot of the current controller state for rollback purposes.
 *
 * @param context - The account syncing context containing controller and messenger.
 * @returns A deep copy of relevant state that can be restored later.
 */
export function createStateSnapshot(
  context: AccountSyncingContext,
): StateSnapshot {
  return {
    accountGroupsMetadata: JSON.parse(
      JSON.stringify(context.controller.state.accountGroupsMetadata),
    ),
    accountWalletsMetadata: JSON.parse(
      JSON.stringify(context.controller.state.accountWalletsMetadata),
    ),
    selectedAccountGroup:
      context.controller.state.accountTree.selectedAccountGroup,
  };
}

/**
 * Restores state using an update callback.
 *
 * @param context - The account syncing context containing controller and messenger.
 * @param snapshot - The state snapshot to restore.
 */
export function restoreStateFromSnapshot(
  context: AccountSyncingContext,
  snapshot: StateSnapshot,
): void {
  context.controllerStateUpdateFn((state) => {
    state.accountGroupsMetadata = snapshot.accountGroupsMetadata;
    state.accountWalletsMetadata = snapshot.accountWalletsMetadata;
    state.accountTree.selectedAccountGroup = snapshot.selectedAccountGroup;
  });
}
