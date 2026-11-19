import type { AccountTreeControllerState } from '@metamask/account-tree-controller';

import type { AssetsControllerState } from '../AssetsController.js';
import type { AccountId, AssetsLoadingStatus } from '../types.js';
import { getAccountIdsForGroup } from './balance.js';

/**
 * Collect the statuses for every account in an account group.
 *
 * @param statuses - The per-account statuses to read from.
 * @param accountTreeState - AccountTreeController state slice.
 * @param groupId - The account group id.
 * @returns A record with an entry for each account in the group that has a
 * status, keyed by account id.
 */
function collectGroupStatuses(
  statuses: Record<AccountId, AssetsLoadingStatus> | undefined,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
): Record<AccountId, AssetsLoadingStatus> {
  const result: Record<AccountId, AssetsLoadingStatus> = {};
  for (const accountId of getAccountIdsForGroup(accountTreeState, groupId)) {
    const status = statuses?.[accountId];
    if (status !== undefined) {
      result[accountId] = status;
    }
  }
  return result;
}

/**
 * Check whether any account in an account group is `'loading'`.
 *
 * @param statuses - The per-account statuses to read from.
 * @param accountTreeState - AccountTreeController state slice.
 * @param groupId - The account group id.
 * @returns True while at least one account in the group is loading.
 */
function isAnyGroupAccountLoading(
  statuses: Record<AccountId, AssetsLoadingStatus> | undefined,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
): boolean {
  return getAccountIdsForGroup(accountTreeState, groupId).some(
    (accountId) => statuses?.[accountId] === 'loading',
  );
}

/**
 * Check whether any account in the selected account group is `'loading'`.
 *
 * @param statuses - The per-account statuses to read from.
 * @param accountTreeState - AccountTreeController state slice.
 * @returns True while any account in the selected account group is loading.
 */
function isSelectedGroupLoading(
  statuses: Record<AccountId, AssetsLoadingStatus> | undefined,
  accountTreeState: AccountTreeControllerState,
): boolean {
  const groupId = accountTreeState.selectedAccountGroup;
  if (!groupId) {
    return false;
  }
  return isAnyGroupAccountLoading(statuses, accountTreeState, groupId);
}

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
  return state.assetsLoadingStatus?.[accountId];
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
  return collectGroupStatuses(
    state.assetsLoadingStatus,
    accountTreeState,
    groupId,
  );
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
  return isAnyGroupAccountLoading(
    state.assetsLoadingStatus,
    accountTreeState,
    groupId,
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
  return isSelectedGroupLoading(state.assetsLoadingStatus, accountTreeState);
}

/**
 * Get the background (Snap + RPC) loading status for a single account.
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns `'loading'` while a background fetch for the account is in
 * flight, `'loaded'` once every background fetch has settled, or `undefined`
 * if no background fetch was triggered.
 */
export function getAccountBackgroundLoadingStatus(
  state: Pick<AssetsControllerState, 'assetsBackgroundLoadingStatus'>,
  accountId: AccountId,
): AssetsLoadingStatus | undefined {
  return state.assetsBackgroundLoadingStatus?.[accountId];
}

/**
 * Check whether a background fetch for an account is currently in flight.
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns True while a background fetch for the account is in flight.
 */
export function isAccountBackgroundLoading(
  state: Pick<AssetsControllerState, 'assetsBackgroundLoadingStatus'>,
  accountId: AccountId,
): boolean {
  return getAccountBackgroundLoadingStatus(state, accountId) === 'loading';
}

/**
 * Get the background loading statuses for every account in an account group.
 *
 * @param state - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state slice.
 * @param groupId - The account group id.
 * @returns A record containing an entry for each account in the group that
 * has a background loading status, keyed by account id.
 */
export function getAccountGroupBackgroundLoadingStatus(
  state: Pick<AssetsControllerState, 'assetsBackgroundLoadingStatus'>,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
): Record<AccountId, AssetsLoadingStatus> {
  return collectGroupStatuses(
    state.assetsBackgroundLoadingStatus,
    accountTreeState,
    groupId,
  );
}

/**
 * Check whether any account in an account group has a background fetch in
 * flight.
 *
 * @param state - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state slice.
 * @param groupId - The account group id.
 * @returns True while at least one account in the group is background
 * loading.
 */
export function isAccountGroupBackgroundLoading(
  state: Pick<AssetsControllerState, 'assetsBackgroundLoadingStatus'>,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
): boolean {
  return isAnyGroupAccountLoading(
    state.assetsBackgroundLoadingStatus,
    accountTreeState,
    groupId,
  );
}

/**
 * Check whether the selected account group has a background fetch in flight.
 *
 * @param state - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state slice.
 * @returns True while any account in the selected account group is
 * background loading.
 */
export function getIsAssetsBackgroundLoadingForSelectedAccountGroup(
  state: Pick<AssetsControllerState, 'assetsBackgroundLoadingStatus'>,
  accountTreeState: AccountTreeControllerState,
): boolean {
  return isSelectedGroupLoading(
    state.assetsBackgroundLoadingStatus,
    accountTreeState,
  );
}
