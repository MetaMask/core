import type { AddressBookEntry } from '@metamask/address-book-controller';

import {
  updateContactInRemoteStorage,
  deleteContactInRemoteStorage,
} from './controller-integration';
import { canPerformContactSyncing } from './sync-utils';
import type { ContactSyncingOptions } from './types';

/**
 * Initialize and setup events to listen to for contact syncing
 *
 * @param options - parameters used for initializing and enabling contact syncing
 */
export function setupContactSyncingSubscriptions(
  options: ContactSyncingOptions,
): void {
  const { getMessenger } = options;

  // Listen for contact updates and immediately sync the individual contact
  getMessenger().subscribe(
    'AddressBookController:contactUpdated',
    (contactEntry: AddressBookEntry) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => {
        if (!canPerformContactSyncing(options)) {
          return;
        }

        // Skip global accounts with chainId "*" : they are contacts bridged from accounts
        if (String(contactEntry.chainId) === '*') {
          return;
        }

        try {
          // Use the targeted method to update just this contact
          await updateContactInRemoteStorage(contactEntry, options);
        } catch (error) {
          console.error('Error updating contact in remote storage:', error);
        }
      })();
    },
  );

  // Listen for contact deletions and immediately sync the individual deletion
  getMessenger().subscribe(
    'AddressBookController:contactDeleted',
    (contactEntry: AddressBookEntry) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => {
        if (!canPerformContactSyncing(options)) {
          return;
        }

        // Skip global accounts with chainId "*" : they are contacts bridged from accounts
        if (String(contactEntry.chainId) === '*') {
          return;
        }

        try {
          // Use the targeted method to delete just this contact
          await deleteContactInRemoteStorage(contactEntry, options);
        } catch (error) {
          console.error('Error deleting contact from remote storage:', error);
        }
      })();
    },
  );
}
