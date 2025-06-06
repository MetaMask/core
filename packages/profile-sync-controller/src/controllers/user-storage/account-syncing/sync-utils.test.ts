import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { MOCK_ENTROPY_SOURCE_IDS } from './__fixtures__/mockAccounts';
import {
  canPerformAccountSyncing,
  getInternalAccountsList,
  getUserStorageAccountsList,
} from './sync-utils';
import type { AccountSyncingOptions } from './types';

describe('user-storage/account-syncing/sync-utils', () => {
  describe('canPerformAccountSyncing', () => {
    const arrangeMocks = ({
      isBackupAndSyncEnabled = true,
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
            isBackupAndSyncEnabled,
            isAccountSyncingEnabled,
            isAccountSyncingInProgress,
          },
        }),
      };

      return { options };
    };

    const failureCases = [
      ['backup and sync is not enabled', { isBackupAndSyncEnabled: false }],
      [
        'backup and sync is not enabled but account syncing is',
        { isBackupAndSyncEnabled: false, isAccountSyncingEnabled: true },
      ],
      [
        'backup and sync is enabled but not account syncing',
        { isBackupAndSyncEnabled: true, isAccountSyncingEnabled: false },
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
          options: { entropySource: MOCK_ENTROPY_SOURCE_IDS[0] },
          metadata: { keyring: { type: KeyringTypes.hd } },
        },
        {
          address: '0x456',
          id: '2',
          options: { entropySource: MOCK_ENTROPY_SOURCE_IDS[1] },
          metadata: { keyring: { type: KeyringTypes.trezor } },
        },
      ] as unknown as InternalAccount[];

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

      const result = await getInternalAccountsList(
        options,
        MOCK_ENTROPY_SOURCE_IDS[0],
      );
      expect(result).toStrictEqual([internalAccounts[0]]);
    });

    it('calls updateAccounts if entropy source is not present for all internal accounts', async () => {
      const internalAccounts = [
        {
          address: '0x123',
          id: '1',
          options: { entropySource: undefined },
          metadata: { keyring: { type: KeyringTypes.hd } },
        },
        {
          address: '0x456',
          id: '2',
          options: { entropySource: MOCK_ENTROPY_SOURCE_IDS[0] },
          metadata: { keyring: { type: KeyringTypes.hd } },
        },
      ] as unknown as InternalAccount[];

      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockImplementation((controllerAndActionName) => {
            // eslint-disable-next-line jest/no-conditional-in-test
            if (controllerAndActionName === 'AccountsController:listAccounts') {
              return internalAccounts;
            }

            return null;
          }),
        }),
        getUserStorageControllerInstance: jest.fn(),
      };

      await getInternalAccountsList(options, MOCK_ENTROPY_SOURCE_IDS[0]);
      expect(options.getMessenger().call).toHaveBeenCalledWith(
        'AccountsController:updateAccounts',
      );
    });

    it('does not call updateAccounts if entropy source is present for all internal accounts', async () => {
      const internalAccounts = [
        {
          address: '0x123',
          id: '1',
          options: { entropySource: MOCK_ENTROPY_SOURCE_IDS[0] },
          metadata: { keyring: { type: KeyringTypes.hd } },
        },
        {
          address: '0x456',
          id: '2',
          options: { entropySource: MOCK_ENTROPY_SOURCE_IDS[0] },
          metadata: { keyring: { type: KeyringTypes.hd } },
        },
      ] as unknown as InternalAccount[];

      const options: AccountSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockImplementation((controllerAndActionName) => {
            // eslint-disable-next-line jest/no-conditional-in-test
            if (controllerAndActionName === 'AccountsController:listAccounts') {
              return internalAccounts;
            }

            return null;
          }),
        }),
        getUserStorageControllerInstance: jest.fn(),
      };

      await getInternalAccountsList(options, MOCK_ENTROPY_SOURCE_IDS[0]);
      expect(options.getMessenger().call).not.toHaveBeenCalledWith(
        'AccountsController:updateAccounts',
      );
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
