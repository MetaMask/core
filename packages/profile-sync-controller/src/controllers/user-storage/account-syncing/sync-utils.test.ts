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
    const arrangeMocks = ({
      isAccountSyncingEnabled = true,
      isProfileSyncingEnabled = true,
      isAccountSyncingInProgress = false,
      messengerCallControllerAndAction = 'AuthenticationController:isSignedIn',
      messengerCallCallback = () => true,
    }) => {
      const config: AccountSyncingConfig = { isAccountSyncingEnabled };
      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest
            .fn()
            .mockImplementation((controllerAndActionName) =>
              controllerAndActionName === messengerCallControllerAndAction
                ? messengerCallCallback()
                : null,
            ),
        }),
        getUserStorageControllerInstance: jest.fn().mockReturnValue({
          state: {
            isProfileSyncingEnabled,
            isAccountSyncingInProgress,
          },
        }),
      };

      return { config, options };
    };

    const failureCases = [
      ['profile syncing is not enabled', { isProfileSyncingEnabled: false }],
      [
        'authentication is not enabled',
        {
          messengerCallControllerAndAction:
            'AuthenticationController:isSignedIn',
          messengerCallCallback: () => false,
        },
      ],
      ['account syncing is not enabled', { isAccountSyncingEnabled: false }],
      ['account syncing is in progress', { isAccountSyncingInProgress: true }],
    ] as const;

    it.each(failureCases)('returns false if %s', (_message, mocks) => {
      const { config, options } = arrangeMocks(mocks);

      expect(canPerformAccountSyncing(config, options)).toBe(false);
    });

    it('returns true if all conditions are met', () => {
      const { config, options } = arrangeMocks({});

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
          call: jest
            .fn()
            .mockImplementation((controllerAndActionName) =>
              controllerAndActionName === 'AccountsController:listAccounts'
                ? internalAccounts
                : null,
            ),
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
