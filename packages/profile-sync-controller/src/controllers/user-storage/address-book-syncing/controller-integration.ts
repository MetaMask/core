import type { AddressBookEntry } from '@metamask/address-book-controller';
import { AddressBookSyncingOptions } from "./types";
import { canPerformAddressBookSyncing } from './sync-utils';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';

// Define a constant to use as the key for storing all contacts
export const ADDRESS_BOOK_CONTACTS_KEY = 'contacts';

export type SyncAddressBookWithUserStorageConfig = {
    onAddressBookSyncErroneousSituation?: (
      errorMessage: string,
      sentryContext?: Record<string, unknown>,
    ) => void;
    onContactUpdated?: () => void;
    onContactDeleted?: () => void;
  };

/**
 * Creates a unique key for a contact based on chainId and address
 * 
 * @param contact - The contact to create a key for
 * @returns A unique string key
 */
function createContactKey(contact: AddressBookEntry): string {
  return `${contact.chainId}:${contact.address.toLowerCase()}`;
}

/**
 * Syncs the address book list with the user storage address book list.
 * Currently just retrieves and logs local contacts.
 *
 * @param config - parameters used for syncing
 * @param options - parameters used for syncing
 */
export async function syncAddressBookWithUserStorage(
  config: SyncAddressBookWithUserStorageConfig,
  options: AddressBookSyncingOptions,
): Promise<void> {
  if (!canPerformAddressBookSyncing(options)) {
    return;
  }

  const {
    onAddressBookSyncErroneousSituation,
    onContactUpdated,
    onContactDeleted,
  } = config;
  const { getMessenger } = options;

  try {
    console.log('Starting address book sync...');
    
    // Get local contacts from AddressBookController
    const localContacts = await getMessenger().call('AddressBookController:list', true) || [];
    console.log(`Found ${localContacts.length} local contacts`);
    localContacts.forEach((contact: AddressBookEntry, index: number) => {
      console.log(`Contact ${index + 1}:`, {
        address: contact.address,
        name: contact.name,
        chainId: contact.chainId,
        isDeleted: contact.deleted || false,
        lastUpdated: contact.lastUpdatedAt ? new Date(contact.lastUpdatedAt).toISOString() : 'never'
      });
    });
    
    console.log('Address book sync completed');

  } catch (error) {
    console.error('Error synchronizing address book:', error);
    if (onAddressBookSyncErroneousSituation) {
      onAddressBookSyncErroneousSituation('Error synchronizing address book', { error });
    }
  }
}