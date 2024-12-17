import type { InternalAccount } from '@metamask/keyring-internal-api';

import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import type {
  AccountSyncingConfig,
  AccountSyncingOptions,
  UserStorageAccount,
} from './types';
import { doesInternalAccountHaveCorrectKeyringType } from './utils';

/**
 * Checks if account syncing can be performed based on a set of conditions
 * @param config - configuration parameters
 * @param options - parameters used for checking if account syncing can be performed
 * @returns Returns true if account syncing can be performed, false otherwise.
 */
export function canPerformAccountSyncing(
  config: AccountSyncingConfig,
  options: AccountSyncingOptions,
): boolean {
  const { isAccountSyncingEnabled } = config;
  const { getMessenger, getUserStorageControllerInstance } = options;

  const messenger = getMessenger();
  const userStorageControllerInstance = getUserStorageControllerInstance();

  const { isProfileSyncingEnabled, isAccountSyncingInProgress } =
    userStorageControllerInstance.state;
  const isAuthEnabled = messenger.call('AuthenticationController:isSignedIn');

  try {
    if (
      !isProfileSyncingEnabled ||
      !isAuthEnabled ||
      !isAccountSyncingEnabled
    ) {
      return false;
    }
    if (isAccountSyncingInProgress) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get the list of internal accounts
 * @param options - parameters used for getting the list of internal accounts
 */
export async function getInternalAccountsList(
  options: AccountSyncingOptions,
): Promise<InternalAccount[]> {
  const { getMessenger } = options;
  const messenger = getMessenger();

  // eslint-disable-next-line @typescript-eslint/await-thenable
  const internalAccountsList = await messenger.call(
    'AccountsController:listAccounts',
  );

  return internalAccountsList?.filter(
    doesInternalAccountHaveCorrectKeyringType,
  );
}

/**
 * Get the list of user storage accounts
 * @param options - parameters used for getting the list of user storage accounts
 */
export async function getUserStorageAccountsList(
  options: AccountSyncingOptions,
): Promise<UserStorageAccount[] | null> {
  const { getUserStorageControllerInstance } = options;
  const userStorageControllerInstance = getUserStorageControllerInstance();

  const rawAccountsListResponse =
    await userStorageControllerInstance.performGetStorageAllFeatureEntries(
      USER_STORAGE_FEATURE_NAMES.accounts,
    );

  return (
    rawAccountsListResponse?.map((rawAccount) => JSON.parse(rawAccount)) ?? null
  );
}
