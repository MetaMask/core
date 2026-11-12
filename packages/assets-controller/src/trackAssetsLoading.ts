import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerState } from './AssetsController.js';
import { createModuleLogger, projectLogger } from './logger.js';
import type { AccountId, AssetsLoadingStatus } from './types.js';

const log = createModuleLogger(projectLogger, 'trackAssetsLoading');

type AssetsLoadingStatusKey =
  | 'assetsLoadingStatus'
  | 'assetsBackgroundLoadingStatus';

type AssetsLoadingState = Pick<AssetsControllerState, AssetsLoadingStatusKey>;

/**
 * The controller surface the loading tracker needs. `update` is spelled out
 * here because it is protected on the controller and so cannot be picked.
 */
export type AssetsLoadingStateUpdater = {
  state: AssetsLoadingState;
  update: (callback: (state: AssetsLoadingState) => void) => void;
};

/**
 * In-flight background fetch counts per account, keyed by controller, so an
 * account only settles once every overlapping background fetch has finished.
 */
const inFlightBackgroundFetches = new WeakMap<
  AssetsLoadingStateUpdater,
  Map<AccountId, number>
>();

/**
 * Set the loading status of the given accounts.
 *
 * @param controller - The controller whose state should be updated.
 * @param key - The loading status state property to update.
 * @param accounts - The accounts to set the status for.
 * @param status - The loading status to set.
 */
function setAssetsLoadingStatus(
  controller: AssetsLoadingStateUpdater,
  key: AssetsLoadingStatusKey,
  accounts: InternalAccount[],
  status: AssetsLoadingStatus,
): void {
  if (accounts.length === 0) {
    return;
  }
  controller.update((state) => {
    state[key] ??= {};
    for (const account of accounts) {
      state[key][account.id] = status;
    }
  });
  log(`${key} updated`, {
    status,
    accountIds: accounts.map((account) => account.id),
    [key]: controller.state[key],
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
    const firstLoadAccounts: InternalAccount[] = [];
    const settledAccountIds: AccountId[] = [];
    for (const account of accounts) {
      if (controller.state.assetsLoadingStatus?.[account.id] === undefined) {
        firstLoadAccounts.push(account);
      } else {
        settledAccountIds.push(account.id);
      }
    }
    if (settledAccountIds.length > 0) {
      log('Skipping assetsLoadingStatus for settled accounts', {
        accountIds: settledAccountIds,
      });
    }
    setAssetsLoadingStatus(
      controller,
      'assetsLoadingStatus',
      firstLoadAccounts,
      'loading',
    );
    try {
      return await target.call(this, ...args);
    } finally {
      setAssetsLoadingStatus(
        controller,
        'assetsLoadingStatus',
        firstLoadAccounts,
        'loaded',
      );
    }
  };
}

/**
 * Track the per-account background loading status around a background fetch.
 * Unlike {@link trackAssetsLoading}, every call is tracked: the accounts are
 * marked `'loading'` before the fetch starts and settle to `'loaded'` once
 * every overlapping background fetch for that account has completed, whether
 * it succeeded or failed.
 *
 * @param controller - The controller whose state should be updated.
 * @param accounts - The accounts the background fetch covers.
 * @param runFetch - Starts the background fetch.
 * @returns The result of the background fetch.
 */
export async function trackBackgroundAssetsLoading<Result>(
  controller: AssetsLoadingStateUpdater,
  accounts: InternalAccount[],
  runFetch: () => Promise<Result>,
): Promise<Result> {
  let counts = inFlightBackgroundFetches.get(controller);
  if (!counts) {
    counts = new Map();
    inFlightBackgroundFetches.set(controller, counts);
  }
  for (const account of accounts) {
    counts.set(account.id, (counts.get(account.id) ?? 0) + 1);
  }
  setAssetsLoadingStatus(
    controller,
    'assetsBackgroundLoadingStatus',
    accounts,
    'loading',
  );
  try {
    return await runFetch();
  } finally {
    const settledAccounts = accounts.filter((account) => {
      const remaining = (counts.get(account.id) ?? 1) - 1;
      if (remaining > 0) {
        counts.set(account.id, remaining);
        return false;
      }
      counts.delete(account.id);
      return true;
    });
    setAssetsLoadingStatus(
      controller,
      'assetsBackgroundLoadingStatus',
      settledAccounts,
      'loaded',
    );
  }
}
