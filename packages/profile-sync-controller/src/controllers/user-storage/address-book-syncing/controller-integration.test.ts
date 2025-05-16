import UserStorageController, { USER_STORAGE_FEATURE_NAMES } from '..';
import * as AddressBookSyncingControllerIntegrationModule from './controller-integration';
import * as AddressBookSyncingUtils from './sync-utils';
import { MOCK_LOCAL_CONTACTS, MOCK_REMOTE_CONTACTS } from './__fixtures__/mockContacts';
import { mockUserStorageMessengerForAddressBookSyncing, createMockUserStorageContacts } from './__fixtures__/test-utils';
import { mapUserStorageEntryToAddressBookEntry } from './utils';

// Mock endpoints
import {
  mockEndpointGetUserStorage,
  mockEndpointUpsertUserStorage,
} from '../__fixtures__/mockServices';

// Mock base state for the controller
const baseState = {
  isProfileSyncingEnabled: true,
  isAccountSyncingEnabled: true,
  isAddressBookSyncingEnabled: true,
  isProfileSyncingUpdateLoading: false,
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
    messengerMockOptions?: Parameters<typeof mockUserStorageMessengerForAddressBookSyncing>[0];
  } = {
    stateOverrides: baseState as Partial<typeof baseState>,
    messengerMockOptions: undefined,
  },
) => {
  const messengerMocks = mockUserStorageMessengerForAddressBookSyncing(messengerMockOptions);
  
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
    jest.spyOn(UserStorageController.prototype, 'performGetStorage').mockImplementation((path) => {
      if (path === `${USER_STORAGE_FEATURE_NAMES.addressBook}.contacts`) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
    
    jest.spyOn(UserStorageController.prototype, 'performSetStorage').mockResolvedValue(undefined);
    
    jest.spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
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
    jest.spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
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

    jest.spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);
    
    const mockPerformGetStorage = jest.spyOn(controller, 'performGetStorage')
      .mockResolvedValue(null);
      
    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage')
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
      `${USER_STORAGE_FEATURE_NAMES.addressBook}.contacts`
    );
    
    expect(mockPerformSetStorage).toHaveBeenCalled();
    
    expect(onContactUpdated).not.toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
    
    // Assert that importContactsFromSync wasn't called since we're only uploading
    expect(messengerMocks.mockAddressBookImportContactsFromSync).not.toHaveBeenCalled();
  });

  it('imports remote contacts to local if local is empty (new device)', async () => {
    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: [], // Empty local contacts
        },
      } as any,
    });

    jest.spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);
    
    const mockPerformGetStorage = jest.spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(MOCK_REMOTE_CONTACTS.ONE));
      
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
      `${USER_STORAGE_FEATURE_NAMES.addressBook}.contacts`
    );
    
    // Assert that importContactsFromSync was called with the remote contacts
    expect(messengerMocks.mockAddressBookImportContactsFromSync).toHaveBeenCalled();
    
    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled(); // No deletions in this scenario
  });

  it('resolves conflicts by using the most recent timestamp (remote wins)', async () => {
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE]; 
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE_DIFFERENT_NAME]; // Remote has different name and we force it to have a NEWER timestamp
    if (localContacts[0].lastUpdatedAt && remoteContacts[0]) {
      remoteContacts[0].lu = (localContacts[0].lastUpdatedAt || 0) + 10000;
    }
    
    const { options, controller } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest.spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));
    
    const spy = jest.spyOn(AddressBookSyncingControllerIntegrationModule, 'syncAddressBookWithUserStorage');
    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();
    
    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      },
      options,
    );
        
    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
  });
  
  it('resolves conflicts by using the most recent timestamp (local wins)', async () => {
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE_UPDATED_NAME]; // Local has NEWER timestamp
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE]; 
    
    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      } as any,
    });

    jest.spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);
    
    const mockPerformGetStorage = jest.spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));
      
    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage')
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
    
    // Assert: Should NOT import the remote contact to local because local is newer
    expect(messengerMocks.mockAddressBookImportContactsFromSync).not.toHaveBeenCalled();
    
    // Assert: Should update remote storage with the newer local contact
    expect(mockPerformSetStorage).toHaveBeenCalled();
    
    expect(onContactUpdated).toHaveBeenCalled();
    expect(onContactDeleted).not.toHaveBeenCalled();
  });

  it('syncs local deletions to remote storage', async () => {
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE_DELETED]; // Deleted locally
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE]; // Not deleted remotely
    
    const { options, controller, messengerMocks } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      } as any,
    });

    jest.spyOn(AddressBookSyncingUtils, 'canPerformAddressBookSyncing')
      .mockImplementation(() => true);
    
    const mockPerformGetStorage = jest.spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));
      
    const mockPerformSetStorage = jest.spyOn(controller, 'performSetStorage')
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
    
    // Assert: Should update remote storage with the deletion
    expect(mockPerformSetStorage).toHaveBeenCalled();
    
    // Assert: Should NOT import the remote contact to local
    expect(messengerMocks.mockAddressBookImportContactsFromSync).not.toHaveBeenCalled();
    
    expect(onContactUpdated).not.toHaveBeenCalled();
    expect(onContactDeleted).toHaveBeenCalled();
  });
  
  it('syncs remote deletions to local', async () => {
    const localContacts = [...MOCK_LOCAL_CONTACTS.ONE]; // Not deleted locally
    const remoteContacts = [...MOCK_REMOTE_CONTACTS.ONE_DELETED]; // Deleted remotely
    
    // Ensure the remote deletion timestamp is newer
    if (remoteContacts[0] && localContacts[0]) {
      (remoteContacts[0] as any).dt = (localContacts[0].lastUpdatedAt || 0) + 10000;
    }
    
    const { options, controller } = await arrangeMocks({
      messengerMockOptions: {
        addressBook: {
          contactsList: localContacts,
        },
      },
    });

    jest.spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts(remoteContacts));
      
    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();
    
    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
      {
        onContactUpdated,
        onContactDeleted,
      },
      options,
    );
        
    expect(onContactDeleted).toHaveBeenCalled();
    expect(onContactUpdated).not.toHaveBeenCalled();
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

    jest.spyOn(controller, 'performGetStorage')
      .mockResolvedValue(await createMockUserStorageContacts([remoteUpdatedContact]));
      
    const onContactUpdated = jest.fn();
    const onContactDeleted = jest.fn();
    
    await AddressBookSyncingControllerIntegrationModule.syncAddressBookWithUserStorage(
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