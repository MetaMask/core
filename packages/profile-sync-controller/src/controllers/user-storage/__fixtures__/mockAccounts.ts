import type { InternalAccount } from '@metamask/keyring-api';

import {
  LOCALIZED_DEFAULT_ACCOUNT_NAMES,
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from '../accounts/constants';
import { mapInternalAccountsListToUserStorageAccountsList } from '../accounts/user-storage';

export const MOCK_INTERNAL_ACCOUNTS_LIST = [
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
];

export const MOCK_USER_STORAGE_ACCOUNTS_LIST =
  mapInternalAccountsListToUserStorageAccountsList(
    MOCK_INTERNAL_ACCOUNTS_LIST as InternalAccount[],
  );

export const MOCK_ACCOUNTS_STORAGE_DATA = {
  [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
  l: MOCK_USER_STORAGE_ACCOUNTS_LIST,
};

export const getMockRandomDefaultAccountName = () =>
  LOCALIZED_DEFAULT_ACCOUNT_NAMES[
    Math.floor(Math.random() * LOCALIZED_DEFAULT_ACCOUNT_NAMES.length)
  ];
