import type { AssetsControllerState } from '../AssetsController.js';
import type { AccountId, AssetsFetchPhase, ChainId } from '../types.js';

/**
 * Check whether an account is currently fetching assets in either phase.
 *
 * True when the `fast` or the `background` phase is `fetching`. There is a
 * brief moment between the fast phase ending and the background phase
 * beginning when both phases are idle, so consumers should not treat that gap
 * as "finished".
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns True while either fetch phase is running for the account.
 */
export function isAccountFetching(
  state: Pick<AssetsControllerState, 'assetsFetchStatus'>,
  accountId: AccountId,
): boolean {
  const status = state.assetsFetchStatus?.[accountId];
  return (
    status?.fast.fetchStatus === 'fetching' ||
    status?.background.fetchStatus === 'fetching'
  );
}

/**
 * Get the per chain fetch errors of an account, separately for each phase.
 *
 * The phases are not merged on purpose: the fast phase can report a chain as
 * failed, then the background phase retries it and may recover it, while the
 * fast phase errors stay set. A merged union would show false errors.
 * To get the effective errors, note that the background phase retries chains
 * that failed in the fast phase, so once the background phase is idle after a
 * fast completion, `background.errors` supersedes `fast.errors` for the chains
 * it retried.
 *
 * Known limitation: overlapping forced fetches on the same account report the
 * result of the last one to finish (earlier errors are dropped).
 *
 * @param state - AssetsController state slice.
 * @param accountId - The account id (`InternalAccount.id`).
 * @returns The errors keyed by chain id for each phase, with both phases
 * `{}` when the account is unknown.
 */
export function getAccountFetchErrors(
  state: Pick<AssetsControllerState, 'assetsFetchStatus'>,
  accountId: AccountId,
): Record<AssetsFetchPhase, Record<ChainId, string>> {
  const status = state.assetsFetchStatus?.[accountId];
  return {
    fast: status?.fast.errors ?? {},
    background: status?.background.errors ?? {},
  };
}
