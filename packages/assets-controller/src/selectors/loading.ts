import type { AccountTreeControllerState } from '@metamask/account-tree-controller';

import type { AssetsControllerState } from '../AssetsController.js';
import type { AccountId, AssetsLoadingStatus } from '../types.js';
import { getAccountIdsForGroup } from './balance.js';

/**
 * Get the loading status for a single account.
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns `'loading'` while the account's assets are loading, `'loaded'`
 * after its fetch has settled, or `undefined` if no fetch was triggered.
 */
export function getAccountLoadingStatus(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountId: AccountId,
): AssetsLoadingStatus | undefined {
  return state.assetsLoadingStatus[accountId];
}

/**
 * Check whether an account's assets are currently loading.
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns True while the account's assets are loading.
 */
export function isAccountLoading(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountId: AccountId,
): boolean {
  return getAccountLoadingStatus(state, accountId) === 'loading';
}

/**
 * Get the loading statuses for every account in an account group.
 *
 * @param state - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state slice.
 * @param groupId - The account group id.
 * @returns A record containing an entry for each account in the group that
 * has a loading status, keyed by account id.
 */
export function getAccountGroupLoadingStatus(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
): Record<AccountId, AssetsLoadingStatus> {
  const loadingStatus = state.assetsLoadingStatus;
  const result: Record<AccountId, AssetsLoadingStatus> = {};
  for (const accountId of getAccountIdsForGroup(accountTreeState, groupId)) {
    const status = loadingStatus[accountId];
    if (status !== undefined) {
      result[accountId] = status;
    }
  }
  return result;
}

/**
 * Check whether any account in an account group is currently loading.
 *
 * @param state - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state slice.
 * @param groupId - The account group id.
 * @returns True while at least one account in the group is loading.
 */
export function isAccountGroupLoading(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
): boolean {
  const loadingStatus = state.assetsLoadingStatus;
  return getAccountIdsForGroup(accountTreeState, groupId).some(
    (accountId) => loadingStatus[accountId] === 'loading',
  );
}

/**
 * Check whether the selected account group is currently loading its assets.
 *
 * @param state - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state slice.
 * @returns True while any account in the selected account group is loading.
 */
export function getIsAssetsLoadingForSelectedAccountGroup(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountTreeState: AccountTreeControllerState,
): boolean {
  const groupId = accountTreeState.selectedAccountGroup;
  if (!groupId) {
    return false;
  }
  return isAccountGroupLoading(state, accountTreeState, groupId);
}
