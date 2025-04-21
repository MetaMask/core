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

  getMessenger().subscribe(
    'AccountsController:accountAdded',

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
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

  getMessenger().subscribe(
    'AccountsController:accountRenamed',

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
