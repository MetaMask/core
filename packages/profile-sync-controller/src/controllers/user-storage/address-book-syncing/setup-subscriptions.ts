import type { AddressBookEntry } from '@metamask/address-book-controller';
import type { AddressBookSyncingOptions } from './types';
import { syncAddressBookWithUserStorage } from './controller-integration';

/**
 * Initialize and setup events to listen to for address book syncing
 * This logs events for now without interacting with storage
 *
 * @param options - parameters used for initializing and enabling address book syncing
 */
export function setupAddressBookSyncingSubscriptions(
  options: AddressBookSyncingOptions,
): void {
  const { getMessenger, getUserStorageControllerInstance } = options;

  // Subscribe to contact updated event
  getMessenger().subscribe(
    'AddressBookController:contactUpdated',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (contactEntry: AddressBookEntry) => {
      console.log('Address book contact updated:', contactEntry);
      await syncAddressBookWithUserStorage(
        {
          onContactUpdated: () => { return; },
            // TODO: pass callbacks from controller
          onContactDeleted: () => { return; },
            // TODO: pass callbacks from controller
          onAddressBookSyncErroneousSituation: (situationMessage: unknown, sentryContext: unknown) => { return; },
            // TODO: pass callbacks from controller
        },
        {
          getMessenger,
          getUserStorageControllerInstance,
        }
      );
    },
  );

  // Subscribe to contact deleted event
  getMessenger().subscribe(
    'AddressBookController:contactDeleted',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (contactEntry: AddressBookEntry) => {
      console.log('Address book contact deleted:', contactEntry);
      await syncAddressBookWithUserStorage(
        {
          onContactUpdated: () => { return; },
            // TODO: pass callbacks from controller
          onContactDeleted: () => { return; },
            // TODO: pass callbacks from controller
          onAddressBookSyncErroneousSituation: (situationMessage: unknown, sentryContext: unknown) => { return; },
            // TODO: pass callbacks from controller
        },
        {
          getMessenger,
          getUserStorageControllerInstance,
        }
      );
    },
  );
} 