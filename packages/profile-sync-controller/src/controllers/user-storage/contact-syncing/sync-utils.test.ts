import { canPerformContactSyncing } from './sync-utils';
import type { ContactSyncingOptions } from './types';

describe('user-storage/contact-syncing/sync-utils', () => {
  describe('canPerformContactSyncing', () => {
    const arrangeMocks = ({
      isBackupAndSyncEnabled = true,
      isContactSyncingEnabled = true,
      messengerCallControllerAndAction = 'AuthenticationController:isSignedIn',
      messengerCallCallback = () => true,
    }) => {
      const options: ContactSyncingOptions = {
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
            isContactSyncingEnabled,
          },
        }),
      };

      return { options };
    };

    const failureCases = [
      ['profile syncing is not enabled', { isBackupAndSyncEnabled: false }],
      [
        'profile syncing is not enabled but contact syncing is',
        { isBackupAndSyncEnabled: false, isContactSyncingEnabled: true },
      ],
      [
        'profile syncing is enabled but not contact syncing',
        { isBackupAndSyncEnabled: true, isContactSyncingEnabled: false },
      ],
      [
        'authentication is not enabled',
        {
          messengerCallControllerAndAction:
            'AuthenticationController:isSignedIn',
          messengerCallCallback: () => false,
        },
      ],
    ] as const;

    it.each(failureCases)('returns false if %s', (_message, mocks) => {
      const { options } = arrangeMocks(mocks);

      expect(canPerformContactSyncing(options)).toBe(false);
    });

    it('returns true if all conditions are met', () => {
      const { options } = arrangeMocks({});

      expect(canPerformContactSyncing(options)).toBe(true);
    });
  });
});
