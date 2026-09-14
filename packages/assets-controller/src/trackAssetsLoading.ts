import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountId, AssetsLoadingStatus } from './types.js';

type AssetsLoadingStateUpdater = {
  update: (
    callback: (state: {
      assetsLoadingStatus: Record<AccountId, AssetsLoadingStatus>;
    }) => void,
  ) => void;
};

const loadingTokens = new WeakMap<
  AssetsLoadingStateUpdater,
  Map<AccountId, number>
>();
let loadingTokenCounter = 0;

/**
 * Get the per-controller ownership token map, creating it on first use.
 *
 * @param controller - The controller whose token map to get.
 * @returns The map of account ID to the token of the invocation that
 * currently owns that account's loading marker.
 */
function getTokens(
  controller: AssetsLoadingStateUpdater,
): Map<AccountId, number> {
  let tokens = loadingTokens.get(controller);
  if (tokens === undefined) {
    tokens = new Map();
    loadingTokens.set(controller, tokens);
  }
  return tokens;
}

/**
 * Mark the given accounts as `'loading'` and return an ownership token that
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
  const tokens = getTokens(controller);
  for (const account of accounts) {
    tokens.set(account.id, token);
  }
  controller.update((state) => {
    for (const account of accounts) {
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
 * @param token - The ownership token returned by {@link markAssetsLoading}.
 */
function markAssetsSettled(
  controller: AssetsLoadingStateUpdater,
  accounts: InternalAccount[],
  token: number,
): void {
  if (token === 0) {
    return;
  }
  const tokens = getTokens(controller);
  const ownedAccounts = accounts.filter(
    (account) => tokens.get(account.id) === token,
  );
  if (ownedAccounts.length === 0) {
    return;
  }
  controller.update((state) => {
    for (const account of ownedAccounts) {
      state.assetsLoadingStatus[account.id] = 'loaded';
    }
  });
  for (const account of ownedAccounts) {
    tokens.delete(account.id);
  }
}

/**
 * Method decorator that tracks a per-account assets loading status around the
 * decorated fetch method: the requested accounts are marked `'loading'` when
 * the method is invoked and settle to `'loaded'` once it completes, whether it
 * succeeded or failed.
 *
 * @param target - The decorated fetch method.
 * @param _context - The decorator context.
 * @returns The wrapped fetch method.
 */
export function trackAssetsLoading<
  This,
  Args extends [InternalAccount[], ...unknown[]],
  Return,
>(
  target: (this: This, ...args: Args) => Promise<Return>,
  _context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: Args) => Promise<Return>
  >,
): (this: This, ...args: Args) => Promise<Return> {
  return async function (this: This, ...args: Args): Promise<Return> {
    const [accounts] = args;
    const controller = this as unknown as AssetsLoadingStateUpdater;
    const token = markAssetsLoading(controller, accounts);
    try {
      return await target.call(this, ...args);
    } finally {
      markAssetsSettled(controller, accounts, token);
    }
  };
}
