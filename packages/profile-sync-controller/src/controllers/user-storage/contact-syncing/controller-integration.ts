import type { AddressBookEntry } from '@metamask/address-book-controller';

import { canPerformContactSyncing } from './sync-utils';
import type { ContactSyncingOptions } from './types';
import type { UserStorageContactEntry } from './types';
import {
  mapAddressBookEntryToUserStorageEntry,
  mapUserStorageEntryToAddressBookEntry,
  type SyncAddressBookEntry,
} from './utils';
import { isContactBridgedFromAccounts } from './utils';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';

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
  if (!contact.address) {
    throw new Error('Contact address is required to create storage key');
  }
  return `${contact.chainId}_${contact.address.toLowerCase()}`;
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
 * 7. Local Deletions: Handled by real-time event handlers (deleteContactInRemoteStorage) to prevent false positives.
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
    // Cannot perform sync, conditions not met
    if (!canPerformContactSyncing(options)) {
      return;
    }

    // Activate sync semaphore to prevent event loops
    await getUserStorageControllerInstance().setIsContactSyncingInProgress(
      true,
    );

    // Get all local contacts from AddressBookController (exclude chain "*" contacts)
    const localVisibleContacts =
      getMessenger()
        .call('AddressBookController:list')
        .filter((contact) => !isContactBridgedFromAccounts(contact))
        .filter(
          (contact) =>
            contact.address && contact.chainId && contact.name?.trim(),
        ) || [];

    // Get remote contacts from user storage API
    const remoteContacts = await getRemoteContacts(options);

    // Filter remote contacts to exclude invalid ones (or empty array if no remote contacts)
    const validRemoteContacts =
      remoteContacts?.filter(
        (contact) => contact.address && contact.chainId && contact.name?.trim(),
      ) || [];

    // Prepare maps for efficient lookup
    const localContactsMap = new Map<string, AddressBookEntry>();
    const remoteContactsMap = new Map<string, SyncAddressBookEntry>();

    localVisibleContacts.forEach((contact) => {
      const key = createContactKey(contact);
      localContactsMap.set(key, contact);
    });

    validRemoteContacts.forEach((contact) => {
      const key = createContactKey(contact);
      remoteContactsMap.set(key, contact);
    });

    // Lists to track contacts that need to be synced
    const contactsToAddOrUpdateLocally: SyncAddressBookEntry[] = [];
    const contactsToDeleteLocally: SyncAddressBookEntry[] = [];
    const contactsToUpdateRemotely: AddressBookEntry[] = [];

    // SCENARIO 2 & 6: Process remote contacts - handle new device sync and remote updates
    for (const remoteContact of validRemoteContacts) {
      const key = createContactKey(remoteContact);
      const localContact = localContactsMap.get(key);

      // Handle remote contact based on its status and local existence
      if (remoteContact.deletedAt) {
        // SCENARIO 8: Remote deletion - should be applied locally if contact exists locally
        if (localContact) {
          contactsToDeleteLocally.push(remoteContact);
        }
      } else if (!localContact) {
        // SCENARIO 2: New contact from remote - import to local
        contactsToAddOrUpdateLocally.push(remoteContact);
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
            contactsToUpdateRemotely.push(localContact);
          } else {
            // Remote is newer - use remote version
            contactsToAddOrUpdateLocally.push(remoteContact);
          }
        }

        // Else: content is identical, no action needed
      }
    }

    // SCENARIO 1, 3 & 5: Process local contacts not in remote - handles first sync and new local contacts
    for (const localContact of localVisibleContacts) {
      const key = createContactKey(localContact);
      const remoteContact = remoteContactsMap.get(key);

      if (!remoteContact) {
        // New local contact or first sync - add to remote
        contactsToUpdateRemotely.push(localContact);
      }
    }

    // Apply local deletions
    for (const contact of contactsToDeleteLocally) {
      try {
        getMessenger().call(
          'AddressBookController:delete',
          contact.chainId,
          contact.address,
        );

        if (onContactDeleted) {
          onContactDeleted();
        }
      } catch (error) {
        console.error('Error deleting contact:', error);
      }
    }

    // Apply local additions/updates
    for (const contact of contactsToAddOrUpdateLocally) {
      if (!contact.deletedAt) {
        try {
          getMessenger().call(
            'AddressBookController:set',
            contact.address,
            contact.name || '',
            contact.chainId,
            contact.memo || '',
            contact.addressType,
          );

          if (onContactUpdated) {
            onContactUpdated();
          }
        } catch (error) {
          console.error('Error updating contact:', error);
        }
      }
    }

    // Apply changes to remote storage
    if (contactsToUpdateRemotely.length > 0) {
      // Update existing remote contacts with new contacts
      const updatedRemoteContacts = [...validRemoteContacts];

      for (const localContact of contactsToUpdateRemotely) {
        const key = createContactKey(localContact);
        const existingIndex = updatedRemoteContacts.findIndex(
          (c) => createContactKey(c) === key,
        );

        const now = Date.now();
        const updatedEntry = {
          ...localContact,
          lastUpdatedAt: now,
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
  } catch (error) {
    if (onContactSyncErroneousSituation) {
      onContactSyncErroneousSituation('Error synchronizing contacts', {
        error,
      });

      // Re-throw the error to be handled by the caller
      throw error;
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
    const remoteContactsJsonArray =
      await getUserStorageControllerInstance().performGetStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.addressBook,
      );

    if (!remoteContactsJsonArray || remoteContactsJsonArray.length === 0) {
      return null;
    }

    // Parse each JSON entry and convert from UserStorageContactEntry to AddressBookEntry
    const remoteStorageEntries = remoteContactsJsonArray.map((contactJson) => {
      const entry = JSON.parse(contactJson) as UserStorageContactEntry;
      return mapUserStorageEntryToAddressBookEntry(entry);
    });

    return remoteStorageEntries;
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

  // Convert each AddressBookEntry to UserStorageContactEntry format and create key-value pairs
  const storageEntries: [string, string][] = contacts.map((contact) => {
    const key = createContactKey(contact);
    const storageEntry = mapAddressBookEntryToUserStorageEntry(contact);
    return [key, JSON.stringify(storageEntry)];
  });

  await getUserStorageControllerInstance().performBatchSetStorage(
    USER_STORAGE_FEATURE_NAMES.addressBook,
    storageEntries,
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
  if (
    !canPerformContactSyncing(options) ||
    !contact.address ||
    !contact.chainId ||
    !contact.name?.trim()
  ) {
    return;
  }

  const { getUserStorageControllerInstance } = options;

  // Create an updated entry with timestamp
  const updatedEntry = {
    ...contact,
    lastUpdatedAt: contact.lastUpdatedAt || Date.now(),
  } as SyncAddressBookEntry;

  const key = createContactKey(contact);
  const storageEntry = mapAddressBookEntryToUserStorageEntry(updatedEntry);

  // Save individual contact to remote storage
  await getUserStorageControllerInstance().performSetStorage(
    `${USER_STORAGE_FEATURE_NAMES.addressBook}.${key}`,
    JSON.stringify(storageEntry),
  );
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
  if (
    !canPerformContactSyncing(options) ||
    !contact.address ||
    !contact.chainId ||
    !contact.name?.trim()
  ) {
    return;
  }

  const { getUserStorageControllerInstance } = options;
  const key = createContactKey(contact);

  try {
    // Try to get the existing contact first
    const existingContactJson =
      await getUserStorageControllerInstance().performGetStorage(
        `${USER_STORAGE_FEATURE_NAMES.addressBook}.${key}`,
      );

    if (existingContactJson) {
      // Mark the existing contact as deleted
      const existingStorageEntry = JSON.parse(
        existingContactJson,
      ) as UserStorageContactEntry;
      const existingContact =
        mapUserStorageEntryToAddressBookEntry(existingStorageEntry);

      const now = Date.now();
      const deletedContact = {
        ...existingContact,
        deletedAt: now,
        lastUpdatedAt: now,
      } as SyncAddressBookEntry;

      const deletedStorageEntry =
        mapAddressBookEntryToUserStorageEntry(deletedContact);

      // Save the deleted contact back to storage
      await getUserStorageControllerInstance().performSetStorage(
        `${USER_STORAGE_FEATURE_NAMES.addressBook}.${key}`,
        JSON.stringify(deletedStorageEntry),
      );
    }
  } catch {
    // If contact doesn't exist in remote storage, no need to mark as deleted
    console.warn('Contact not found in remote storage for deletion:', key);
  }
}
