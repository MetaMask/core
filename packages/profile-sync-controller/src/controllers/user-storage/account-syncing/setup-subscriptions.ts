import { saveInternalAccountToUserStorage } from './controller-integration';
import { canPerformAccountSyncing } from './sync-utils';
import type { AccountSyncingOptions } from './types';

/**
 * Initialize and setup events to listen to for account syncing
 *
 * @param options - parameters used for initializing and enabling account syncing
 */
export function setupAccountSyncingSubscriptions(
  options: AccountSyncingOptions,
) {
  const { getMessenger, getUserStorageControllerInstance } = options;

  // We don't listen to `AccountsController:accountAdded`
  // because it publishes `AccountsController:accountRenamed` in any case.
  getMessenger().subscribe(
    'AccountsController:accountRenamed',

    async (account) => {
      if (
        !canPerformAccountSyncing(options) ||
        !getUserStorageControllerInstance().state
          .hasAccountSyncingSyncedAtLeastOnce
      ) {
        return;
      }

      await saveInternalAccountToUserStorage(account, options);
    },
  );
}
