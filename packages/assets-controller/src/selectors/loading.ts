import type { AssetsControllerState } from '../AssetsController.js';
import type { AccountId, AssetsLoadingStatus } from '../types.js';

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
 * Get the loading statuses for a set of accounts.
 *
 * @param state - AssetsController state slice.
 * @param accountIds - The account ids to report on.
 * @returns A record containing an entry for each requested account that has
 * a loading status, keyed by account id.
 */
export function getAccountsLoadingStatus(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountIds: AccountId[],
): Record<AccountId, AssetsLoadingStatus> {
  const result: Record<AccountId, AssetsLoadingStatus> = {};
  const loadingStatus = state.assetsLoadingStatus ?? {};
  for (const accountId of accountIds) {
    const status = loadingStatus[accountId];
    if (status !== undefined) {
      result[accountId] = status;
    }
  }
  return result;
}

/**
 * Check whether any of the given accounts is loading. When `accountIds` is
 * omitted, checks every account with a loading status in state.
 *
 * @param state - AssetsController state slice.
 * @param accountIds - Optional account ids to restrict the check to.
 * @returns True if at least one of the accounts is loading.
 */
export function isAnyAccountLoading(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountIds?: AccountId[],
): boolean {
  const loadingStatus = state.assetsLoadingStatus ?? {};
  const ids = accountIds ?? Object.keys(loadingStatus);
  return ids.some((accountId) => loadingStatus[accountId] === 'loading');
}
