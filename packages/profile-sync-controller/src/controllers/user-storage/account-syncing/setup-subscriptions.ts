import { saveInternalAccountToUserStorage } from './controller-integration';
import { canPerformAccountSyncing } from './sync-utils';
import type { AccountSyncingConfig, AccountSyncingOptions } from './types';

/**
 * Initialize and setup events to listen to for account syncing
 * @param config - configuration parameters
 * @param options - parameters used for initializing and enabling account syncing
 */
export function setupAccountSyncingSubscriptions(
  config: AccountSyncingConfig,
  options: AccountSyncingOptions,
) {
  const { getMessenger, getUserStorageControllerInstance } = options;

  getMessenger().subscribe(
    'AccountsController:accountAdded',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (account) => {
      if (
        !canPerformAccountSyncing(config, options) ||
        !getUserStorageControllerInstance().state
          .hasAccountSyncingSyncedAtLeastOnce
      ) {
        return;
      }

      await saveInternalAccountToUserStorage(account, config, options);
    },
  );

  getMessenger().subscribe(
    'AccountsController:accountRenamed',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (account) => {
      if (
        !canPerformAccountSyncing(config, options) ||
        !getUserStorageControllerInstance().state
          .hasAccountSyncingSyncedAtLeastOnce
      ) {
        return;
      }

      await saveInternalAccountToUserStorage(account, config, options);
    },
  );
}
