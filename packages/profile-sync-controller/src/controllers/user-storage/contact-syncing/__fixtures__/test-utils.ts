import type {
  AddressBookEntry,
  AddressType,
} from '@metamask/address-book-controller';
import type {
  ActionConstraint,
  EventConstraint,
} from '@metamask/base-controller';
import { Messenger as MessengerImpl } from '@metamask/base-controller';

import { MOCK_LOCAL_CONTACTS } from './mockContacts';

/**
 * Test Utility - create a mock user storage messenger for contact syncing tests
 *
 * @param options - options for the mock messenger
 * @param options.addressBook - options for the address book part of the controller
 * @param options.addressBook.contactsList - List of address book contacts to use
 * @returns Mock User Storage Messenger
 */
export function mockUserStorageMessengerForContactSyncing(options?: {
  addressBook?: {
    contactsList?: AddressBookEntry[];
  };
}): {
  messenger: {
    call: jest.Mock;
    registerActionHandler: jest.Mock;
    publish: unknown;
    subscribe: unknown;
    unsubscribe: unknown;
    clearEventSubscriptions: unknown;
    registerInitialEventPayload: jest.Mock;
  };
  baseMessenger: MessengerImpl<ActionConstraint, EventConstraint>;
  mockAddressBookList: jest.Mock;
  mockAddressBookSet: jest.Mock;
  mockAddressBookDelete: jest.Mock;
  contactsUpdatedFromSync: AddressBookEntry[]; // Track contacts that were updated via sync
} {
  // Start with a fresh messenger mock
  const baseMessenger = new MessengerImpl();

  // Contacts that are synced/updated will be stored here for test inspection
  const contactsUpdatedFromSync: AddressBookEntry[] = [];

  // Create our address book specific mocks
  const mockAddressBookList = jest.fn().mockImplementation(() => {
    return options?.addressBook?.contactsList || MOCK_LOCAL_CONTACTS.ONE;
  });

  const mockAddressBookSet = jest
    .fn()
    .mockImplementation(
      (
        address: string,
        name: string,
        chainId: string,
        memo: string,
        addressType?: AddressType,
      ) => {
        // Store the contact being set for later inspection
        contactsUpdatedFromSync.push({
          address,
          name,
          chainId: chainId as `0x${string}`,
          memo,
          isEns: false,
          addressType,
        });
        return true;
      },
    );

  const mockAddressBookDelete = jest.fn().mockImplementation(() => true);

  // Create a complete mock implementation
  const messenger = {
    call: jest.fn().mockImplementation((method: string, ...args: unknown[]) => {
      // Address book specific methods
      if (method === 'AddressBookController:list') {
        return mockAddressBookList(...args);
      }
      if (method === 'AddressBookController:set') {
        return mockAddressBookSet(...args);
      }
      if (method === 'AddressBookController:delete') {
        return mockAddressBookDelete(...args);
      }

      // Common methods needed by the controller
      if (method === 'KeyringController:getState') {
        return { isUnlocked: true };
      }
      if (method === 'AuthenticationController:isSignedIn') {
        return true;
      }
      if (method === 'KeyringController:keyringInitialized') {
        return true;
      }
      if (method === 'AuthenticationController:getSession') {
        return { profile: { v1: 'mockSessionProfile' } };
      }
      if (method === 'AuthenticationController:getSessionProfile') {
        return {
          identifierId: 'test-identifier-id',
          profileId: 'test-profile-id',
          metaMetricsId: 'test-metrics-id',
        };
      }
      if (method === 'AuthenticationController:getBearerToken') {
        return 'test-token';
      }
      if (method === 'AuthenticationController:checkAndRequestRenewSession') {
        return true;
      }
      if (method === 'UserService:performRequest') {
        // Mock successful API response for performRequest
        return { data: 'success' };
      }

      return undefined;
    }),
    registerActionHandler: jest.fn(),
    publish: baseMessenger.publish.bind(baseMessenger),
    subscribe: baseMessenger.subscribe.bind(baseMessenger),
    unsubscribe: baseMessenger.unsubscribe.bind(baseMessenger),
    clearEventSubscriptions:
      baseMessenger.clearEventSubscriptions.bind(baseMessenger),
    registerInitialEventPayload: jest.fn(),
  };

  return {
    messenger,
    baseMessenger,
    mockAddressBookList,
    mockAddressBookSet,
    mockAddressBookDelete,
    contactsUpdatedFromSync,
  };
}

export const createMockUserStorageContacts = async (contacts: unknown) => {
  return JSON.stringify(contacts);
};
