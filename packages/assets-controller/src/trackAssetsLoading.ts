import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsController } from './AssetsController.js';
import type { AccountId, AssetsLoadingStatus } from './types.js';

/**
 * The controller surface the loading tracker needs. `update` is spelled out
 * here because it is protected on the controller and so cannot be picked.
 */
type AssetsLoadingStateUpdater = Pick<AssetsController, 'state'> & {
  update: (
    callback: (state: {
      assetsLoadingStatus?: Record<AccountId, AssetsLoadingStatus>;
    }) => void,
  ) => void;
};

/**
 * Set the loading status of the given accounts.
 *
 * @param controller - The controller whose state should be updated.
 * @param accounts - The accounts to set the status for.
 * @param status - The loading status to set.
 */
function setAssetsLoadingStatus(
  controller: AssetsLoadingStateUpdater,
  accounts: InternalAccount[],
  status: AssetsLoadingStatus,
): void {
  if (accounts.length === 0) {
    return;
  }
  controller.update((state) => {
    state.assetsLoadingStatus ??= {};
    for (const account of accounts) {
      state.assetsLoadingStatus[account.id] = status;
    }
  });
}

/**
 * Method decorator that tracks a per-account first-load status around the
 * decorated fetch method: accounts whose assets have never been fetched are
 * marked `'loading'` when the method is invoked and settle to `'loaded'` once
 * it completes, whether it succeeded or failed. Accounts that already
 * settled are never re-marked, so later refreshes (network switches, unlocks,
 * direct calls, and so on) do not re-toggle the status. Calls that do not
 * force an update are cache reads and are not tracked.
 *
 * @param target - The decorated fetch method.
 * @param _context - The decorator context.
 * @returns The wrapped fetch method.
 */
export function trackAssetsLoading<
  This,
  Args extends [InternalAccount[], { forceUpdate?: boolean }?, ...unknown[]],
  Return,
>(
  target: (this: This, ...args: Args) => Promise<Return>,
  _context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: Args) => Promise<Return>
  >,
): (this: This, ...args: Args) => Promise<Return> {
  return async function (this: This, ...args: Args): Promise<Return> {
    const [accounts, options] = args;
    if (options?.forceUpdate !== true) {
      return target.call(this, ...args);
    }
    const controller = this as unknown as AssetsLoadingStateUpdater;
    const firstLoadAccounts = accounts.filter(
      (account) =>
        controller.state.assetsLoadingStatus?.[account.id] === undefined,
    );
    setAssetsLoadingStatus(controller, firstLoadAccounts, 'loading');
    try {
      return await target.call(this, ...args);
    } finally {
      setAssetsLoadingStatus(controller, firstLoadAccounts, 'loaded');
    }
  };
}
