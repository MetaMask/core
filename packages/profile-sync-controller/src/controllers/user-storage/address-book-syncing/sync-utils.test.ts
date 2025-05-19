import { canPerformAddressBookSyncing } from './sync-utils';
import type { AddressBookSyncingOptions } from './types';

describe('user-storage/address-book-syncing/sync-utils', () => {
  describe('canPerformAddressBookSyncing', () => {
    const arrangeMocks = ({
      isProfileSyncingEnabled = true,
      isAddressBookSyncingEnabled = true,
      messengerCallControllerAndAction = 'AuthenticationController:isSignedIn',
      messengerCallCallback = () => true,
    }) => {
      const options: AddressBookSyncingOptions = {
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
            isAddressBookSyncingEnabled,
          },
        }),
      };

      return { options };
    };

    const failureCases = [
      ['profile syncing is not enabled', { isProfileSyncingEnabled: false }],
      [
        'profile syncing is not enabled but address book syncing is',
        { isProfileSyncingEnabled: false, isAddressBookSyncingEnabled: true },
      ],
      [
        'profile syncing is enabled but not address book syncing',
        { isProfileSyncingEnabled: true, isAddressBookSyncingEnabled: false },
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

      expect(canPerformAddressBookSyncing(options)).toBe(false);
    });

    it('returns true if all conditions are met', () => {
      const { options } = arrangeMocks({});

      expect(canPerformAddressBookSyncing(options)).toBe(true);
    });
  });
}); 