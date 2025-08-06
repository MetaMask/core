import type { AccountSyncingContext } from './types';
import type { AccountTreeControllerState } from '../types';

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
