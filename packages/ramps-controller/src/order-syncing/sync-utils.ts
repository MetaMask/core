import type { OrderSyncingOptions } from './types.js';

/**
 * Check if we can perform ramps order syncing.
 *
 * @param options - Parameters used for checking if we can perform order syncing.
 * @returns Whether we can perform order syncing.
 */
export function canPerformOrderSyncing(options: OrderSyncingOptions): boolean {
  const { getMessenger, getRampsControllerInstance } = options;

  try {
    const {
      isBackupAndSyncEnabled,
      isRampsSyncingEnabled: rawIsRampsSyncingEnabled,
    } = getMessenger().call('UserStorageController:getState');
    const isRampsSyncingEnabled = rawIsRampsSyncingEnabled ?? true;

    const isAuthEnabled = getMessenger().call(
      'AuthenticationController:isSignedIn',
    );

    const { isOrderSyncingInProgress } = getRampsControllerInstance();

    if (
      !isBackupAndSyncEnabled ||
      !isRampsSyncingEnabled ||
      isOrderSyncingInProgress ||
      !isAuthEnabled
    ) {
      return false;
    }

    return true;
  } catch {
    // Host has not delegated User Storage / auth actions yet
    return false;
  }
}
