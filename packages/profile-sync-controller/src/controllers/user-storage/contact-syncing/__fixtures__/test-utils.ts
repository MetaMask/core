import type { AddressBookEntry } from '@metamask/address-book-controller';
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
  mockAddressBookImportContactsFromSync: jest.Mock;
} {
  // Start with a fresh messenger mock
  const baseMessenger = new MessengerImpl();

  // Create our address book specific mocks
  const mockAddressBookList = jest.fn().mockImplementation(() => {
    return options?.addressBook?.contactsList || MOCK_LOCAL_CONTACTS.ONE;
  });
  const mockAddressBookImportContactsFromSync = jest.fn();

  // Create a complete mock implementation
  const messenger = {
    call: jest.fn().mockImplementation((method: string, ...args: unknown[]) => {
      // Address book specific methods
      if (method === 'AddressBookController:list') {
        return mockAddressBookList(...args);
      }
      if (method === 'AddressBookController:importContactsFromSync') {
        return mockAddressBookImportContactsFromSync(...args);
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
      if (method === 'PreferencesController:getState') {
        return { selectedAddress: '0x123', identities: {} };
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
    mockAddressBookImportContactsFromSync,
  };
}

export const createMockUserStorageContacts = async (contacts: unknown) => {
  return JSON.stringify(contacts);
};
