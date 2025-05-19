/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AddressBookEntry } from '@metamask/address-book-controller';

import {
  MOCK_LOCAL_CONTACTS,
  MOCK_REMOTE_CONTACTS,
} from './__fixtures__/mockContacts';
import {
  mockUserStorageMessengerForAddressBookSyncing,
  createMockUserStorageContacts,
} from './__fixtures__/test-utils';
import * as AddressBookSyncingControllerIntegrationModule from './controller-integration';
import * as AddressBookSyncingUtils from './sync-utils';
import type { AddressBookSyncingOptions } from './types';
import UserStorageController, { USER_STORAGE_FEATURE_NAMES } from '..';

const baseState = {
  isBackupAndSyncEnabled: true,
  isAccountSyncingEnabled: true,
  isAddressBookSyncingEnabled: true,
  isBackupAndSyncUpdateLoading: false,
  hasAccountSyncingSyncedAtLeastOnce: false,
  isAccountSyncingReadyToBeDispatched: false,
  isAccountSyncingInProgress: false,
};

const arrangeMocks = async (
  {
    stateOverrides = baseState as Partial<typeof baseState>,
    messengerMockOptions,
  }: {
    stateOverrides?: Partial<typeof baseState>;
    messengerMockOptions?: Parameters<
      typeof mockUserStorageMessengerForAddressBookSyncing
    >[0];
  } = {
    stateOverrides: baseState as Partial<typeof baseState>,
    messengerMockOptions: undefined,
  },
) => {
  const messengerMocks =
    mockUserStorageMessengerForAddressBookSyncing(messengerMockOptions);

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

describe('user-storage/address-book-syncing/controller-integration - syncAddressBookWithUserStorage() tests', () => {
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
      .spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns void if address book syncing is not enabled', async () => {
    const { options } = await arrangeMocks({
      stateOverrides: {
        isAddressBookSyncingEnabled: false,
      },
    });

    // Override the default mock
    jest
      .spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => false);

    const mockList = jest.fn();
    options.getMessenger().call = mockList;

    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
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
      .spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);

    const mockPerformGetStorage = jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(null);

    const mockPerformSetStorage = jest
      .spyOn(controller, 'performSetStorage')
      .mockResolvedValue(undefined);

    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();

    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
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

  it('imports remote contacts to local if local is empty (e.g.new device)', async () => {
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
      .spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const onContactUpdated = jest.fn();

    // Don't include onContactDeleted in this test since we don't expect any deletions
    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
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

  it('resolves conflicts by using the most recent timestamp (remote wins)', async () => {
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE];
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE_DIFFERENT_NAME]; // Remote has different name and we force it to have a NEWER timestamp

    expect(localContacts[0]).toBeDefined();
    expect(remoteContacts[0]).toBeDefined();

    const baseTimestamp = 1657000000000; // Fixed timestamp for testing
    remoteContacts[0].lu = baseTimestamp + 10000;

    const { options, controller } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();

    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      },
      options as unknown as AddressBookSyncingOptions,
    );

    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
  });

  it('resolves conflicts by applying remote entries', async () => {
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE_UPDATED_NAME]; // Local has NEWER timestamp
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE];

    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      } as any,
    });

    jest
      .spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);

    jest
      .spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));

    jest.spyOn(controller, 'performSetStorage').mockResolvedValue(undefined);

    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();

    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      } as any,
      options as unknown as AddressBookSyncingOptions,
    );

    // Assert: Remote always wins, so we should always import from remote
    expect(
      messengerMocks.mockAddressBookImportContactsFromSync,
    ).toHaveBeenCalled();

    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
  });

  it('syncs local deletions to remote storage', async () => {
    // Setup: We'll directly trigger the local deletion detection logic
    // by having a contact exist in remote but not in local
    const localContacts: AddressBookEntry[] = []; // No local contacts
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE]; // One remote contact

    // Make sure remote contacts aren't already deleted
    remoteContacts.forEach((c: any) => {
      c.d = false;
    });

    // Spy on the controller methods
    const { options, controller } = await arrangeMocks({
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
      .spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockReturnValue(true);

    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage');
    mockPerformSetStorage.mockImplementation(() => {
      return Promise.resolve();
    });

    const onContactDeleted = jest.fn();

    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
      { onContactDeleted },
      options as unknown as AddressBookSyncingOptions,
    );

    // Assert: setStorage was called
    expect(mockPerformSetStorage).toHaveBeenCalled();

    // Assert: onContactDeleted callback was triggered
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
      .spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockReturnValue(true);

    const onContactDeleted = jest.fn();

    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
      { onContactDeleted },
      options as unknown as AddressBookSyncingOptions,
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

    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      },
      options as unknown as AddressBookSyncingOptions,
    );

    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
  });
});
