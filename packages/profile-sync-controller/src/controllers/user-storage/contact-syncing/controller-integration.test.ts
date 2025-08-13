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
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';

// Mock UserStorageController to avoid json-rpc-engine dependency issues
class MockUserStorageController {
  public state: any;

  constructor(options: { messenger: any; state: any }) {
    this.state = options.state;
  }

  async performGetStorageAllFeatureEntries(
    _path: string,
  ): Promise<string[] | null> {
    return null;
  }

  async performGetStorage(_path: string): Promise<string | null> {
    return null;
  }

  async performSetStorage(_path: string, _data: string): Promise<void | null> {
    return null;
  }

  async performBatchSetStorage(
    _path: string,
    _entries: [string, string][],
  ): Promise<void | null> {
    return null;
  }

  async setIsContactSyncingInProgress(
    _inProgress: boolean,
  ): Promise<void | null> {
    return null;
  }
}

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

  const controller = new MockUserStorageController({
    messenger: messengerMocks.messenger,
    state: {
      ...baseState,
      ...stateOverrides,
    },
  });

  const options = {
    getMessenger: () => messengerMocks.messenger as any,
    getUserStorageControllerInstance: () => controller,
  } as ContactSyncingOptions;

  return {
    messengerMocks,
    controller,
    options,
  };
};

describe('user-storage/contact-syncing/controller-integration - syncContactsWithUserStorage() tests', () => {
  beforeEach(() => {
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

    const mockList = jest.fn().mockReturnValue([]); // Return empty array instead of undefined
    options.getMessenger().call = mockList;

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {},
      options,
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

    const mockPerformGetStorageAllFeatureEntries = jest
      .spyOn(controller, 'performGetStorageAllFeatureEntries')
      .mockResolvedValue(null);

    const mockPerformBatchSetStorage = jest
      .spyOn(controller, 'performBatchSetStorage')
      .mockResolvedValue(undefined);

    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      },
      options,
    );

    expect(mockPerformGetStorageAllFeatureEntries).toHaveBeenCalledWith(
      USER_STORAGE_FEATURE_NAMES.addressBook,
    );
    expect(mockPerformBatchSetStorage).toHaveBeenCalled();

    expect(onContactUpdated).not.toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();

    // Assert that set wasn't called since we're only uploading to remote
    expect(messengerMocks.mockAddressBookSet).not.toHaveBeenCalled();
  });

  it('imports remote contacts to local if local is empty (e.g. new device)', async () => {
    const localContacts: AddressBookEntry[] = []; // Empty local contacts
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE]; // Not deleted remotely

    // Make sure remote contacts aren't already deleted
    remoteContacts.forEach((c: any) => {
      delete c.dt; // Remove any deletedAt timestamp
    });

    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest
      .spyOn(controller, 'performGetStorageAllFeatureEntries')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const onContactUpdated = jest.fn();

    // Don't include onContactDeleted in this test since we don't expect any deletions
    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {
        onContactUpdated,
      },
      options,
    );

    // Assert that set was called to add the remote contacts
    expect(messengerMocks.mockAddressBookSet).toHaveBeenCalled();

    // Verify that the remote contact was added
    expect(messengerMocks.contactsUpdatedFromSync.length).toBeGreaterThan(0);
    const importedContact = messengerMocks.contactsUpdatedFromSync.find(
      (c) => c.address.toLowerCase() === remoteContacts[0].a.toLowerCase(),
    );
    expect(importedContact).toBeDefined();

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
      .spyOn(controller, 'performGetStorageAllFeatureEntries')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const mockPerformBatchSetStorage = jest
      .spyOn(controller, 'performBatchSetStorage')
      .mockResolvedValue(undefined);

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {},
      options,
    );

    expect(mockPerformBatchSetStorage).toHaveBeenCalled();

    // No contacts should be imported locally
    expect(messengerMocks.mockAddressBookSet).not.toHaveBeenCalled();
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
      .spyOn(controller, 'performGetStorageAllFeatureEntries')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      {},
      options,
    );

    // Verify remote version was preferred (remote wins by timestamp)
    // The remote contact should be imported locally using set
    expect(messengerMocks.mockAddressBookSet).toHaveBeenCalled();

    // Find the contact that was set by its address
    const importedContact = messengerMocks.contactsUpdatedFromSync.find(
      (c) => c.address.toLowerCase() === localContact.address.toLowerCase(),
    );

    expect(importedContact).toBeDefined();
    expect(importedContact?.name).toBe('Remote Name'); // Should use remote name
  });

  it('syncs remote deletions to local', async () => {
    // Setup: We have a contact locally that's marked as deleted in remote storage
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE]; // One local contact
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE_DELETED]; // Same contact but deleted remotely

    // Make sure the remote contact is actually marked as deleted
    (remoteContacts[0] as any).dt = Date.now(); // Set a deletedAt timestamp

    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest
      .spyOn(controller, 'performGetStorageAllFeatureEntries')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const onContactDeleted = jest.fn();

    await ContactSyncingControllerIntegrationModule.syncContactsWithUserStorage(
      { onContactDeleted },
      options,
    );

    // Assert: 'delete' was called for the remote deletion
    expect(messengerMocks.mockAddressBookDelete).toHaveBeenCalled();

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
      .spyOn(controller, 'performGetStorageAllFeatureEntries')
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
      options,
    );

    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
  });
});

