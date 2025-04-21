import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { getMockRandomDefaultAccountName } from './__fixtures__/mockAccounts';
import { USER_STORAGE_VERSION, USER_STORAGE_VERSION_KEY } from './constants';
import {
  isNameDefaultAccountName,
  mapInternalAccountToUserStorageAccount,
  isInternalAccountFromPrimarySRPHdKeyring,
  mapInternalAccountsListToPrimarySRPHdKeyringInternalAccountsList,
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

  describe('isInternalAccountFromPrimarySRPHdKeyring', () => {
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

    const getMessenger = jest.fn();
    const getUserStorageControllerInstance = jest.fn();

    it('should return true if the internal account is from the primary SRP and is from the HD keyring', async () => {
      getMessenger.mockReturnValue({
        call: jest.fn().mockResolvedValue(['0x123']),
      });

      const result = await isInternalAccountFromPrimarySRPHdKeyring(
        internalAccount,
        { getMessenger, getUserStorageControllerInstance },
      );

      expect(result).toBe(true);
    });

    it('should return false if the internal account is not from the primary SRP', async () => {
      getMessenger.mockReturnValue({
        call: jest.fn().mockResolvedValue(['0x456']),
      });

      const result = await isInternalAccountFromPrimarySRPHdKeyring(
        internalAccount,
        { getMessenger, getUserStorageControllerInstance },
      );

      expect(result).toBe(false);
    });

    it('should return false if the internal account is not from the HD keyring', async () => {
      getMessenger.mockReturnValue({
        call: jest.fn().mockResolvedValue(['0x123']),
      });

      const result = await isInternalAccountFromPrimarySRPHdKeyring(
        {
          ...internalAccount,
          metadata: { keyring: { type: KeyringTypes.simple } },
        } as InternalAccount,
        { getMessenger, getUserStorageControllerInstance },
      );

      expect(result).toBe(false);
    });
  });

  describe('mapInternalAccountsListToPrimarySRPHdKeyringInternalAccountsList', () => {
    const internalAccountsList = [
      {
        address: '0x123',
        id: '1',
        metadata: {
          name: `${getMockRandomDefaultAccountName()} 1`,
          nameLastUpdatedAt: 1620000000000,
          keyring: {
            type: KeyringTypes.hd,
          },
        },
      } as InternalAccount,
      {
        address: '0x456',
        id: '2',
        metadata: {
          name: `${getMockRandomDefaultAccountName()} 2`,
          nameLastUpdatedAt: 1620000000000,
          keyring: {
            type: KeyringTypes.simple,
          },
        },
      } as InternalAccount,
    ];

    const getMessenger = jest.fn();
    const getUserStorageControllerInstance = jest.fn();

    it('should return a list of internal accounts that are from the primary SRP and are from the HD keyring', async () => {
      getMessenger.mockReturnValue({
        call: jest.fn().mockResolvedValue(['0x123']),
      });

      const result =
        await mapInternalAccountsListToPrimarySRPHdKeyringInternalAccountsList(
          internalAccountsList,
          { getMessenger, getUserStorageControllerInstance },
        );

      expect(result).toStrictEqual([internalAccountsList[0]]);
    });
  });
});
