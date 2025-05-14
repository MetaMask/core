import type { AddressBookEntry } from '@metamask/address-book-controller';
import { AddressBookSyncingOptions } from "./types";
import { canPerformAddressBookSyncing } from './sync-utils';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import { mapAddressBookEntryToUserStorageEntry, mapUserStorageEntryToAddressBookEntry } from './utils';
import type { UserStorageAddressBookEntry } from './types';

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
 * Syncs the address book between local storage and user storage (remote).
 * 
 * Handles the following syncing scenarios:
 * 1. First Sync: When local contacts exist but there are no remote contacts, uploads all local contacts.
 * 2. New Device Sync: Downloads remote contacts that don't exist locally (empty local address book).
 * 3. Simple Merge: Ensures both sides (local & remote) have all contacts.
 * 4. Contact Naming Conflicts: When same contact has different names, uses most recent by timestamp.
 * 5. Local Updates: When a contact was updated locally, syncs changes to remote if local is newer.
 * 6. Remote Updates: When a contact was updated remotely, applies changes locally if remote is newer.
 * 7. Local Deletions: When a contact was deleted locally, marks it as deleted in remote storage.
 * 8. Remote Deletions: When a contact was deleted remotely, applies deletion locally.
 * 9. Concurrent Updates: Resolves conflicts using timestamps to determine the winner.
 * 10. Restore After Delete: If a contact is modified after being deleted, restores it.
 * 11. ChainId Differences: Treats same address on different chains as separate contacts.
 *
 * @param config - Parameters used for syncing callbacks
 * @param options - Parameters used for syncing operations
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
    
    // Get local contacts from AddressBookController (including deleted ones) and filter out "account" contacts having chainId "*"
    const localContacts = await getMessenger().call('AddressBookController:list', true).filter(contact => String(contact.chainId) !== '*') || [];
    
    // Get remote contacts from user storage API
    const remoteContacts = await getRemoteContacts(options);
    
    // SCENARIO 1: First Sync - No remote contacts exist but local contacts do
    if (!remoteContacts || remoteContacts.length === 0) {
      if (localContacts.length > 0) {
        console.log('No remote contacts found. Performing first address book sync to user storage...');
        await saveContactsToUserStorage(localContacts, options);
        console.log('First address book sync completed successfully');
      }
      return;
    }

    console.log(`Found ${remoteContacts.length} total remote contacts`);
    
    // Prepare maps for faster lookup
    const localContactsMap = new Map<string, AddressBookEntry>();
    const remoteContactsMap = new Map<string, AddressBookEntry>();
    localContacts.forEach(contact => {
      const key = createContactKey(contact);
      localContactsMap.set(key, contact);
    });
    
    remoteContacts.forEach(contact => {
      const key = createContactKey(contact);
      remoteContactsMap.set(key, contact);
    });
    
    // Track contacts that need to be synced (remote → local or local → remote)
    const contactsToImportLocally: AddressBookEntry[] = [];
    const contactsToUpdateRemotely: AddressBookEntry[] = [];
    
    // Scenario #2: Remote → Local sync (new device or remote updates)
    // Find remote contacts to import locally (new, updated, or deleted)
    for (const remoteContact of remoteContacts) {
      const key = createContactKey(remoteContact);
      const localContact = localContactsMap.get(key);
      
      if (!localContact) {
        // Scenario #3A: Contact exists remotely but not locally - import it
        if (!remoteContact.deleted) {
          contactsToImportLocally.push(remoteContact);
        }
      } else {
        // Contact exists in both places - check for conflicts
        const remoteTimestamp = remoteContact.lastUpdatedAt || 0;
        const localTimestamp = localContact.lastUpdatedAt || 0;
        
        if (remoteContact.deleted && !localContact.deleted) {
          // Scenario #8: Remote deleted but local still exists
          const remoteDeletedAt = remoteContact.deletedAt || remoteTimestamp;
          
          // Scenario #10: Check for restore after delete (local is newer than remote deletion)
          if (localTimestamp > remoteDeletedAt) {
            // Local contact was updated after remote deletion - restore it remotely
            contactsToUpdateRemotely.push(localContact);
          } else {
            // Remote deletion is newer - apply it locally
            contactsToImportLocally.push(remoteContact);
          }
        } else if (!remoteContact.deleted && localContact.deleted) {
          // Scenario #7: Local deleted but remote still exists
          const localDeletedAt = localContact.deletedAt || localTimestamp;
          
          // Scenario #10: Check for restore after delete (remote is newer than local deletion)
          if (remoteTimestamp > localDeletedAt) {
            // Remote contact was updated after local deletion - restore it locally
            contactsToImportLocally.push(remoteContact);
          } else {
            // Local deletion is newer - apply it remotely
            contactsToUpdateRemotely.push(localContact);
          }
        } else if (!remoteContact.deleted && !localContact.deleted) {
          // Scenario #4, 5, 6, 9: Both exist and not deleted - use timestamps to resolve
          if (remoteTimestamp > localTimestamp) {
            // Scenario #6: Remote is newer - update local
            contactsToImportLocally.push(remoteContact);
          } else if (localTimestamp > remoteTimestamp) {
            // Scenario #5: Local is newer - update remote
            contactsToUpdateRemotely.push(localContact);
          }
          // If timestamps are equal, contacts are the same (no action needed)
        }
      }
    }
    
    // Scenario #3B: Find local contacts that don't exist remotely
    for (const localContact of localContacts) {
      const key = createContactKey(localContact);
      const remoteContact = remoteContactsMap.get(key);
      
      if (!remoteContact && !localContact.deleted) {
        // Contact only exists locally and is not deleted - add to remote
        contactsToUpdateRemotely.push(localContact);
      }
    }
    
    // Apply remote → local changes
    if (contactsToImportLocally.length > 0) {
      await getMessenger().call('AddressBookController:importContactsFromSync', contactsToImportLocally);
      
      // Callbacks (analytics)
      contactsToImportLocally.forEach(contact => {
        console.log('Importing local contact:', contact);
        if (contact.deleted && onContactDeleted) {
          onContactDeleted();
        } else if (!contact.deleted && onContactUpdated) {
          onContactUpdated();
        }
      });
    }
    
    // Apply local → remote changes
    if (contactsToUpdateRemotely.length > 0) {
      // Prepare merged list of all remote contacts with updates
      const updatedRemoteContacts = [...remoteContacts];
      
      // Update or add contacts to the remote contacts array
      contactsToUpdateRemotely.forEach(localContact => {
        const key = createContactKey(localContact);
        const existingIndex = updatedRemoteContacts.findIndex(c => createContactKey(c) === key);
        
        if (existingIndex !== -1) {
          // Update existing contact
          updatedRemoteContacts[existingIndex] = localContact;
          console.log('Updating remote contact:', localContact);
        } else {
          // Add new contact
          updatedRemoteContacts.push(localContact);
          console.log('Adding new remote contact:', localContact);
        }
        
        // Callbacks (analytics)
        if (localContact.deleted && onContactDeleted) {
          onContactDeleted();
        } else if (!localContact.deleted && onContactUpdated) {
          onContactUpdated();
        }
      });
      
      // Save updated contact list to remote storage
      await saveContactsToUserStorage(updatedRemoteContacts, options);
    }
    
    console.log('Address book sync completed successfully');

  } catch (error) {
    console.error('Error synchronizing address book:', error);
    if (onAddressBookSyncErroneousSituation) {
      onAddressBookSyncErroneousSituation('Error synchronizing address book', { error });
    }
  }
}

