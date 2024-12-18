import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { getMockRandomDefaultAccountName } from './__fixtures__/mockAccounts';
import { USER_STORAGE_VERSION, USER_STORAGE_VERSION_KEY } from './constants';
import {
  doesInternalAccountHaveCorrectKeyringType,
  isNameDefaultAccountName,
  mapInternalAccountToUserStorageAccount,
} from './utils';

describe('user-storage/account-syncing/utils', () => {
  describe('isNameDefaultAccountName', () => {
    it('should return true for default account names', () => {
      expect(
        isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 89`),
      ).toBe(true);
      expect(
        isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 1`),
      ).toBe(true);
      expect(
        isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 123543`),
      ).toBe(true);
    });

    it('should return false for non-default account names', () => {
      expect(isNameDefaultAccountName('My Account')).toBe(false);
      expect(isNameDefaultAccountName('Mon compte 34')).toBe(false);
    });
  });
  describe('mapInternalAccountToUserStorageAccount', () => {
    const internalAccount = {
      address: '0x123',
      id: '1',
      metadata: {
        name: `${getMockRandomDefaultAccountName()} 1`,
        nameLastUpdatedAt: 1620000000000,
        keyring: {
          type: KeyringTypes.hd,
        },
      },
    } as InternalAccount;

    it('should map an internal account to a user storage account with default account name', () => {
      const userStorageAccount =
        mapInternalAccountToUserStorageAccount(internalAccount);

      expect(userStorageAccount).toStrictEqual({
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: internalAccount.address,
        i: internalAccount.id,
        n: internalAccount.metadata.name,
      });
    });

    it('should map an internal account to a user storage account with non-default account name', () => {
      const internalAccountWithCustomName = {
        ...internalAccount,
        metadata: {
          ...internalAccount.metadata,
          name: 'My Account',
        },
      } as InternalAccount;

      const userStorageAccount = mapInternalAccountToUserStorageAccount(
        internalAccountWithCustomName,
      );

      expect(userStorageAccount).toStrictEqual({
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: internalAccountWithCustomName.address,
        i: internalAccountWithCustomName.id,
        n: internalAccountWithCustomName.metadata.name,
        nlu: internalAccountWithCustomName.metadata.nameLastUpdatedAt,
      });
    });
  });

  describe('doesInternalAccountHaveCorrectKeyringType', () => {
    it('should return true if the internal account has the correct keyring type', () => {
      const internalAccount = {
        metadata: {
          keyring: {
            type: KeyringTypes.hd,
          },
        },
      } as InternalAccount;

      expect(doesInternalAccountHaveCorrectKeyringType(internalAccount)).toBe(
        true,
      );
    });

    it('should return false if the internal account does not have the correct keyring type', () => {
      const internalAccount = {
        metadata: {
          keyring: {
            type: KeyringTypes.snap,
          },
        },
      } as InternalAccount;

      expect(doesInternalAccountHaveCorrectKeyringType(internalAccount)).toBe(
        false,
      );
    });
  });
});
