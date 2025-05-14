import type { AddressBookEntry } from '@metamask/address-book-controller';
import type { AddressBookSyncingOptions } from './types';
import { syncAddressBookWithUserStorage, SyncAddressBookWithUserStorageConfig } from './controller-integration';
import { canPerformAddressBookSyncing } from './sync-utils';

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
      if (!canPerformAddressBookSyncing(options)) {
        return;
      }

      getUserStorageControllerInstance().syncAddressBookWithUserStorage();
    },
  );

  getMessenger().subscribe(
    'AddressBookController:contactDeleted',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (contactEntry: AddressBookEntry) => {
      if (!canPerformAddressBookSyncing(options)) {
        return;
      }

      getUserStorageControllerInstance().syncAddressBookWithUserStorage();
    },
  );
} 