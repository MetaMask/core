import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  canPerformAccountSyncing,
  getInternalAccountsList,
  getUserStorageAccountsList,
} from './sync-utils';
import type { AccountSyncingOptions } from './types';

describe('user-storage/account-syncing/sync-utils', () => {
  describe('canPerformAccountSyncing', () => {
    const arrangeMocks = ({
      isProfileSyncingEnabled = true,
      isAccountSyncingEnabled = true,
      isAccountSyncingInProgress = false,
      messengerCallControllerAndAction = 'AuthenticationController:isSignedIn',
      messengerCallCallback = () => true,
    }) => {
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
            isAccountSyncingEnabled,
            isAccountSyncingInProgress,
          },
        }),
      };

      return { options };
    };

    const failureCases = [
      ['profile syncing is not enabled', { isProfileSyncingEnabled: false }],
      [
        'profile syncing is not enabled but account syncing is',
        { isProfileSyncingEnabled: false, isAccountSyncingEnabled: true },
      ],
      [
        'profile syncing is enabled but not account syncing',
        { isProfileSyncingEnabled: true, isAccountSyncingEnabled: false },
      ],
      [
        'authentication is not enabled',
        {
          messengerCallControllerAndAction:
            'AuthenticationController:isSignedIn',
          messengerCallCallback: () => false,
        },
      ],
      ['account syncing is in progress', { isAccountSyncingInProgress: true }],
    ] as const;

    it.each(failureCases)('returns false if %s', (_message, mocks) => {
      const { options } = arrangeMocks(mocks);

      expect(canPerformAccountSyncing(options)).toBe(false);
    });

    it('returns true if all conditions are met', () => {
      const { options } = arrangeMocks({});

      expect(canPerformAccountSyncing(options)).toBe(true);
    });
  });

  describe('getInternalAccountsList', () => {
    it('returns filtered internal accounts list', async () => {
      const internalAccounts = [
        {
          address: '0x123',
          id: '1',
          metadata: { keyring: { type: KeyringTypes.hd } },
        },
        {
          address: '0x456',
          id: '2',
          metadata: { keyring: { type: KeyringTypes.trezor } },
        },
      ] as InternalAccount[];

      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockImplementation((controllerAndActionName) => {
            // eslint-disable-next-line jest/no-conditional-in-test
            if (controllerAndActionName === 'AccountsController:listAccounts') {
              return internalAccounts;
            }

            // eslint-disable-next-line jest/no-conditional-in-test
            if (controllerAndActionName === 'KeyringController:withKeyring') {
              return ['0x123'];
            }

            return null;
          }),
        }),
        getUserStorageControllerInstance: jest.fn(),
      };

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