describe('user-storage/contact-syncing/controller-integration - updateContactInRemoteStorage() tests', () => {
  beforeEach(() => {
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

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      MOCK_LOCAL_CONTACTS.ONE[0],
      options,
    );

    expect(mockPerformSetStorage).not.toHaveBeenCalled();
  });

  it('updates an existing contact in remote storage', async () => {
    const localContact = MOCK_LOCAL_CONTACTS.ONE[0];

    const { options, controller } = await arrangeMocks();

    const mockPerformSetStorage = jest
      .spyOn(controller, 'performSetStorage')
      .mockResolvedValue(undefined);

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      localContact,
      options,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that setStorage was called with the individual contact key format
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    expect(setStorageCall[0]).toContain('addressBook.0x1_');
  });

  it('adds a new contact to remote storage if it does not exist', async () => {
    const localContact = MOCK_LOCAL_CONTACTS.ONE[0];

    const { options, controller } = await arrangeMocks();

    const mockPerformSetStorage = jest
      .spyOn(controller, 'performSetStorage')
      .mockResolvedValue(undefined);

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      localContact,
      options,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that setStorage was called with the individual contact key format
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    expect(setStorageCall[0]).toContain('addressBook.0x1_');
  });

  it('preserves existing lastUpdatedAt timestamp when updating contact', async () => {
    const timestamp = 1657000000000;
    const localContact = {
      ...MOCK_LOCAL_CONTACTS.ONE[0],
      lastUpdatedAt: timestamp,
    };

    const { options, controller } = await arrangeMocks();

    const mockPerformSetStorage = jest
      .spyOn(controller, 'performSetStorage')
      .mockResolvedValue(undefined);

    await ContactSyncingControllerIntegrationModule.updateContactInRemoteStorage(
      localContact,
      options,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that the contact was properly serialized
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    const contactData = JSON.parse(setStorageCall[1]);
    expect(contactData.lu).toBe(timestamp);
  });
});

describe('user-storage/contact-syncing/controller-integration - deleteContactInRemoteStorage() tests', () => {
  beforeEach(() => {
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
      options,
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
      .mockResolvedValue(
        (await createMockUserStorageContacts(remoteContacts))[0],
      );

    const mockPerformSetStorage = jest
      .spyOn(controller, 'performSetStorage')
      .mockResolvedValue(undefined);

    await ContactSyncingControllerIntegrationModule.deleteContactInRemoteStorage(
      contactToDelete,
      options,
    );

    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Check that setStorage was called with the individual contact key format
    const setStorageCall = mockPerformSetStorage.mock.calls[0];
    expect(setStorageCall[0]).toContain('addressBook.0x1_');

    // Verify the contact was marked as deleted
    const contactData = JSON.parse(setStorageCall[1]);
    expect(contactData.dt).toBeDefined(); // Should have a deletion timestamp
  });

  it('does nothing if contact does not exist in remote storage', async () => {
    const contactToDelete = MOCK_LOCAL_CONTACTS.ONE[0];

    const { options, controller } = await arrangeMocks();

    jest.spyOn(controller, 'performGetStorage').mockResolvedValue(null); // Contact doesn't exist

    const mockPerformSetStorage = jest
      .spyOn(controller, 'performSetStorage')
      .mockResolvedValue(undefined);

    await ContactSyncingControllerIntegrationModule.deleteContactInRemoteStorage(
      contactToDelete,
      options,
    );

    // SetStorage should not be called if the contact doesn't exist
    expect(mockPerformSetStorage).not.toHaveBeenCalled();
  });
});
