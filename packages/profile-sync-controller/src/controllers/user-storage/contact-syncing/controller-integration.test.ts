/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AddressBookEntry } from '@metamask/address-book-controller';

import {
  MOCK_LOCAL_CONTACTS,
  MOCK_REMOTE_CONTACTS,
} from './__fixtures__/mockContacts';
import {
  mockUserStorageMessengerForContactSyncing,
  createMockUserStorageContacts,
} from './__fixtures__/test-utils';
import * as ContactSyncingControllerIntegrationModule from './controller-integration';
import * as ContactSyncingUtils from './sync-utils';
import type { ContactSyncingOptions } from './types';
import UserStorageController, { USER_STORAGE_FEATURE_NAMES } from '..';

const baseState = {
  isBackupAndSyncEnabled: true,
  isAccountSyncingEnabled: true,
  isContactSyncingEnabled: true,
  isBackupAndSyncUpdateLoading: false,
  hasAccountSyncingSyncedAtLeastOnce: false,
  isAccountSyncingReadyToBeDispatched: false,
  isAccountSyncingInProgress: false,
  isContactSyncingInProgress: false,
};

const arrangeMocks = async (
  {
    stateOverrides = baseState as Partial<typeof baseState>,
    messengerMockOptions,
  }: {
    stateOverrides?: Partial<typeof baseState>;
    messengerMockOptions?: Parameters<
      typeof mockUserStorageMessengerForContactSyncing
    >[0];
  } = {
    stateOverrides: baseState as Partial<typeof baseState>,
    messengerMockOptions: undefined,
  },
) => {
  const messengerMocks =
    mockUserStorageMessengerForContactSyncing(messengerMockOptions);

  const controller = new UserStorageController({
    messenger: messengerMocks.messenger as any,
    state: {
      ...baseState,
      ...stateOverrides,
    },
  });

  const options = {
    getMessenger: () => messengerMocks.messenger,
    getUserStorageControllerInstance: () => controller,
  };

  return {
    messengerMocks,
    controller,
    options,
  };
};

