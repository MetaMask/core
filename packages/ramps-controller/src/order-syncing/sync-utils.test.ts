import { canPerformOrderSyncing } from './sync-utils.js';
import type { OrderSyncingOptions } from './types.js';

describe('order-syncing/sync-utils', () => {
  describe('canPerformOrderSyncing', () => {
    const arrangeMocks = ({
      isBackupAndSyncEnabled = true,
      isRampsSyncingEnabled = true,
      isOrderSyncingInProgress = false,
      isSignedIn = true,
      throwOnMessengerCall = false,
    } = {}): { options: OrderSyncingOptions } => {
      const options: OrderSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockImplementation((action: string) => {
            if (throwOnMessengerCall) {
              throw new Error('action not registered');
            }
            if (action === 'UserStorageController:getState') {
              return { isBackupAndSyncEnabled, isRampsSyncingEnabled };
            }
            if (action === 'AuthenticationController:isSignedIn') {
              return isSignedIn;
            }
            return null;
          }),
        }),
        getRampsControllerInstance: jest.fn().mockReturnValue({
          isOrderSyncingInProgress,
          state: { orders: [] },
          setIsOrderSyncingInProgress: jest.fn(),
          addOrder: jest.fn(),
          removeOrder: jest.fn(),
          drainPendingRemoteDeletes: jest.fn().mockReturnValue([]),
        }),
      };

      return { options };
    };

    it.each([
      ['backup and sync is disabled', { isBackupAndSyncEnabled: false }],
      ['ramps syncing is disabled', { isRampsSyncingEnabled: false }],
      ['order syncing is in progress', { isOrderSyncingInProgress: true }],
      ['user is not signed in', { isSignedIn: false }],
      ['messenger actions are unavailable', { throwOnMessengerCall: true }],
    ] as const)('returns false if %s', (_message, mocks) => {
      const { options } = arrangeMocks(mocks);
      expect(canPerformOrderSyncing(options)).toBe(false);
    });

    it('returns true if all conditions are met', () => {
      const { options } = arrangeMocks();
      expect(canPerformOrderSyncing(options)).toBe(true);
    });

    it('defaults isRampsSyncingEnabled to true when absent from User Storage state', () => {
      const options: OrderSyncingOptions = {
        getMessenger: jest.fn().mockReturnValue({
          call: jest.fn().mockImplementation((action: string) => {
            if (action === 'UserStorageController:getState') {
              return { isBackupAndSyncEnabled: true };
            }
            if (action === 'AuthenticationController:isSignedIn') {
              return true;
            }
            return null;
          }),
        }),
        getRampsControllerInstance: jest.fn().mockReturnValue({
          isOrderSyncingInProgress: false,
          state: { orders: [] },
          setIsOrderSyncingInProgress: jest.fn(),
          addOrder: jest.fn(),
          removeOrder: jest.fn(),
          drainPendingRemoteDeletes: jest.fn().mockReturnValue([]),
        }),
      };

      expect(canPerformOrderSyncing(options)).toBe(true);
    });
  });
});
