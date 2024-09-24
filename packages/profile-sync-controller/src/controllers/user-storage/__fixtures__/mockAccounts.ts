import { EthAccountType, type InternalAccount } from '@metamask/keyring-api';

import { LOCALIZED_DEFAULT_ACCOUNT_NAMES } from '../accounts/constants';
import { mapInternalAccountToUserStorageAccount } from '../accounts/user-storage';

/**
 * Map an array of internal accounts to an array of user storage accounts
 * Only used for testing purposes
 * @param internalAccounts - An array of internal accounts
 * @returns An array of user storage accounts
 */
const mapInternalAccountsListToUserStorageAccountsList = (
  internalAccounts: InternalAccount[],
) => internalAccounts.map(mapInternalAccountToUserStorageAccount);

/**
 * Get a random default account name from the list of localized default account names
 * @returns A random default account name
 */
export const getMockRandomDefaultAccountName = () =>
  LOCALIZED_DEFAULT_ACCOUNT_NAMES[
    Math.floor(Math.random() * LOCALIZED_DEFAULT_ACCOUNT_NAMES.length)
  ];

export const MOCK_INTERNAL_ACCOUNTS = {
  EMPTY: [],
  ONE: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
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
      type: EthAccountType.Eoa,
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
      type: EthAccountType.Eoa,
      metadata: {
        name: 'Internal account custom name without nameLastUpdatedAt',
      },
    },
  ],
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
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
      type: EthAccountType.Eoa,
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
      type: EthAccountType.Eoa,
      metadata: {
        name: 'test',
        nameLastUpdatedAt: 1,
      },
    },
    {
      address: '0x456',
      id: '2',
      type: EthAccountType.Eoa,
      metadata: {
        name: 'Account 2',
        nameLastUpdatedAt: 2,
      },
    },
    {
      address: '0x789',
      id: '3',
      type: EthAccountType.Eoa,
      metadata: {
        name: 'Účet 2',
        nameLastUpdatedAt: 3,
      },
    },
    {
      address: '0xabc',
      id: '4',
      type: EthAccountType.Eoa,
      metadata: {
        name: 'My Account 4',
        nameLastUpdatedAt: 4,
      },
    },
  ],
};

export const MOCK_USER_STORAGE_ACCOUNTS = {
  SAME_AS_INTERNAL_ALL: mapInternalAccountsListToUserStorageAccountsList(
    MOCK_INTERNAL_ACCOUNTS.ALL as InternalAccount[],
  ),
  ONE: mapInternalAccountsListToUserStorageAccountsList(
    MOCK_INTERNAL_ACCOUNTS.ONE as InternalAccount[],
  ),
  ONE_DEFAULT_NAME: mapInternalAccountsListToUserStorageAccountsList(
    MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
  ),
  ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED:
    mapInternalAccountsListToUserStorageAccountsList([
      {
        ...MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0],
        metadata: {
          name: 'User storage account custom name without nameLastUpdatedAt',
        },
      },
    ] as InternalAccount[]),
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED:
    mapInternalAccountsListToUserStorageAccountsList([
      {
        ...MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0],
        metadata: {
          name: 'User storage account custom name with nameLastUpdatedAt',
          nameLastUpdatedAt: 3,
        },
      },
    ] as InternalAccount[]),
};
