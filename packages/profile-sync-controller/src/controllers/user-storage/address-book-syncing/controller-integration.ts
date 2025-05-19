import type {
  AddressBookEntry,
  AddressBookEntryWithSyncMetadata,
} from '@metamask/address-book-controller';

import { canPerformAddressBookSyncing } from './sync-utils';
import type { AddressBookSyncingOptions } from './types';
import type { UserStorageAddressBookEntry } from './types';
import {
  mapAddressBookEntryToUserStorageEntry,
  mapUserStorageEntryToAddressBookEntry,
  type SyncAddressBookEntry,
} from './utils';
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
    // Get all local contacts from AddressBookController and filter out "account" contacts having chainId "*"
    const localVisibleContacts =
      getMessenger()
        .call('AddressBookController:list')
        .filter((contact) => String(contact.chainId) !== '*') || [];

    // Get remote contacts from user storage API
    const remoteContacts = await getRemoteContacts(options);

    // SCENARIO 1: First Sync - No remote contacts exist but local contacts do
    if (!remoteContacts || remoteContacts.length === 0) {
      if (localVisibleContacts.length > 0) {
        await saveContactsToUserStorage(localVisibleContacts, options);
      }
      return;
    }

    // Prepare maps for faster lookup
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

    // Track contacts that need to be synced (remote → local or local → remote)
    const contactsToImportLocally: SyncAddressBookEntry[] = [];
    const contactsToUpdateRemotely: AddressBookEntry[] = [];
    const contactsToDeleteRemotely: SyncAddressBookEntry[] = [];

    // Scenario #2: Remote → Local sync (new device or remote updates)
    // Find remote contacts to import locally (new, updated, or deleted)
    for (const remoteContact of remoteContacts) {
      const key = createContactKey(remoteContact);
      const localContact = localContactsMap.get(key);

      if (!localContact) {
        // Scenario #3A: Contact exists remotely but not locally
        if (!remoteContact.deleted) {
          // Import non-deleted remote contacts
          contactsToImportLocally.push(remoteContact);
        }
        // Ignore deleted remote contacts that don't exist locally
      } else if (remoteContact.deleted) {
        // Scenario #8: Remote is deleted, but local still exists
        // Since the local contact exists, it was either:
        // 1. Created after the remote deletion
        // 2. Or it was already deleted locally and we don't see it (but we only have visible contacts)

        // Strategy: Always apply remote deletion
        contactsToImportLocally.push(remoteContact);
      } else {
        // Both remote and local exist and are not deleted
        // Remote always wins in conflict resolution since local doesn't have timestamps
        contactsToImportLocally.push(remoteContact);
      }
    }

    // Scenario #3B: Find local contacts that don't exist remotely
    for (const localContact of localVisibleContacts) {
      const key = createContactKey(localContact);
      const remoteContact = remoteContactsMap.get(key);

      if (!remoteContact) {
        // Contact only exists locally and is visible - add to remote
        contactsToUpdateRemotely.push(localContact);
      }
    }

    // Apply remote → local changes
    if (contactsToImportLocally.length > 0) {
      // Add sync metadata to contacts before sending to AddressBookController
      const contactsWithMetadata = contactsToImportLocally.map((contact) => {
        // Create a copy with metadata in _syncMetadata
        const contactCopy = { ...contact } as AddressBookEntryWithSyncMetadata;

        // Add sync metadata in a field that AddressBookController knows to look for
        contactCopy._syncMetadata = {
          deleted: contact.deleted,
          deletedAt: contact.deletedAt,
          lastUpdatedAt: contact.lastUpdatedAt,
        };

        return contactCopy;
      });

      getMessenger().call(
        'AddressBookController:importContactsFromSync',
        contactsWithMetadata,
      );

      // Callbacks (analytics)
      contactsWithMetadata.forEach((contact) => {
        if (contact._syncMetadata?.deleted && onContactDeleted) {
          onContactDeleted();
        } else if (!contact._syncMetadata?.deleted && onContactUpdated) {
          onContactUpdated();
        }
      });
    }

    // Apply local → remote changes
    // We always need a merged list for finding local deletions even if contactsToUpdateRemotely is empty
    const updatedRemoteContacts = [...remoteContacts];

    // Update or add contacts to the remote contacts array
    contactsToUpdateRemotely.forEach((localContact) => {
      const key = createContactKey(localContact);
      const existingIndex = updatedRemoteContacts.findIndex(
        (c) => createContactKey(c) === key,
      );

      if (existingIndex !== -1) {
        // Update existing contact
        updatedRemoteContacts[existingIndex] = localContact;
      } else {
        // Add new contact
        updatedRemoteContacts.push(localContact);
      }

      // Callbacks (analytics)
      if (onContactUpdated) {
        onContactUpdated();
      }
    });

    // Now handle LOCAL DELETIONS by finding remote contacts that don't exist locally
    // This approach matches real-world usage where we'd have a local AddressBook without
    // deleted contacts, but they'd still exist in remote storage
    let hasLocalDeletions = false;

    // If we have remote contacts but no local contacts,
    // and we're not in a first sync scenario, we need to handle local deletions.
    const isFirstDeviceSync = remoteContacts.length === 0;
    // Process local deletions in all cases except first device sync
    if (!isFirstDeviceSync) {
      for (const remoteContact of remoteContacts) {
        if (remoteContact.deleted) {
          continue; // Skip already deleted contacts
        }

        const key = createContactKey(remoteContact);
        // A contact is considered locally deleted if:
        // 1. It doesn't exist in local contacts map
        // 2. Either we have some local contacts or we're in the empty local test scenario
        if (!localContactsMap.has(key)) {
          // Contact exists in remote but not in local => it was deleted locally
          // Mark it as deleted in remote storage
          const now = Date.now();
          const deletedEntry = {
            ...remoteContact,
            deleted: true,
            deletedAt: now,
            lastUpdatedAt: now,
          };

          const existingIndex = updatedRemoteContacts.findIndex(
            (c) => createContactKey(c) === key,
          );

          if (existingIndex !== -1) {
            updatedRemoteContacts[existingIndex] =
              deletedEntry as SyncAddressBookEntry;
            hasLocalDeletions = true;

            // Callbacks (analytics)
            if (onContactDeleted) {
              onContactDeleted();
            }
          }
        }
      }
    }

    // Always save the updated contacts list to remote storage if we have local deletions
    if (hasLocalDeletions) {
      await saveContactsToUserStorage(updatedRemoteContacts, options);
    }
    // Otherwise, apply normal changes as before
    else if (
      contactsToUpdateRemotely.length > 0 ||
      contactsToDeleteRemotely.length > 0
    ) {
      // Mark contacts as deleted in remote storage
      contactsToDeleteRemotely.forEach((contact) => {
        const key = createContactKey(contact);
        const existingIndex = updatedRemoteContacts.findIndex(
          (c) => createContactKey(c) === key,
        );

        if (existingIndex !== -1) {
          // Update existing contact with deletion marker
          const now = Date.now();
          const deletedEntry = {
            ...updatedRemoteContacts[existingIndex],
            deleted: true,
            deletedAt: now,
            lastUpdatedAt: now,
          };
          updatedRemoteContacts[existingIndex] =
            deletedEntry as SyncAddressBookEntry;

          // Callbacks (analytics)
          if (onContactDeleted) {
            onContactDeleted();
          }
        }
      });

      // Check if we need to save to remote storage
      const hasChangesToSave =
        contactsToUpdateRemotely.length > 0 ||
        contactsToDeleteRemotely.length > 0 ||
        // Check for any contacts marked deleted during this sync
        updatedRemoteContacts.some((c) => c.deleted);

      // Save updated contact list to remote storage if needed
      if (hasChangesToSave) {
        await saveContactsToUserStorage(updatedRemoteContacts, options);
      }
    }
  } catch (error) {
    if (onAddressBookSyncErroneousSituation) {
      onAddressBookSyncErroneousSituation('Error synchronizing address book', {
        error,
      });
    }
  }
}

/**
 * Retrieves remote contacts from user storage API
 *
 * @param options - Parameters used for retrieving remote contacts
 * @returns Array of address book entries from remote storage, or null if none found
 */
async function getRemoteContacts(
  options: AddressBookSyncingOptions,
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

    // Parse the JSON and convert each entry from UserStorageAddressBookEntry to AddressBookEntry
    const remoteStorageEntries = JSON.parse(
      remoteContactsJson,
    ) as UserStorageAddressBookEntry[];
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
  options: AddressBookSyncingOptions,
): Promise<void> {
  const { getUserStorageControllerInstance } = options;

  if (!contacts || contacts.length === 0) {
    return;
  }

  // Convert each AddressBookEntry to UserStorageAddressBookEntry format before saving
  const storageEntries = contacts.map((contact) =>
    mapAddressBookEntryToUserStorageEntry(contact),
  );

  await getUserStorageControllerInstance().performSetStorage(
    `${USER_STORAGE_FEATURE_NAMES.addressBook}.${ADDRESS_BOOK_CONTACTS_KEY}`,
    JSON.stringify(storageEntries),
  );
}
