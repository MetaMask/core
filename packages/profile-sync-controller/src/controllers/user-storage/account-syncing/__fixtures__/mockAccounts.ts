import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { LOCALIZED_DEFAULT_ACCOUNT_NAMES } from '../constants';
import { mapInternalAccountToUserStorageAccount } from '../utils';

/**
 * Map an array of internal accounts to an array of user storage accounts
 * Only used for testing purposes
 *
 * @param internalAccounts - An array of internal accounts
 * @returns An array of user storage accounts
 */
const mapInternalAccountsListToUserStorageAccountsList = (
  internalAccounts: InternalAccount[],
) => internalAccounts.map(mapInternalAccountToUserStorageAccount);

/**
 * Get a random default account name from the list of localized default account names
 *
 * @returns A random default account name
 */
export const getMockRandomDefaultAccountName = () =>
  LOCALIZED_DEFAULT_ACCOUNT_NAMES[
    Math.floor(Math.random() * LOCALIZED_DEFAULT_ACCOUNT_NAMES.length)
  ];

export const MOCK_ENTROPY_SOURCE_IDS = [
  'MOCK_ENTROPY_SOURCE_ID',
  'MOCK_ENTROPY_SOURCE_ID2',
];

export const MOCK_INTERNAL_ACCOUNTS = {
  EMPTY: [],
  ONE: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'test',
        nameLastUpdatedAt: 1,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
  ],
  ONE_DEFAULT_NAME: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: `${getMockRandomDefaultAccountName()} 1`,
        nameLastUpdatedAt: 1,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
  ],
  ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'Internal account custom name without nameLastUpdatedAt',
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
  ],
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'Internal account custom name with nameLastUpdatedAt',
        nameLastUpdatedAt: 1,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
  ],
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'Internal account custom name with nameLastUpdatedAt',
        nameLastUpdatedAt: 9999,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
  ],
  ALL: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'test',
        nameLastUpdatedAt: 1,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
    {
      address: '0x456',
      id: '2',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'Account 2',
        nameLastUpdatedAt: 2,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
    {
      address: '0x789',
      id: '3',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'Účet 2',
        nameLastUpdatedAt: 3,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
    {
      address: '0xabc',
      id: '4',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'My Account 4',
        nameLastUpdatedAt: 4,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
  ],
  MULTI_SRP: [
    {
      address: '0x123',
      id: '1',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'test',
        nameLastUpdatedAt: 1,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
    {
      address: '0x456',
      id: '2',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[0],
      },
      metadata: {
        name: 'test 2',
        nameLastUpdatedAt: 2,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
    {
      address: '0x789',
      id: '3',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[1],
      },
      metadata: {
        name: 'Account 2',
        nameLastUpdatedAt: 2,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
    {
      address: '0xabc',
      id: '4',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[1],
      },
      metadata: {
        name: 'Account 3',
        nameLastUpdatedAt: 3,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
    {
      address: '0xdef',
      id: '5',
      type: EthAccountType.Eoa,
      options: {
        entropySource: MOCK_ENTROPY_SOURCE_IDS[1],
      },
      metadata: {
        name: 'Account 4',
        nameLastUpdatedAt: 5,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    },
  ],
};

export const MOCK_USER_STORAGE_ACCOUNTS = {
  SAME_AS_INTERNAL_ALL: mapInternalAccountsListToUserStorageAccountsList(
    MOCK_INTERNAL_ACCOUNTS.ALL as unknown as InternalAccount[],
  ),
  ONE: mapInternalAccountsListToUserStorageAccountsList(
    MOCK_INTERNAL_ACCOUNTS.ONE as unknown as InternalAccount[],
  ),
  TWO_DEFAULT_NAMES_WITH_ONE_BOGUS:
    mapInternalAccountsListToUserStorageAccountsList([
      ...MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME,
      {
        ...MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME[0],
        address: '0x000000',
        metadata: {
          name: `${getMockRandomDefaultAccountName()} 1`,
          nameLastUpdatedAt: 2,
          keyring: {
            type: KeyringTypes.hd,
          },
        },
      },
    ] as unknown as InternalAccount[]),
  ONE_DEFAULT_NAME: mapInternalAccountsListToUserStorageAccountsList(
    MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as unknown as InternalAccount[],
  ),
  ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED:
    mapInternalAccountsListToUserStorageAccountsList([
      {
        ...MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0],
        metadata: {
          name: 'User storage account custom name without nameLastUpdatedAt',
          keyring: {
            type: KeyringTypes.hd,
          },
        },
      },
    ] as unknown as InternalAccount[]),
  ONE_CUSTOM_NAME_WITH_LAST_UPDATED:
    mapInternalAccountsListToUserStorageAccountsList([
      {
        ...MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0],
        metadata: {
          name: 'User storage account custom name with nameLastUpdatedAt',
          nameLastUpdatedAt: 3,
          keyring: {
            type: KeyringTypes.hd,
          },
        },
      },
    ] as unknown as InternalAccount[]),
  MULTI_SRP: {
    [MOCK_ENTROPY_SOURCE_IDS[0]]:
      mapInternalAccountsListToUserStorageAccountsList([
        MOCK_INTERNAL_ACCOUNTS.MULTI_SRP[0],
        MOCK_INTERNAL_ACCOUNTS.MULTI_SRP[1],
      ] as unknown as InternalAccount[]),
    [MOCK_ENTROPY_SOURCE_IDS[1]]:
      mapInternalAccountsListToUserStorageAccountsList([
        MOCK_INTERNAL_ACCOUNTS.MULTI_SRP[2],
        MOCK_INTERNAL_ACCOUNTS.MULTI_SRP[3],
        MOCK_INTERNAL_ACCOUNTS.MULTI_SRP[4],
      ] as unknown as InternalAccount[]),
  },
};
