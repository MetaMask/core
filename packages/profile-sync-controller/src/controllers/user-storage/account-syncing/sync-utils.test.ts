import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  canPerformAccountSyncing,
  getInternalAccountsList,
  getUserStorageAccountsList,
} from './sync-utils';
import type { AccountSyncingConfig, AccountSyncingOptions } from './types';
import * as utils from './utils';

describe('user-storage/account-syncing/sync-utils', () => {
  describe('canPerformAccountSyncing', () => {
    it('returns false if profile syncing is not enabled', () => {
      const config: AccountSyncingConfig = { isAccountSyncingEnabled: true };
      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockReturnValue(true),
        }),
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          state: {
            isProfileSyncingEnabled: false,
            isAccountSyncingInProgress: false,
          },
        }),
      };

      expect(canPerformAccountSyncing(config, options)).toBe(false);
    });

    it('returns false if authentication is not enabled', () => {
      const config: AccountSyncingConfig = { isAccountSyncingEnabled: true };
      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockReturnValue(false),
        }),
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          state: {
            isProfileSyncingEnabled: true,
            isAccountSyncingInProgress: false,
          },
        }),
      };

      expect(canPerformAccountSyncing(config, options)).toBe(false);
    });

    it('returns false if account syncing is not enabled', () => {
      const config: AccountSyncingConfig = { isAccountSyncingEnabled: false };
      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockReturnValue(true),
        }),
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          state: {
            isProfileSyncingEnabled: true,
            isAccountSyncingInProgress: false,
          },
        }),
      };

      expect(canPerformAccountSyncing(config, options)).toBe(false);
    });

    it('returns false if account syncing is in progress', () => {
      const config: AccountSyncingConfig = { isAccountSyncingEnabled: true };
      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockReturnValue(true),
        }),
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          state: {
            isProfileSyncingEnabled: true,
            isAccountSyncingInProgress: true,
          },
        }),
      };

      expect(canPerformAccountSyncing(config, options)).toBe(false);
    });

    it('returns true if all conditions are met', () => {
      const config: AccountSyncingConfig = { isAccountSyncingEnabled: true };
      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockReturnValue(true),
        }),
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          state: {
            isProfileSyncingEnabled: true,
            isAccountSyncingInProgress: false,
          },
        }),
      };

      expect(canPerformAccountSyncing(config, options)).toBe(true);
    });
  });

  describe('getInternalAccountsList', () => {
    it('returns filtered internal accounts list', async () => {
      const internalAccounts = [
        { id: '1', metadata: { keyring: { type: KeyringTypes.hd } } },
        { id: '2', metadata: { keyring: { type: KeyringTypes.trezor } } },
      ] as InternalAccount[];

      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(internalAccounts),
        }),
        getUserStorageControllerInstance: jest.fn(),
      };

      jest
        .spyOn(utils, 'doesInternalAccountHaveCorrectKeyringType')
        .mockImplementation(
          (account) => account.metadata.keyring.type === KeyringTypes.hd,
        );

      const result = await getInternalAccountsList(options);
      expect(result).toStrictEqual([internalAccounts[0]]);
    });
  });

  describe('getUserStorageAccountsList', () => {
    it('returns parsed user storage accounts list', async () => {
      const rawAccounts = ['{"id":"1"}', '{"id":"2"}'];
      const options: AccountSyncingOptions = {
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          performGetStorageAllFeatureEntries: jest
            .fn()
            .mockResolvedValue(rawAccounts),
        }),
        getMessenger: jest.fn(),
      };

      const result = await getUserStorageAccountsList(options);
      expect(result).toStrictEqual([{ id: '1' }, { id: '2' }]);
    });

    it('returns null if no raw accounts are found', async () => {
      const options: AccountSyncingOptions = {
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          performGetStorageAllFeatureEntries: jest.fn().mockResolvedValue(null),
        }),
        getMessenger: jest.fn(),
      };

      const result = await getUserStorageAccountsList(options);
      expect(result).toBeNull();
    });
  });
});
