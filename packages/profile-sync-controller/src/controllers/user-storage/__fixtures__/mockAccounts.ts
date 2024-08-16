import type { InternalAccount } from '@metamask/keyring-api';

import {
  LOCALIZED_DEFAULT_ACCOUNT_NAMES,
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from '../accounts/constants';
import { mapInternalAccountsListToUserStorageAccountsList } from '../accounts/user-storage';

/**
 * Get a random default account name from the list of localized default account names
 * @returns A random default account name
 */
export const getMockRandomDefaultAccountName = () =>
  LOCALIZED_DEFAULT_ACCOUNT_NAMES[
    Math.floor(Math.random() * LOCALIZED_DEFAULT_ACCOUNT_NAMES.length)
  ];

export const MOCK_INTERNAL_ACCOUNTS_LISTS = {
  EMPTY: [],
  ONE: [
    {
      address: '0x123',
      id: '1',
      metadata: {
        name: 'test',
        nameLastUpdatedAt: 1,
      },
    },
  ],
  ONE_DEFAULT_NAME: [
    {
      address: '0x123',
      id: '1',
      metadata: {
        name: `${getMockRandomDefaultAccountName()} 1`,
        nameLastUpdatedAt: 1,
      },
    },
  ],
  ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED: [
    {
      address: '0x123',
      id: '1',
      metadata: {
        name: 'Internal account custom name without nameLastUpdatedAt',
      },
    },
  ],
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED: [
    {
      address: '0x123',
      id: '1',
      metadata: {
        name: 'Internal account custom name with nameLastUpdatedAt',
        nameLastUpdatedAt: 1,
      },
    },
  ],
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT: [
    {
      address: '0x123',
      id: '1',
      metadata: {
        name: 'Internal account custom name with nameLastUpdatedAt',
        nameLastUpdatedAt: 9999,
      },
    },
  ],
  ALL: [
    {
      address: '0x123',
      id: '1',
      metadata: {
        name: 'test',
        nameLastUpdatedAt: 1,
      },
    },
    {
      address: '0x456',
      id: '2',
      metadata: {
        name: 'Account 2',
        nameLastUpdatedAt: 2,
      },
    },
    {
      address: '0x789',
      id: '3',
      metadata: {
        name: 'Účet 2',
        nameLastUpdatedAt: 3,
      },
    },
    {
      address: '0xabc',
      id: '4',
      metadata: {
        name: 'My Account 4',
        nameLastUpdatedAt: 4,
      },
    },
  ],
};

export const MOCK_USER_STORAGE_ACCOUNTS_LISTS = {
  SAME_AS_INTERNAL_FULL: {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    l: mapInternalAccountsListToUserStorageAccountsList(
      MOCK_INTERNAL_ACCOUNTS_LISTS.ALL as InternalAccount[],
    ),
  },
  ONE: {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    l: mapInternalAccountsListToUserStorageAccountsList(
      MOCK_INTERNAL_ACCOUNTS_LISTS.ONE as InternalAccount[],
    ),
  },
  ONE_DEFAULT_NAME: {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    l: mapInternalAccountsListToUserStorageAccountsList(
      MOCK_INTERNAL_ACCOUNTS_LISTS.ONE_DEFAULT_NAME as InternalAccount[],
    ),
  },
  ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED: {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    l: mapInternalAccountsListToUserStorageAccountsList([
      {
        ...MOCK_INTERNAL_ACCOUNTS_LISTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0],
        metadata: {
          name: 'User storage account custom name without nameLastUpdatedAt',
        },
      },
    ] as InternalAccount[]),
  },
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED: {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    l: mapInternalAccountsListToUserStorageAccountsList([
      {
        ...MOCK_INTERNAL_ACCOUNTS_LISTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0],
        metadata: {
          name: 'User storage account custom name with nameLastUpdatedAt',
          nameLastUpdatedAt: 3,
        },
      },
    ] as InternalAccount[]),
  },
};
