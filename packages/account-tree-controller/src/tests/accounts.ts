/* eslint-disable jsdoc/require-jsdoc */
import type { Bip44Account } from '@metamask/account-api';
import {
  MOCK_ENTROPY_SOURCE_1,
  MOCK_ENTROPY_SOURCE_2,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MOCK_SNAP_ACCOUNT_1,
  MOCK_SNAP_ACCOUNT_2,
  MOCK_HARDWARE_ACCOUNT_1,
  MOCK_SNAP_2,
  MOCK_SNAP_1,
  MockAccountBuilder,
} from '@metamask/account-api/mocks';
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

function withMetadata(name: string, keyringType: KeyringTypes) {
  return {
    metadata: {
      name,
      importTime: 0,
      keyring: {
        type: keyringType,
      },
    },
  };
}

function withSnapMetadata(
  name: string,
  snap: { id: string; name: string; enabled: boolean },
) {
  return {
    metadata: {
      ...withMetadata(name, KeyringTypes.snap).metadata,
      snap,
    },
  };
}

export const MOCK_HD_INTERNAL_ACCOUNT_1: Bip44Account<InternalAccount> = {
  ...MOCK_HD_ACCOUNT_1,
  ...withMetadata('Account 1', KeyringTypes.hd),
};

export const MOCK_HD_INTERNAL_ACCOUNT_2: Bip44Account<InternalAccount> = {
  ...MOCK_HD_ACCOUNT_2,
  ...withMetadata('Account 2', KeyringTypes.hd),
};

export const MOCK_SNAP_INTERNAL_ACCOUNT_1: Bip44Account<InternalAccount> = {
  ...MockAccountBuilder.from(MOCK_SNAP_ACCOUNT_1).withGroupIndex(1).get(),
  ...withSnapMetadata('Snap Account 1', MOCK_SNAP_1),
};

export const MOCK_SNAP_INTERNAL_ACCOUNT_2: InternalAccount = {
  ...MOCK_SNAP_ACCOUNT_2,
  ...withSnapMetadata('Snap Account 2', MOCK_SNAP_2),
};

export const MOCK_HARDWARE_INTERNAL_ACCOUNT_1: InternalAccount = {
  ...MOCK_HARDWARE_ACCOUNT_1,
  ...withMetadata('Ledger Account 1', KeyringTypes.ledger),
};
