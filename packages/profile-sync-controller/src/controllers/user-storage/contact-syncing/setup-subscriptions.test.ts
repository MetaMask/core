import * as ControllerIntegration from './controller-integration';
import { setupContactSyncingSubscriptions } from './setup-subscriptions';
import * as SyncUtils from './sync-utils';

// Define a type for the contact data
type AddressBookContactData = {
  address: string;
  name: string;
  chainId?: string;
};

describe('user-storage/contact-syncing/setup-subscriptions - setupContactSyncingSubscriptions', () => {
  beforeEach(() => {
    jest
      .spyOn(SyncUtils, 'canPerformContactSyncing')
      .mockImplementation(() => true);

    // Mock the individual operations methods
    jest
      .spyOn(ControllerIntegration, 'updateContactInRemoteStorage')
      .mockResolvedValue(undefined);

    jest
      .spyOn(ControllerIntegration, 'deleteContactInRemoteStorage')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should subscribe to contactUpdated and contactDeleted events', () => {
    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: jest.fn(),
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncContactsWithUserStorage: jest.fn(),
        state: {
          isProfileSyncingEnabled: true,
          isContactSyncingEnabled: true,
        },
      }),
    };

    setupContactSyncingSubscriptions(options);

    expect(options.getMessenger().subscribe).toHaveBeenCalledWith(
      'AddressBookController:contactUpdated',
      expect.any(Function),
    );

    expect(options.getMessenger().subscribe).toHaveBeenCalledWith(
      'AddressBookController:contactDeleted',
      expect.any(Function),
    );
  });

  it('should call updateContactInRemoteStorage when contactUpdated event is triggered', () => {
    // Store the callbacks
    const callbacks: Record<string, (data: AddressBookContactData) => void> =
      {};

    // Mock the subscribe function to capture callbacks
    const mockSubscribe = jest
      .fn()
      .mockImplementation(
        (event: string, callback: (data: AddressBookContactData) => void) => {
          callbacks[event] = callback;
        },
      );

    const mocksyncContactsWithUserStorage = jest.fn();
    const mockUpdateContactInRemoteStorage = jest
      .spyOn(ControllerIntegration, 'updateContactInRemoteStorage')
      .mockResolvedValue(undefined);

    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: mockSubscribe,
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncContactsWithUserStorage: mocksyncContactsWithUserStorage,
        state: {
          isProfileSyncingEnabled: true,
          isContactSyncingEnabled: true,
        },
      }),
    };

    setupContactSyncingSubscriptions(options);

    // Assert that callback was registered
    expect(callbacks['AddressBookController:contactUpdated']).toBeDefined();

    // Sample contact with required properties
    const sampleContact = {
      address: '0x123',
      name: 'Test',
      chainId: '0x1',
    };

    // Simulate contactUpdated event
    callbacks['AddressBookController:contactUpdated'](sampleContact);

    // Verify the individual update method was called instead of full sync
    expect(mockUpdateContactInRemoteStorage).toHaveBeenCalledWith(
      sampleContact,
      options,
    );
    expect(mocksyncContactsWithUserStorage).not.toHaveBeenCalled();
  });

  it('should call deleteContactInRemoteStorage when contactDeleted event is triggered', () => {
    // Store the callbacks
    const callbacks: Record<string, (data: AddressBookContactData) => void> =
      {};

    // Mock the subscribe function to capture callbacks
    const mockSubscribe = jest
      .fn()
      .mockImplementation(
        (event: string, callback: (data: AddressBookContactData) => void) => {
          callbacks[event] = callback;
        },
      );

    const mocksyncContactsWithUserStorage = jest.fn();
    const mockDeleteContactInRemoteStorage = jest
      .spyOn(ControllerIntegration, 'deleteContactInRemoteStorage')
      .mockResolvedValue(undefined);

    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: mockSubscribe,
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncContactsWithUserStorage: mocksyncContactsWithUserStorage,
        state: {
          isProfileSyncingEnabled: true,
          isContactSyncingEnabled: true,
        },
      }),
    };

    setupContactSyncingSubscriptions(options);

    // Assert that callback was registered
    expect(callbacks['AddressBookController:contactDeleted']).toBeDefined();

    // Sample contact with required properties
    const sampleContact = {
      address: '0x123',
      name: 'Test',
      chainId: '0x1',
    };

    // Simulate contactDeleted event
    callbacks['AddressBookController:contactDeleted'](sampleContact);

    // Verify the individual delete method was called instead of full sync
    expect(mockDeleteContactInRemoteStorage).toHaveBeenCalledWith(
      sampleContact,
      options,
    );
    expect(mocksyncContactsWithUserStorage).not.toHaveBeenCalled();
  });

  it('should not call operations when canPerformContactSyncing returns false', () => {
    // Override the default mock to return false for this test
    jest
      .spyOn(SyncUtils, 'canPerformContactSyncing')
      .mockImplementation(() => false);

    // Store the callbacks
    const callbacks: Record<string, (data: AddressBookContactData) => void> =
      {};

    // Mock the subscribe function to capture callbacks
    const mockSubscribe = jest
      .fn()
      .mockImplementation(
        (event: string, callback: (data: AddressBookContactData) => void) => {
          callbacks[event] = callback;
        },
      );

    const mocksyncContactsWithUserStorage = jest.fn();
    const mockUpdateContactInRemoteStorage = jest
      .spyOn(ControllerIntegration, 'updateContactInRemoteStorage')
      .mockResolvedValue(undefined);
    const mockDeleteContactInRemoteStorage = jest
      .spyOn(ControllerIntegration, 'deleteContactInRemoteStorage')
      .mockResolvedValue(undefined);

    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: mockSubscribe,
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncContactsWithUserStorage: mocksyncContactsWithUserStorage,
        state: {
          isProfileSyncingEnabled: false,
          isContactSyncingEnabled: false,
        },
      }),
    };

    setupContactSyncingSubscriptions(options);

    // Assert that callbacks were registered
    expect(callbacks['AddressBookController:contactUpdated']).toBeDefined();
    expect(callbacks['AddressBookController:contactDeleted']).toBeDefined();

    // Sample contact
    const sampleContact = {
      address: '0x123',
      name: 'Test',
      chainId: '0x1',
    };

    // Simulate events
    callbacks['AddressBookController:contactUpdated'](sampleContact);
    callbacks['AddressBookController:contactDeleted'](sampleContact);

    // Verify no operations were called
    expect(mockUpdateContactInRemoteStorage).not.toHaveBeenCalled();
    expect(mockDeleteContactInRemoteStorage).not.toHaveBeenCalled();
    expect(mocksyncContactsWithUserStorage).not.toHaveBeenCalled();
  });

  it('should ignore contacts with chainId "*" for syncing', () => {
    // Store the callbacks
    const callbacks: Record<string, (data: AddressBookContactData) => void> =
      {};

    // Mock the subscribe function to capture callbacks
    const mockSubscribe = jest
      .fn()
      .mockImplementation(
        (event: string, callback: (data: AddressBookContactData) => void) => {
          callbacks[event] = callback;
        },
      );

    const mockUpdateContactInRemoteStorage = jest
      .spyOn(ControllerIntegration, 'updateContactInRemoteStorage')
      .mockResolvedValue(undefined);

    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: mockSubscribe,
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncContactsWithUserStorage: jest.fn(),
        state: {
          isProfileSyncingEnabled: true,
          isContactSyncingEnabled: true,
        },
      }),
    };

    setupContactSyncingSubscriptions(options);

    // Global account contact with chainId "*"
    const globalContact = {
      address: '0x123',
      name: 'Test Global',
      chainId: '*',
    };

    // Simulate contactUpdated event with global contact
    callbacks['AddressBookController:contactUpdated'](globalContact);

    // Verify the update method was NOT called for global contacts
    expect(mockUpdateContactInRemoteStorage).not.toHaveBeenCalled();
  });
});