describe('user-storage/contact-syncing/controller-integration - syncContactsWithUserStorage() tests', () => {
  beforeEach(() => {
    // Create mock implementations to avoid actual API calls
    jest
      .spyOn(UserStorageController.prototype, 'performGetStorage')
      .mockImplementation((path) => {
        if (path === `${USER_STORAGE_FEATURE_NAMES.addressBook}.contacts`) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

    jest
      .spyOn(UserStorageController.prototype, 'performSetStorage')
      .mockResolvedValue(undefined);

    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns void if contact syncing is not enabled', async () => {
    const { options } = await arrangeMocks({
      stateOverrides: {
        isContactSyncingEnabled: false,
      },
    });

    // Override the default mock
    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => false);

    const mockList = jest.fn();
    options.getMessenger().call = mockList;

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {} as any,
      options as any,
    );

    expect(mockList).not.toHaveBeenCalled();
  });

  it('uploads local contacts to user storage if user storage is empty (first sync)', async () => {
    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: MOCK_LOCAL_CONTACTS.ONE,
        },
      },
    });

    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => true);

    const mockPerformGetStorage = jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(null);

    const mockPerformSetStorage = jest
      .spyOn(controller, 'performSetStorage')
      .mockResolvedValue(undefined);

    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      } as any,
      options as any,
    );

    expect(mockPerformGetStorage).toHaveBeenCalledWith(
      `${USER_STORAGE_FEATURE_NAMES.addressBook}.contacts`,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    expect(onContactUpdated).not.toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();

    // Assert that importContactsFromSync wasn't called since we're only uploading
    expect(
      messengerMocks.mockAddressBookImportContactsFromSync,
    ).not.toHaveBeenCalled();
  });

  it('imports remote contacts to local if local is empty (e.g. new device)', async () => {
    const localContacts: AddressBookEntry[] = []; // Empty local contacts
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE]; // Not deleted remotely

    // Make sure remote contacts aren't already deleted
    remoteContacts.forEach((c: any) => {
      c.d = false;
    });

    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      } as any,
    });

    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => true);

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const onContactUpdated = jest.fn();

    // Don't include onContactDeleted in this test since we don't expect any deletions
    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {
        onContactUpdated,
      } as any,
      options as any,
    );

    // Assert that importContactsFromSync was called with the remote contacts
    expect(
      messengerMocks.mockAddressBookImportContactsFromSync,
    ).toHaveBeenCalled();

    expect(onContactUpdated).toHaveBeenCalled();
  });

  it('resolves conflicts by using the most recent timestamp (local wins when newer)', async () => {
    // Create contacts with different names and explicit timestamps
    const baseTimestamp = 1657000000000;

    // Local contact has NEWER timestamp
    const localContact = {
      ...MOCK_LOCAL_CONTACTS.ONE[0],
      name: 'Local Name',
      lastUpdatedAt: baseTimestamp + 20000, // Local is 20 seconds newer
    };

    // Remote contact has OLDER timestamp
    const remoteContact = {
      ...MOCK_REMOTE_CONTACTS.ONE_DIFFERENT_NAME[0],
      n: 'Remote Name',
      lu: baseTimestamp + 10000, // Remote is 10 seconds newer
    };

    const localContacts = [localContact];
    const remoteContacts = [remoteContact];

    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {},
      options as unknown as ContactSyncingOptions,
    );

    // Verify local version was preferred (local wins by timestamp)
    expect(mockPerformSetStorage).toHaveBeenCalled();

    // The local contact should be sent to remote storage
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    const parsedContacts = JSON.parse(setStorageCall[1]);

    // Find contact by address (case-insensitive)
    const updatedContact = parsedContacts.find(
      (c: any) => c.a.toLowerCase() === localContact.address.toLowerCase(),
    );

    expect(updatedContact).toBeDefined();
    expect(updatedContact.n).toBe('Local Name'); // Should use local name

    // No contacts should be imported locally
    expect(
      messengerMocks.mockAddressBookImportContactsFromSync,
    ).not.toHaveBeenCalled();
  });

  it('resolves conflicts by using the most recent timestamp (remote wins when newer)', async () => {
    // Create contacts with different names and explicit timestamps
    const baseTimestamp = 1657000000000;

    // Local contact has OLDER timestamp
    const localContact = {
      ...MOCK_LOCAL_CONTACTS.ONE[0],
      name: 'Local Name',
      lastUpdatedAt: baseTimestamp + 10000, // Local is 10 seconds newer
    };

    // Remote contact has NEWER timestamp
    const remoteContact = {
      ...MOCK_REMOTE_CONTACTS.ONE_DIFFERENT_NAME[0],
      n: 'Remote Name',
      lu: baseTimestamp + 20000, // Remote is 20 seconds newer
    };

    const localContacts = [localContact];
    const remoteContacts = [remoteContact];

    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {},
      options as unknown as ContactSyncingOptions,
    );

    // Verify remote version was preferred (remote wins by timestamp)
    // The remote contact should be imported locally
    expect(
      messengerMocks.mockAddressBookImportContactsFromSync,
    ).toHaveBeenCalled();

    const importedContacts =
      messengerMocks.mockAddressBookImportContactsFromSync.mock.calls[0][0];

    // Find contact by address (case-insensitive)
    const importedContact = importedContacts.find(
      (c: any) =>
        c.address.toLowerCase() === localContact.address.toLowerCase(),
    );

    expect(importedContact).toBeDefined();
    expect(importedContact.name).toBe('Remote Name'); // Should use remote name
  });

  it('syncs local deletions to remote storage', async () => {
    // This test is challenging because the local deletion detection code
    // checks for the "new device scenario" (empty local but existing remote contacts)
    // which would prevent our test from working as expected

    // For simplicity, we'll just directly verify the function logic:
    // When a remote contact exists but a local contact doesn't,
    // the remote contact should be marked as deleted

    // Manually create a simple condition where we have:
    // - One local contact
    // - Two remote contacts (one matching local, one not in local -> should be marked as deleted)
    const localContact = {
      ...MOCK_LOCAL_CONTACTS.ONE[0],
    };

    // Create a second remote contact that doesn't exist locally
    const uniqueRemoteContact = {
      ...MOCK_REMOTE_CONTACTS.ONE[0],
      a: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12', // Different address
      n: 'Unique Remote Contact',
    };

    const localContacts = [localContact];
    const remoteContacts = [
      { ...MOCK_REMOTE_CONTACTS.ONE[0] }, // Will match local
      uniqueRemoteContact, // Will be detected as deleted
    ];

    // Ensure remote contacts aren't already marked as deleted
    remoteContacts.forEach((c: any) => {
      c.d = false;
    });

    const { options, controller } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    // Setup mocks for storage
    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');
    mockPerformSetStorage.mockImplementation(() => {
      return Promise.resolve();
    });

    const onContactDeleted = jest.fn();

    // Run the sync process
    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      { onContactDeleted },
      options as unknown as ContactSyncingOptions,
    );

    // Storage should have been called with updated data
    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Extract the updated contacts
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    const parsedContacts = JSON.parse(setStorageCall[1]);

    // Find the unique remote contact in the updated data
    const updatedUniqueContact = parsedContacts.find(
      (c: any) => c.a.toLowerCase() === uniqueRemoteContact.a.toLowerCase(),
    );

    // Verify it was marked as deleted
    expect(updatedUniqueContact).toBeDefined();
    expect(updatedUniqueContact.d).toBe(true);

    // Verify the callback was called
    expect(onContactDeleted).toHaveBeenCalled();
  });

  it('syncs remote deletions to local', async () => {
    // Setup: We have a contact locally that's marked as deleted in remote storage
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE]; // One local contact
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE_DELETED]; // Same contact but deleted remotely

    // Make sure the remote contact is actually marked as deleted
    (remoteContacts[0] as any).d = true; // Explicitly mark as deleted
    (remoteContacts[0] as any).dt = Date.now(); // Set a deletedAt timestamp

    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockReturnValue(true);

    const onContactDeleted = jest.fn();

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      { onContactDeleted },
      options as unknown as ContactSyncingOptions,
    );

    // Assert: importContactsFromSync was called with a deleted contact
    expect(
      messengerMocks.mockAddressBookImportContactsFromSync,
    ).toHaveBeenCalled();

    // Assert: Extract the contacts passed to importContactsFromSync
    const importedContacts =
      messengerMocks.mockAddressBookImportContactsFromSync.mock.calls[0][0];

    // Assert: at least one of the imported contacts has deleted=true in _syncMetadata
    expect(
      importedContacts.some((c: any) => c._syncMetadata?.deleted === true),
    ).toBe(true);

    // Assert: the deletion callback was called
    expect(onContactDeleted).toHaveBeenCalled();
  });

  it('restores a contact locally if remote has newer non-deleted version', async () => {
    // Create a scenario where remote has newer non-deleted version of a deleted local contact
    // 1. Local contact is deleted at time X
    // 2. Remote contact is updated at time X+1 (after deletion)
    const deletedAt = 1657000005000; // Deleted 5 seconds after base timestamp
    const updatedAt = 1657000010000; // Updated 10 seconds after base timestamp (after deletion)

    // Create a locally deleted contact
    const localDeletedContact = {
      ...MOCK_LOCAL_CONTACTS.ONE[0],
      deleted: true,
      deletedAt,
    };

    // Create a remotely updated contact with newer timestamp
    const remoteUpdatedContact = {
      ...MOCK_REMOTE_CONTACTS.ONE[0],
      n: 'Restored Contact Name', // Changed name
      lu: updatedAt, // Updated AFTER the local deletion
    };

    const { options, controller } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: [localDeletedContact],
        },
      },
    });

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(
        await createMockUserStorageContacts([remoteUpdatedContact]),
      );

    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      },
      options as unknown as ContactSyncingOptions,
    );

    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
  });
});

