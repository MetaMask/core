import { AccountWalletType } from '@metamask/account-api';
import type { AccountWalletId } from '@metamask/account-api';

import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountTreeControllerState } from '../../types';
import type { AccountWalletEntropyObject } from '../../wallet';
import type { BackupAndSyncContext } from '../types';

/**
 * Gets all local entropy wallets that can be synced.
 *
 * @param context - The backup and sync context.
 * @returns Array of entropy wallet objects.
 */
export function getLocalEntropyWallets(
  context: BackupAndSyncContext,
): AccountWalletEntropyObject[] {
  return Object.values(context.controller.state.accountTree.wallets).filter(
    (wallet) => wallet.type === AccountWalletType.Entropy,
  );
}

/**
 * Gets all groups for a specific entropy wallet.
 *
 * @param context - The backup and sync context.
 * @param walletId - The wallet ID to get groups for.
 * @returns Array of multichain account group objects.
 */
export function getLocalGroupsForEntropyWallet(
  context: BackupAndSyncContext,
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
 * Captures all the state that needs to be restored in case of sync failures.
 */
export type StateSnapshot = {
  accountGroupsMetadata: AccountTreeControllerState['accountGroupsMetadata'];
  accountWalletsMetadata: AccountTreeControllerState['accountWalletsMetadata'];
  selectedAccountGroup: AccountTreeControllerState['accountTree']['selectedAccountGroup'];
  accountTreeWallets: AccountTreeControllerState['accountTree']['wallets'];
};

/**
 * Creates a snapshot of the current controller state for rollback purposes.
 * Captures all state including the account tree structure.
 *
 * @param context - The backup and sync context containing controller and messenger.
 * @returns A deep copy of relevant state that can be restored later.
 */
export function createStateSnapshot(
  context: BackupAndSyncContext,
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
    accountTreeWallets: JSON.parse(
      JSON.stringify(context.controller.state.accountTree.wallets),
    ),
  };
}

/**
 * Restores state using an update callback.
 * Restores both persisted metadata and the complete account tree structure.
 * Uses the controller's init() method to rebuild internal maps correctly.
 *
 * @param context - The backup and sync context containing controller and messenger.
 * @param snapshot - The state snapshot to restore.
 */
export function restoreStateFromSnapshot(
  context: BackupAndSyncContext,
  snapshot: StateSnapshot,
): void {
  context.controllerStateUpdateFn((state) => {
    state.accountGroupsMetadata = snapshot.accountGroupsMetadata;
    state.accountWalletsMetadata = snapshot.accountWalletsMetadata;
    state.accountTree.selectedAccountGroup = snapshot.selectedAccountGroup;
    state.accountTree.wallets = snapshot.accountTreeWallets;
  });

  // Use init() to rebuild the internal maps from the restored account tree state
  // This ensures that the internal maps (#accountIdToContext and #groupIdToWalletId)
  // are correctly synchronized with the restored account tree structure
  context.controller.init();
}
