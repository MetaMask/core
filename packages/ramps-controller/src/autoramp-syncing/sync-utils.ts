import type { AutorampSyncingOptions } from './types.js';

/**
 * Check if we can perform autoramp User Storage syncing.
 *
 * Requires Backup & Sync enabled, signed-in auth, and no in-progress sync.
 * Optional `isRampsSyncingEnabled` on User Storage state defaults to true when absent.
 *
 * @param options - Sync options.
 * @returns Whether sync can run.
 */
export function canPerformAutorampSyncing(
  options: AutorampSyncingOptions,
): boolean {
  const { getMessenger, getRampsControllerInstance } = options;

  try {
    const userStorageState = getMessenger().call(
      'UserStorageController:getState',
    ) as {
      isBackupAndSyncEnabled?: boolean;
      isRampsSyncingEnabled?: boolean;
    };

    const isBackupAndSyncEnabled = Boolean(
      userStorageState.isBackupAndSyncEnabled,
    );
    const isRampsSyncingEnabled = userStorageState.isRampsSyncingEnabled ?? true;
    const isAuthEnabled = getMessenger().call(
      'AuthenticationController:isSignedIn',
    );
    const { isAutorampSyncingInProgress } = getRampsControllerInstance();

    if (
      !isBackupAndSyncEnabled ||
      !isRampsSyncingEnabled ||
      isAutorampSyncingInProgress ||
      !isAuthEnabled
    ) {
      return false;
    }

    return true;
  } catch {
    // Host has not delegated User Storage / auth actions yet.
    return false;
  }
}