describe('user-storage/contact-syncing/controller-integration - updateContactInRemoteStorage() tests', () => {
  beforeEach(() => {
    jest
      .spyOn(UserStorageController.prototype, 'performGetStorage')
      .mockResolvedValue(null);

    jest
      .spyOn(UserStorageController.prototype, 'performSetStorage')
      .mockResolvedValue(undefined);

    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns void if contact syncing is not enabled', async () => {
    const { options, controller } = await arrangeMocks({
      stateOverrides: {
        isContactSyncingEnabled: false,
      },
    });

    // Override the default mock
    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => false);

    const mockPerformGetStorage = jest.spyOn(controller, 'performGetStorage');
    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      MOCK_LOCAL_CONTACTS.ONE[0],
      options as any,
    );

    expect(mockPerformGetStorage).not.toHaveBeenCalled();
    expect(mockPerformSetStorage).not.toHaveBeenCalled();
  });

  it('updates an existing contact in remote storage', async () => {
    const localContact = MOCK_LOCAL_CONTACTS.ONE[0];
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE]; // Same contact exists in remote

    const { options, controller } = await arrangeMocks();

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      localContact,
      options as any,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that setStorage was called with an array containing our updated contact
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    expect(setStorageCall[0]).toContain('addressBook.contacts');

    // Verify the contact was updated and not deleted
    const parsedContacts = JSON.parse(setStorageCall[1]);

    // Find contact by address (case-insensitive)
    const updatedContact = parsedContacts.find(
      (c: any) => c.a.toLowerCase() === localContact.address.toLowerCase(),
    );

    expect(updatedContact).toBeDefined();
    expect(updatedContact.d).toBeUndefined(); // Should not be marked as deleted
  });

  it('adds a new contact to remote storage if it does not exist', async () => {
    const localContact = MOCK_LOCAL_CONTACTS.ONE[0];

    // Empty remote contacts
    const remoteContacts: any[] = [];

    const { options, controller } = await arrangeMocks();

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      localContact,
      options as any,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that setStorage was called with an array containing our new contact
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    const parsedContacts = JSON.parse(setStorageCall[1]);

    // Verify correct number of contacts
    expect(parsedContacts).toHaveLength(1);

    // Verify contact properties (case-insensitive address comparison)
    const addedContact = parsedContacts[0];
    expect(addedContact.a.toLowerCase()).toBe(
      localContact.address.toLowerCase(),
    );
    expect(addedContact.n).toBe(localContact.name);
    expect(addedContact.d).toBeUndefined(); // Should not be marked as deleted
  });

  it('preserves existing lastUpdatedAt timestamp when updating contact', async () => {
    const timestamp = 1657000000000;
    const localContact = {
      ...MOCK_LOCAL_CONTACTS.ONE[0],
      lastUpdatedAt: timestamp,
    };
    const remoteContacts: any[] = [];

    const { options, controller } = await arrangeMocks();

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      localContact,
      options as any,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that the timestamp was preserved
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    const parsedContacts = JSON.parse(setStorageCall[1]);
    const addedContact = parsedContacts[0];

    expect(addedContact.lu).toBe(timestamp);
  });
});

