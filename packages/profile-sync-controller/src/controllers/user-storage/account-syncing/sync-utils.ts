import { isEvmAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountSyncingOptions, UserStorageAccount } from './types';
import { mapInternalAccountsListToPrimarySRPHdKeyringInternalAccountsList } from './utils';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';

/**
 * Checks if account syncing can be performed based on a set of conditions
 *
 * @param options - parameters used for checking if account syncing can be performed
 * @returns Returns true if account syncing can be performed, false otherwise.
 */
export function canPerformAccountSyncing(
  options: AccountSyncingOptions,
): boolean {
  const { getMessenger, getUserStorageControllerInstance } = options;

  const {
    isBackupAndSyncEnabled,
    isAccountSyncingEnabled,
    isAccountSyncingInProgress,
  } = getUserStorageControllerInstance().state;
  const isAuthEnabled = getMessenger().call(
    'AuthenticationController:isSignedIn',
  );

  if (
    !isBackupAndSyncEnabled ||
    !isAccountSyncingEnabled ||
    !isAuthEnabled ||
    isAccountSyncingInProgress
  ) {
    return false;
  }

  return true;
}

/**
 * Get the list of internal accounts
 * This function returns only the internal accounts that are from the primary SRP
 * and are from the HD keyring
 *
 * @param options - parameters used for getting the list of internal accounts
 * @param entropySourceId - The entropy source ID used to derive the key,
 * when multiple sources are available (Multi-SRP).
 * @returns the list of internal accounts
 */
export async function getInternalAccountsList(
  options: AccountSyncingOptions,
  entropySourceId?: string,
): Promise<InternalAccount[]> {
  const { getMessenger } = options;

  const internalAccountsList = getMessenger().call(
    'AccountsController:listAccounts',
  );

  if (entropySourceId) {
    return internalAccountsList.filter(
      (account) =>
        entropySourceId === account.options?.entropySourceId &&
        isEvmAccountType(account.type), // TODO: remove solana filtering
    );
  }
  return await mapInternalAccountsListToPrimarySRPHdKeyringInternalAccountsList(
    internalAccountsList,
    options,
  );
}

/**
 * Lists all the available HD keyring metadata IDs.
 * These IDs can be used in a multi-SRP context to segregate data specific to different SRPs.
 *
 * @param options - An object including a controller messenger getter.
 * @returns A promise that resolves to an array of HD keyring metadata IDs.
 */
export async function listEntropySources(options: AccountSyncingOptions) {
  const { getMessenger } = options;

  const { keyrings } = getMessenger().call('KeyringController:getState');
  return keyrings
    .filter((keyring) => keyring.type === KeyringTypes.hd.toString())
    .map((keyring) => keyring.metadata.id);
}

/**
 * Get the list of user storage accounts
 *
 * @param options - parameters used for getting the list of user storage accounts
 * @param entropySourceId - The entropy source ID used to derive the storage key,
 * when multiple sources are available (Multi-SRP).
 * @returns the list of user storage accounts
 */
export async function getUserStorageAccountsList(
  options: AccountSyncingOptions,
  entropySourceId?: string,
): Promise<UserStorageAccount[] | null> {
  const { getUserStorageControllerInstance } = options;

  const rawAccountsListResponse =
    await getUserStorageControllerInstance().performGetStorageAllFeatureEntries(
      USER_STORAGE_FEATURE_NAMES.accounts,
      entropySourceId,
    );

  return (
    rawAccountsListResponse?.map((rawAccount) => JSON.parse(rawAccount)) ?? null
  );
}

/**
 * Type guard to check if a value is defined (not null or undefined)
 *
 * @param arg - The value to check
 * @returns True if the value is neither null nor undefined
 */
function isDefined<T>(arg: T): arg is Exclude<T, null | undefined> {
  return arg !== null && typeof arg !== 'undefined';
}
