/* eslint-disable jsdoc/require-jsdoc */
import type { Bip44Account } from '@metamask/account-api';
import {
  MOCK_ENTROPY_SOURCE_1,
  MOCK_ENTROPY_SOURCE_2,
  MOCK_SOL_ACCOUNT_1,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
} from '@metamask/account-api/mocks';
import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

export const MOCK_HD_KEYRING_1 = {
  type: KeyringTypes.hd,
  metadata: { id: MOCK_ENTROPY_SOURCE_1, name: 'HD Keyring 1' },
  accounts: ['0x123'],
};

export const MOCK_HD_KEYRING_2 = {
  type: KeyringTypes.hd,
  metadata: { id: MOCK_ENTROPY_SOURCE_2, name: 'HD Keyring 2' },
  accounts: ['0x456'],
};

export const MOCK_SOL_INTERNAL_ACCOUNT_1: Bip44Account<InternalAccount> = {
  ...MOCK_SOL_ACCOUNT_1,
  metadata: {
    name: 'Solana Account 1',
    importTime: 0,
    keyring: {
      type: KeyringTypes.snap,
    },
  },
};

export const MOCK_HD_INTERNAL_ACCOUNT_1: Bip44Account<InternalAccount> = {
  ...MOCK_HD_ACCOUNT_1,
  metadata: {
    name: 'Account 1',
    importTime: 0,
    keyring: {
      type: KeyringTypes.hd,
    },
  },
};

export const MOCK_HD_INTERNAL_ACCOUNT_2: Bip44Account<InternalAccount> = {
  ...MOCK_HD_ACCOUNT_2,
  metadata: {
    name: 'Account 2',
    importTime: 0,
    keyring: {
      type: KeyringTypes.hd,
    },
  },
};

export function mockAsInternalAccount(
  account: KeyringAccount,
): InternalAccount {
  return {
    ...account,
    metadata: {
      name: 'Mocked Account',
      importTime: Date.now(),
      keyring: {
        type: 'mock-keyring-type',
      },
    },
  };
}
