import type { AddressBookEntry } from '@metamask/address-book-controller';

import { canPerformContactSyncing } from './sync-utils';
import type { ContactSyncingOptions } from './types';
import type { UserStorageContactEntry } from './types';
import {
  mapAddressBookEntryToUserStorageEntry,
  mapUserStorageEntryToAddressBookEntry,
  type SyncAddressBookEntry,
} from './utils';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';

// Define a constant to use as the key for storing all contacts
export const ADDRESS_BOOK_CONTACTS_KEY = 'contacts';

export type SyncContactsWithUserStorageConfig = {
  onContactSyncErroneousSituation?: (
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
 * Syncs contacts between local storage and user storage (remote).
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
export async function syncContactsWithUserStorage(
  config: SyncContactsWithUserStorageConfig,
  options: ContactSyncingOptions,
): Promise<void> {
  const { getMessenger, getUserStorageControllerInstance } = options;
  const {
    onContactSyncErroneousSituation,
    onContactUpdated,
    onContactDeleted,
  } = config;

  try {
    if (!canPerformContactSyncing(options)) {
      console.log('🔄 Contacts Sync: Cannot perform sync, conditions not met');
      return;
    }

    console.log('🔄 Contacts Sync: Starting sync process');

    // Activate sync semaphore to prevent event loops
    await getUserStorageControllerInstance().setIsContactSyncingInProgress(
      true,
    );

    // Get all local contacts from AddressBookController (exclude chain "*" contacts)
    const localVisibleContacts =
      getMessenger()
        .call('AddressBookController:list')
        .filter((contact) => String(contact.chainId) !== '*') || [];

    console.log('🔄 Contacts Sync: Local contacts', localVisibleContacts);

    // Get remote contacts from user storage API
    const remoteContacts = await getRemoteContacts(options);
    console.log('🔄 Contacts Sync: Remote contacts', remoteContacts);

    // SCENARIO 1: First Sync - No remote contacts but local contacts exist
    if (!remoteContacts || remoteContacts.length === 0) {
      if (localVisibleContacts.length > 0) {
        console.log(
          '🔄 Contacts Sync: First sync - uploading local contacts to remote',
        );
        await saveContactsToUserStorage(localVisibleContacts, options);
      }
      return;
    }

    // Prepare maps for efficient lookup
    const localContactsMap = new Map<string, AddressBookEntry>();
    const remoteContactsMap = new Map<string, SyncAddressBookEntry>();

    localVisibleContacts.forEach((contact) => {
      const key = createContactKey(contact);
      localContactsMap.set(key, contact);
    });

    remoteContacts.forEach((contact) => {
      const key = createContactKey(contact);
      remoteContactsMap.set(key, contact);
    });

    // Lists to track contacts that need to be synced
    const contactsToAddOrUpdateLocally: SyncAddressBookEntry[] = [];
    const contactsToDeleteLocally: SyncAddressBookEntry[] = [];
    const contactsToUpdateRemotely: AddressBookEntry[] = [];

    // SCENARIO 2 & 6: Process remote contacts - handle new device sync and remote updates
    for (const remoteContact of remoteContacts) {
      const key = createContactKey(remoteContact);
      const localContact = localContactsMap.get(key);

      // Handle remote contact based on its status and local existence
      if (remoteContact.deleted) {
        // SCENARIO 8: Remote deletion - should be applied locally if contact exists locally
        if (localContact) {
          console.log(
            '🔄 Contacts Sync: Applying remote deletion locally',
            remoteContact,
          );
          contactsToDeleteLocally.push(remoteContact);

          // Invoke deletion callback if needed
          if (onContactDeleted) {
            onContactDeleted();
          }
        }
      } else if (!localContact) {
        // SCENARIO 2: New contact from remote - import to local
        console.log(
          '🔄 Contacts Sync: Importing new remote contact',
          remoteContact,
        );
        contactsToAddOrUpdateLocally.push(remoteContact);

        // Invoke update callback if needed
        if (onContactUpdated) {
          onContactUpdated();
        }
      } else {
        // SCENARIO 4 & 6: Contact exists on both sides - check for conflicts
        const hasContentDifference =
          localContact.name !== remoteContact.name ||
          localContact.memo !== remoteContact.memo;

        if (hasContentDifference) {
          // Check timestamps to determine which version to keep
          const localTimestamp = localContact.lastUpdatedAt || 0;
          const remoteTimestamp = remoteContact.lastUpdatedAt || 0;

          if (localTimestamp >= remoteTimestamp) {
            // Local is newer (or same age) - use local version
            console.log('🔄 Contacts Sync: Local wins by timestamp', {
              local: localContact,
              remote: remoteContact,
              localTimestamp,
              remoteTimestamp,
            });
            contactsToUpdateRemotely.push(localContact);
          } else {
            // Remote is newer - use remote version
            console.log('🔄 Contacts Sync: Remote wins by timestamp', {
              local: localContact,
              remote: remoteContact,
              localTimestamp,
              remoteTimestamp,
            });
            contactsToAddOrUpdateLocally.push(remoteContact);

            // Invoke update callback if needed
            if (onContactUpdated) {
              onContactUpdated();
            }
          }
        } else {
          // Content is identical, no action needed
          console.log('🔄 Contacts Sync: Content identical, no action needed', {
            local: localContact,
            remote: remoteContact,
          });
        }
      }
    }

    // SCENARIO 3 & 5: Process local contacts not in remote
    for (const localContact of localVisibleContacts) {
      const key = createContactKey(localContact);
      const remoteContact = remoteContactsMap.get(key);

      if (!remoteContact) {
        // New local contact - add to remote
        console.log(
          '🔄 Contacts Sync: New local contact - adding to remote',
          localContact,
        );
        contactsToUpdateRemotely.push(localContact);
      }
    }

    // SCENARIO 7: Detect local deletions
    // Skip for new device scenario (no local contacts but remote has contacts)
    const isNewDeviceScenario =
      localVisibleContacts.length === 0 && remoteContacts.length > 0;

    if (!isNewDeviceScenario) {
      // Find contacts that exist in remote but not locally (they were deleted locally)
      const contactsToDeleteRemotely: SyncAddressBookEntry[] = [];

      for (const remoteContact of remoteContacts) {
        if (!remoteContact.deleted) {
          const key = createContactKey(remoteContact);
          if (!localContactsMap.has(key)) {
            console.log(
              '🔄 Contacts Sync: Contact deleted locally, marking as deleted in remote',
              remoteContact,
            );
            contactsToDeleteRemotely.push(remoteContact);

            // Invoke deletion callback if needed
            if (onContactDeleted) {
              onContactDeleted();
            }
          }
        }
      }

      // Mark contacts as deleted in remote
      if (contactsToDeleteRemotely.length > 0) {
        const remoteContactsWithDeletions = [...remoteContacts];

        for (const contactToDelete of contactsToDeleteRemotely) {
          const key = createContactKey(contactToDelete);
          const indexToDelete = remoteContactsWithDeletions.findIndex(
            (c) => createContactKey(c) === key,
          );

          if (indexToDelete !== -1) {
            const now = Date.now();
            remoteContactsWithDeletions[indexToDelete] = {
              ...remoteContactsWithDeletions[indexToDelete],
              deleted: true,
              deletedAt: now,
              lastUpdatedAt: now,
            };
          }
        }

        // Save updated remote contacts with deletions
        await saveContactsToUserStorage(remoteContactsWithDeletions, options);
      }
    } else {
      console.log(
        '🔄 Contacts Sync: Skipping local deletion detection - this is a new device',
      );
    }

    // Apply local deletions
    for (const contact of contactsToDeleteLocally) {
      try {
        console.log('🔄 Contacts Sync: Deleting contact locally', contact);
        await getMessenger().call(
          'AddressBookController:delete',
          contact.chainId,
          contact.address,
        );
      } catch (error) {
        console.error('Error deleting contact:', error);
      }
    }

    // Apply local additions/updates
    for (const contact of contactsToAddOrUpdateLocally) {
      if (!contact.deleted) {
        try {
          console.log(
            '🔄 Contacts Sync: Adding/updating contact locally',
            contact,
          );
          await getMessenger().call(
            'AddressBookController:set',
            contact.address,
            contact.name || '',
            contact.chainId,
            contact.memo || '',
            contact.addressType,
          );
        } catch (error) {
          console.error('Error updating contact:', error);
        }
      }
    }

    // Apply changes to remote storage
    if (contactsToUpdateRemotely.length > 0) {
      console.log(
        '🔄 Contacts Sync: Updating contacts in remote storage',
        contactsToUpdateRemotely,
      );

      // Update existing remote contacts with new contacts
      const updatedRemoteContacts = [...remoteContacts];

      for (const localContact of contactsToUpdateRemotely) {
        const key = createContactKey(localContact);
        const existingIndex = updatedRemoteContacts.findIndex(
          (c) => createContactKey(c) === key,
        );

        const now = Date.now();
        const updatedEntry = {
          ...localContact,
          lastUpdatedAt: now,
          deleted: false, // Ensure it's not deleted
        } as SyncAddressBookEntry;

        if (existingIndex !== -1) {
          // Update existing contact
          updatedRemoteContacts[existingIndex] = updatedEntry;
        } else {
          // Add new contact
          updatedRemoteContacts.push(updatedEntry);
        }
      }

      // Save updated contacts to remote storage
      await saveContactsToUserStorage(updatedRemoteContacts, options);
    }

    console.log('🔄 Contacts Sync: Sync completed successfully');
  } catch (error) {
    console.error('🔄 Contacts Sync: Error during sync', error);
    if (onContactSyncErroneousSituation) {
      onContactSyncErroneousSituation('Error synchronizing contacts', {
        error,
      });
    }
  } finally {
    await getUserStorageControllerInstance().setIsContactSyncingInProgress(
      false,
    );
  }
}

/**
 * Retrieves remote contacts from user storage API
 *
 * @param options - Parameters used for retrieving remote contacts
 * @returns Array of contacts from remote storage, or null if none found
 */
async function getRemoteContacts(
  options: ContactSyncingOptions,
): Promise<SyncAddressBookEntry[] | null> {
  const { getUserStorageControllerInstance } = options;

  try {
    const remoteContactsJson =
      await getUserStorageControllerInstance().performGetStorage(
        `${USER_STORAGE_FEATURE_NAMES.addressBook}.${ADDRESS_BOOK_CONTACTS_KEY}`,
      );

    if (!remoteContactsJson) {
      return null;
    }

    // Parse the JSON and convert each entry from UserStorageContactEntry to AddressBookEntry
    const remoteStorageEntries = JSON.parse(
      remoteContactsJson,
    ) as UserStorageContactEntry[];
    return remoteStorageEntries.map((entry) =>
      mapUserStorageEntryToAddressBookEntry(entry),
    );
  } catch {
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
  options: ContactSyncingOptions,
): Promise<void> {
  const { getUserStorageControllerInstance } = options;

  if (!contacts || contacts.length === 0) {
    return;
  }

  // Convert each AddressBookEntry to UserStorageContactEntry format before saving
  const storageEntries = contacts.map((contact) =>
    mapAddressBookEntryToUserStorageEntry(contact),
  );

  await getUserStorageControllerInstance().performSetStorage(
    `${USER_STORAGE_FEATURE_NAMES.addressBook}.${ADDRESS_BOOK_CONTACTS_KEY}`,
    JSON.stringify(storageEntries),
  );
}

/**
 * Updates a single contact in remote storage without performing a full sync
 * This is used when a contact is updated locally to efficiently push changes to remote
 *
 * @param contact - The contact that was updated locally
 * @param options - Parameters used for syncing operations
 */
export async function updateContactInRemoteStorage(
  contact: AddressBookEntry,
  options: ContactSyncingOptions,
): Promise<void> {
  if (!canPerformContactSyncing(options)) {
    return;
  }

  console.log(
    '🔄 Contacts Sync: Updating single contact in remote storage',
    contact,
  );

  try {
    // Get current remote contacts or initialize empty array
    const remoteContacts = (await getRemoteContacts(options)) || [];

    // Find if this contact already exists in remote
    const key = createContactKey(contact);
    const existingIndex = remoteContacts.findIndex(
      (c) => createContactKey(c) === key,
    );

    const updatedRemoteContacts = [...remoteContacts];

    // Create an updated entry with timestamp
    const updatedEntry = {
      ...contact,
      lastUpdatedAt: contact.lastUpdatedAt || Date.now(),
      deleted: false, // Explicitly set to false in case this was previously deleted
    } as SyncAddressBookEntry;

    if (existingIndex !== -1) {
      // Update existing contact
      updatedRemoteContacts[existingIndex] = updatedEntry;
    } else {
      // Add as new contact
      updatedRemoteContacts.push(updatedEntry);
    }

    // Save to remote storage
    await saveContactsToUserStorage(updatedRemoteContacts, options);
  } catch (error) {
    console.error(
      '🔄 Contacts Sync: Error updating contact in remote storage',
      error,
    );
  }
}

/**
 * Marks a single contact as deleted in remote storage without performing a full sync
 * This is used when a contact is deleted locally to efficiently push the deletion to remote
 *
 * @param contact - The contact that was deleted locally (contains at least address and chainId)
 * @param options - Parameters used for syncing operations
 */
export async function deleteContactInRemoteStorage(
  contact: AddressBookEntry,
  options: ContactSyncingOptions,
): Promise<void> {
  if (!canPerformContactSyncing(options)) {
    return;
  }

  console.log(
    '🔄 Contacts Sync: Marking contact as deleted in remote storage',
    contact,
  );

  try {
    // Get current remote contacts
    const remoteContacts = (await getRemoteContacts(options)) || [];

    // Find the contact in remote storage
    const key = createContactKey(contact);
    const existingIndex = remoteContacts.findIndex(
      (c) => createContactKey(c) === key,
    );

    // If the contact exists in remote storage
    if (existingIndex !== -1) {
      const updatedRemoteContacts = [...remoteContacts];
      const now = Date.now();

      // Mark the contact as deleted
      updatedRemoteContacts[existingIndex] = {
        ...updatedRemoteContacts[existingIndex],
        deleted: true,
        deletedAt: now,
        lastUpdatedAt: now,
      };

      // Save to remote storage
      await saveContactsToUserStorage(updatedRemoteContacts, options);
    }
  } catch (error) {
    console.error(
      '🔄 Contacts Sync: Error marking contact as deleted in remote storage',
      error,
    );
  }
}
