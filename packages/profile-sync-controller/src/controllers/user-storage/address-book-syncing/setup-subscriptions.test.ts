import { setupAddressBookSyncingSubscriptions } from './setup-subscriptions';

// Define a type for the contact data
type AddressBookContactData = {
  address: string;
  name: string;
};

describe('user-storage/address-book-syncing/setup-subscriptions - setupAddressBookSyncingSubscriptions', () => {
  it('should subscribe to contactUpdated and contactDeleted events', () => {
    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: jest.fn(),
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncAddressBookWithUserStorage: jest.fn(),
        state: {
          isProfileSyncingEnabled: true,
          isAddressBookSyncingEnabled: true,
        },
      }),
    };

    setupAddressBookSyncingSubscriptions(options);

    expect(options.getMessenger().subscribe).toHaveBeenCalledWith(
      'AddressBookController:contactUpdated',
      expect.any(Function),
    );

    expect(options.getMessenger().subscribe).toHaveBeenCalledWith(
      'AddressBookController:contactDeleted',
      expect.any(Function),
    );
  });

  it('should call getUserStorageControllerInstance().syncAddressBookWithUserStorage when events are triggered', () => {
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

    const mockSyncAddressBookWithUserStorage = jest.fn();

    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: mockSubscribe,
        call: jest.fn().mockReturnValue(true), // Mock canPerformAddressBookSyncing to return true
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncAddressBookWithUserStorage: mockSyncAddressBookWithUserStorage,
        state: {
          isProfileSyncingEnabled: true,
          isAddressBookSyncingEnabled: true,
        },
      }),
    };

    setupAddressBookSyncingSubscriptions(options);

    // Assert that callbacks were registered
    expect(callbacks['AddressBookController:contactUpdated']).toBeDefined();
    expect(callbacks['AddressBookController:contactDeleted']).toBeDefined();

    // Simulate contactUpdated event
    callbacks['AddressBookController:contactUpdated']({
      address: '0x123',
      name: 'Test',
    });
    expect(mockSyncAddressBookWithUserStorage).toHaveBeenCalled();

    // Reset the mock
    mockSyncAddressBookWithUserStorage.mockClear();

    // Simulate contactDeleted event
    callbacks['AddressBookController:contactDeleted']({
      address: '0x123',
      name: 'Test',
    });
    expect(mockSyncAddressBookWithUserStorage).toHaveBeenCalled();
  });

  it('should not call syncAddressBookWithUserStorage when canPerformAddressBookSyncing returns false', () => {
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

    const mockSyncAddressBookWithUserStorage = jest.fn();

    // Set up the mock to make canPerformAddressBookSyncing return false
    const options = {
      getMessenger: jest.fn().mockReturnValue({
        subscribe: mockSubscribe,
        call: jest.fn().mockReturnValue(false), // This will make canPerformAddressBookSyncing return false
      }),
      getUserStorageControllerInstance: jest.fn().mockReturnValue({
        syncAddressBookWithUserStorage: mockSyncAddressBookWithUserStorage,
        state: {
          isProfileSyncingEnabled: false,
          isAddressBookSyncingEnabled: false,
        },
      }),
    };

    setupAddressBookSyncingSubscriptions(options);

    // Assert that callback was registered
    expect(callbacks['AddressBookController:contactUpdated']).toBeDefined();

    // Simulate contactUpdated event
    callbacks['AddressBookController:contactUpdated']({
      address: '0x123',
      name: 'Test',
    });
    expect(mockSyncAddressBookWithUserStorage).not.toHaveBeenCalled();
  });
});
