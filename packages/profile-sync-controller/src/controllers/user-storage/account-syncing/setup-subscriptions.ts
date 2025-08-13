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

    async (account) => {
      if (
        !canPerformAccountSyncing(options) ||
        !getUserStorageControllerInstance().state
          .hasAccountSyncingSyncedAtLeastOnce ||
        // If multichain account syncing is enabled, we do not push account syncing V1 data anymore.
        // AccountTreeController handles proper multichain account syncing
        getUserStorageControllerInstance().getIsMultichainAccountSyncingEnabled()
      ) {
        return;
      }

      const { eventQueue } = getUserStorageControllerInstance();

      eventQueue.push(
        async () => await saveInternalAccountToUserStorage(account, options),
      );
      await eventQueue.run();
    },
  );

  getMessenger().subscribe(
    'AccountsController:accountRenamed',

    async (account) => {
      if (
        !canPerformAccountSyncing(options) ||
        !getUserStorageControllerInstance().state
          .hasAccountSyncingSyncedAtLeastOnce ||
        // If multichain account syncing is enabled, we do not push account syncing V1 data anymore.
        // AccountTreeController handles proper multichain account syncing
        getUserStorageControllerInstance().getIsMultichainAccountSyncingEnabled()
      ) {
        return;
      }

      const { eventQueue } = getUserStorageControllerInstance();

      eventQueue.push(
        async () => await saveInternalAccountToUserStorage(account, options),
      );
      await eventQueue.run();
    },
  );
}
