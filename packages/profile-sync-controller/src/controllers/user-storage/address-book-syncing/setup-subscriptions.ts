import type { AddressBookEntry } from '@metamask/address-book-controller';

import { canPerformAddressBookSyncing } from './sync-utils';
import type { AddressBookSyncingOptions } from './types';

/**
 * Initialize and setup events to listen to for address book syncing
 *
 * @param options - parameters used for initializing and enabling address book syncing
 */
export function setupAddressBookSyncingSubscriptions(
  options: AddressBookSyncingOptions,
): void {
  const { getMessenger, getUserStorageControllerInstance } = options;

  getMessenger().subscribe(
    'AddressBookController:contactUpdated',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (contactEntry: AddressBookEntry) => {
      console.log('AddressBookController:contactUpdated', contactEntry);
      if (!canPerformAddressBookSyncing(options)) {
        return;
      }

      try {
        await getUserStorageControllerInstance().syncAddressBookWithUserStorage();
      } catch (error) {
        console.error(
          'Error syncing address book after contact update:',
          error,
        );
      }
    },
  );

  getMessenger().subscribe(
    'AddressBookController:contactDeleted',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (contactEntry: AddressBookEntry) => {
      console.log('AddressBookController:contactDeleted', contactEntry);
      if (!canPerformAddressBookSyncing(options)) {
        return;
      }

      try {
        await getUserStorageControllerInstance().syncAddressBookWithUserStorage();
      } catch (error) {
        console.error(
          'Error syncing address book after contact deletion:',
          error,
        );
      }
    },
  );
}
