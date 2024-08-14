import type { InternalAccount } from '@metamask/keyring-api';

import {
  LOCALIZED_DEFAULT_ACCOUNT_NAMES,
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from '../accounts/constants';
import { mapInternalAccountsListToUserStorageAccountsList } from '../accounts/user-storage';

export const MOCK_INTERNAL_ACCOUNTS_LISTS = {
  EMPTY: [],
  JUST_ONE: [
    {
      address: '0x123',
      id: '1',
      metadata: {
        name: 'test',
        nameLastUpdatedAt: 1,
      },
    },
  ],
  FULL: [
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
      MOCK_INTERNAL_ACCOUNTS_LISTS.FULL as InternalAccount[],
    ),
  },
  JUST_ONE: {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    l: mapInternalAccountsListToUserStorageAccountsList(
      MOCK_INTERNAL_ACCOUNTS_LISTS.JUST_ONE as InternalAccount[],
    ),
  },
};

/**
 * Get a random default account name from the list of localized default account names
 * @returns A random default account name
 */
export const getMockRandomDefaultAccountName = () =>
  LOCALIZED_DEFAULT_ACCOUNT_NAMES[
    Math.floor(Math.random() * LOCALIZED_DEFAULT_ACCOUNT_NAMES.length)
  ];
