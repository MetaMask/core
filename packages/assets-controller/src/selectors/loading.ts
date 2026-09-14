import type { AssetsControllerState } from '../AssetsController.js';
import type { AccountId, AssetsLoadingTrigger } from '../types.js';

/**
 * Loading-state selectors over
 * {@link AssetsControllerState.assetsLoadingStatus}.
 *
 * `assetsLoadingStatus` is transient (never persisted): an entry is present
 * while a user-visible asset fetch (account switch, unlock) is in flight for
 * that account, and its value is the trigger. Absence means "not loading".
 *
 * All selectors are synchronous and read from the controller state slice,
 * so they can be used directly in `useSelector`-style subscriptions to
 * `AssetsController:stateChanged`.
 */

/**
 * Get the loading trigger for a single account, if a user-visible fetch is
 * currently in flight for it.
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns The trigger for the in-flight fetch, or `undefined` when the
 * account is not loading.
 */
export function getAccountLoadingStatus(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountId: AccountId,
): AssetsLoadingTrigger | undefined {
  return state.assetsLoadingStatus?.[accountId];
}

/**
 * Check whether a user-visible asset fetch is in flight for an account.
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns True while the account's assets are loading.
 */
export function isAccountLoading(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountId: AccountId,
): boolean {
  return getAccountLoadingStatus(state, accountId) !== undefined;
}

/**
 * Get the in-flight loading triggers for a set of accounts (e.g. every
 * account in the selected account group).
 *
 * @param state - AssetsController state slice.
 * @param accountIds - The account ids to report on.
 * @returns A record containing an entry for each requested account that is
 * currently loading, keyed by account id.
 */
export function getAccountsLoadingStatus(
  state: Pick<AssetsControllerState, 'assetsLoadingStatus'>,
  accountIds: AccountId[],
): Record<AccountId, AssetsLoadingTrigger> {
  const result: Record<AccountId, AssetsLoadingTrigger> = {};
  const loadingStatus = state.assetsLoadingStatus ?? {};
  for (const accountId of accountIds) {
    const trigger = loadingStatus[accountId];
    if (trigger !== undefined) {
      result[accountId] = trigger;
    }
  }
  return result;
}

/**
 * Check whether any of the given accounts has a user-visible fetch in
 * flight. When `accountIds` is omitted, checks every account with a loading
 * entry in state.
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
  if (accountIds) {
    for (const accountId of accountIds) {
      if (loadingStatus[accountId] !== undefined) {
        return true;
      }
    }
    return false;
  }
  for (const accountId in loadingStatus) {
    if (loadingStatus[accountId] !== undefined) {
      return true;
    }
  }
  return false;
}