describe('user-storage/contact-syncing/controller-integration - deleteContactInRemoteStorage() tests', () => {
  beforeEach(() => {
    jest
      .spyOn(UserStorageController.prototype, 'performGetStorage')
      .mockResolvedValue(null);

    jest
      .spyOn(UserStorageController.prototype, 'performSetStorage')
      .mockResolvedValue(undefined);

    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns void if contact syncing is not enabled', async () => {
    const { options, controller } = await arrangeMocks({
      stateOverrides: {
        isContactSyncingEnabled: false,
      },
    });

    // Override the default mock
    jest
      .spyOn(ContactSyncingUtils, 'canPerformContactSyncing')
      .mockImplementation(() => false);

    const mockPerformGetStorage = jest.spyOn(controller, 'performGetStorage');
    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.deleteContactInRemoteStorage(
      MOCK_LOCAL_CONTACTS.ONE[0],
      options as any,
    );

    expect(mockPerformGetStorage).not.toHaveBeenCalled();
    expect(mockPerformSetStorage).not.toHaveBeenCalled();
  });

  it('marks an existing contact as deleted in remote storage', async () => {
    const contactToDelete = MOCK_LOCAL_CONTACTS.ONE[0];
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE]; // Same contact exists in remote

    const { options, controller } = await arrangeMocks();

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.deleteContactInRemoteStorage(
      contactToDelete,
      options as any,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that setStorage was called with the contact marked as deleted
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    const parsedContacts = JSON.parse(setStorageCall[1]);

    // Find contact by address (case-insensitive)
    const deletedContact = parsedContacts.find(
      (c: any) => c.a.toLowerCase() === contactToDelete.address.toLowerCase(),
    );

    expect(deletedContact).toBeDefined();
    expect(deletedContact.d).toBe(true); // Should be marked as deleted
    expect(deletedContact.dt).toBeDefined(); // Should have a deletion timestamp
  });

  it('does nothing if contact does not exist in remote storage', async () => {
    const contactToDelete = MOCK_LOCAL_CONTACTS.ONE[0];

    // Empty remote contacts
    const remoteContacts: any[] = [];

    const { options, controller } = await arrangeMocks();

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.deleteContactInRemoteStorage(
      contactToDelete,
      options as any,
    );

    // SetStorage should not be called if the contact doesn't exist
    expect(mockPerformSetStorage).not.toHaveBeenCalled();
  });
});