/**
 * Retrieves remote contacts from user storage API
 * 
 * @param options - Parameters used for retrieving remote contacts
 * @returns Array of address book entries from remote storage, or null if none found
 */
async function getRemoteContacts(options: AddressBookSyncingOptions): Promise<AddressBookEntry[] | null> {
  const { getUserStorageControllerInstance } = options;
  
  try {
    const remoteContactsJson = await getUserStorageControllerInstance().performGetStorage(
      `${USER_STORAGE_FEATURE_NAMES.addressBook}.${ADDRESS_BOOK_CONTACTS_KEY}`
    );
    
    if (!remoteContactsJson) {
      return null;
    }
    
    // Parse the JSON and convert each entry from UserStorageAddressBookEntry to AddressBookEntry
    const remoteStorageEntries = JSON.parse(remoteContactsJson) as UserStorageAddressBookEntry[];
    return remoteStorageEntries.map(entry => mapUserStorageEntryToAddressBookEntry(entry));
  } catch (error) {
    console.error('Error retrieving remote contacts:', error);
    return null;
  }
}

/**
 * Saves local contacts to user storage
 * 
 * @param contacts - The contacts to save to user storage
 * @param options - Parameters used for saving contacts
 */
async function saveContactsToUserStorage(
  contacts: AddressBookEntry[],
  options: AddressBookSyncingOptions
): Promise<void> {
  const { getUserStorageControllerInstance } = options;
  
  if (!contacts || contacts.length === 0) {
    console.log('saveContactsToUserStorage: no contacts to save to user storage');
    return;
  }
  
  try {
    // Convert each AddressBookEntry to UserStorageAddressBookEntry format before saving
    const storageEntries = contacts.map(contact => mapAddressBookEntryToUserStorageEntry(contact));
    
    await getUserStorageControllerInstance().performSetStorage(
      `${USER_STORAGE_FEATURE_NAMES.addressBook}.${ADDRESS_BOOK_CONTACTS_KEY}`,
      JSON.stringify(storageEntries)
    );
  } catch (error) {
    console.error('Error saving contacts to user storage:', error);
    throw error;
  }
}