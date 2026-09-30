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
      assetsLoadingStatus: Record<AccountId, AssetsLoadingStatus>;
    }) => void,
  ) => void;
};

/**
 * Per-controller ownership tokens, mapping each account to the most recent
 * tracked fetch that claimed it. Deliberately kept out of controller state:
 * this is an implementation detail of overlap handling, not something
 * consumers should read or persist.
 */
const loadingTokenOwners = new WeakMap<object, Map<AccountId, number>>();

let loadingTokenCounter = 0;

/**
 * Mark the given accounts as `'loading'` and record an ownership token that
 * identifies this invocation as the owner of those markers.
 *
 * @param controller - The controller whose state should be updated.
 * @param accounts - The accounts being fetched.
 * @returns The ownership token, or `0` when there is nothing to mark.
 */
function markAssetsLoading(
  controller: AssetsLoadingStateUpdater,
  accounts: InternalAccount[],
): number {
  if (accounts.length === 0) {
    return 0;
  }
  loadingTokenCounter += 1;
  const token = loadingTokenCounter;
  const owners =
    loadingTokenOwners.get(controller) ?? new Map<AccountId, number>();
  loadingTokenOwners.set(controller, owners);
  controller.update((state) => {
    for (const account of accounts) {
      owners.set(account.id, token);
      state.assetsLoadingStatus[account.id] = 'loading';
    }
  });
  return token;
}

/**
 * Settle the markers owned by the given token to `'loaded'`. Accounts whose
 * marker was re-claimed by a newer invocation are left untouched, so an older
 * overlapping fetch cannot clobber a newer one's loading status.
 *
 * @param controller - The controller whose state should be updated.
 * @param accounts - The accounts the invocation fetched.
 * @param token - The ownership token recorded by {@link markAssetsLoading}.
 */
function markAssetsSettled(
  controller: AssetsLoadingStateUpdater,
  accounts: InternalAccount[],
  token: number,
): void {
  if (token === 0) {
    return;
  }
  const owners = loadingTokenOwners.get(controller);
  if (owners === undefined) {
    return;
  }
  const ownedAccounts = accounts.filter(
    (account) => owners.get(account.id) === token,
  );
  if (ownedAccounts.length === 0) {
    return;
  }
  controller.update((state) => {
    for (const account of ownedAccounts) {
      state.assetsLoadingStatus[account.id] = 'loaded';
      owners.delete(account.id);
    }
  });
}

/**
 * Method decorator that tracks a per-account assets loading status around the
 * decorated fetch method: the requested accounts are marked `'loading'` when
 * the method is invoked and settle to `'loaded'` once it completes, whether it
 * succeeded or failed. Calls that do not force an update are cache reads and
 * are not tracked.
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
    const token = markAssetsLoading(controller, accounts);
    try {
      return await target.call(this, ...args);
    } finally {
      markAssetsSettled(controller, accounts, token);
    }
  };
}
