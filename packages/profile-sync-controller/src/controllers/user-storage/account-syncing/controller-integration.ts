import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import {
  canPerformAccountSyncing,
  getInternalAccountsList,
  getUserStorageAccountsList,
} from './sync-utils';
import type { AccountSyncingConfig, AccountSyncingOptions } from './types';
import {
  doesInternalAccountHaveCorrectKeyringType,
  isNameDefaultAccountName,
  mapInternalAccountToUserStorageAccount,
} from './utils';

/**
 * Saves an individual internal account to the user storage.
 * @param internalAccount - The internal account to save
 * @param config - parameters used for saving the internal account
 * @param options - parameters used for saving the internal account
 */
export async function saveInternalAccountToUserStorage(
  internalAccount: InternalAccount,
  config: AccountSyncingConfig,
  options: AccountSyncingOptions,
): Promise<void> {
  const { isAccountSyncingEnabled } = config;
  const { getUserStorageControllerInstance } = options;

  if (
    !isAccountSyncingEnabled ||
    !canPerformAccountSyncing(config, options) ||
    !isEvmAccountType(internalAccount.type) ||
    !doesInternalAccountHaveCorrectKeyringType(internalAccount)
  ) {
    return;
  }

  try {
    // Map the internal account to the user storage account schema
    const mappedAccount =
      mapInternalAccountToUserStorageAccount(internalAccount);

    await getUserStorageControllerInstance().performSetStorage(
      // ESLint is confused here.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${USER_STORAGE_FEATURE_NAMES.accounts}.${internalAccount.address}`,
      JSON.stringify(mappedAccount),
    );
  } catch (e) {
    // istanbul ignore next
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
    // ESLint is confused here.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(
      `${
        getUserStorageControllerInstance().name
      } - failed to save account to user storage - ${errorMessage}`,
    );
  }
}

/**
 * Saves the list of internal accounts to the user storage.
 * @param config - parameters used for saving the list of internal accounts
 * @param options - parameters used for saving the list of internal accounts
 */
export async function saveInternalAccountsListToUserStorage(
  config: AccountSyncingConfig,
  options: AccountSyncingOptions,
): Promise<void> {
  const { isAccountSyncingEnabled } = config;
  const { getUserStorageControllerInstance } = options;

  if (!isAccountSyncingEnabled) {
    return;
  }

  const internalAccountsList = await getInternalAccountsList(options);

  if (!internalAccountsList?.length) {
    return;
  }

  const internalAccountsListFormattedForUserStorage = internalAccountsList.map(
    mapInternalAccountToUserStorageAccount,
  );

  await getUserStorageControllerInstance().performBatchSetStorage(
    USER_STORAGE_FEATURE_NAMES.accounts,
    internalAccountsListFormattedForUserStorage.map((account) => [
      account.a,
      JSON.stringify(account),
    ]),
  );
}

type SyncInternalAccountsWithUserStorageConfig = AccountSyncingConfig & {
  maxNumberOfAccountsToAdd?: number;
  onAccountAdded?: () => void;
  onAccountNameUpdated?: () => void;
  onAccountSyncErroneousSituation?: (errorMessage: string) => void;
};

/**
 * Syncs the internal accounts list with the user storage accounts list.
 * This method is used to make sure that the internal accounts list is up-to-date with the user storage accounts list and vice-versa.
 * It will add new accounts to the internal accounts list, update/merge conflicting names and re-upload the results in some cases to the user storage.
 * @param config - parameters used for syncing the internal accounts list with the user storage accounts list
 * @param options - parameters used for syncing the internal accounts list with the user storage accounts list
 */
export async function syncInternalAccountsWithUserStorage(
  config: SyncInternalAccountsWithUserStorageConfig,
  options: AccountSyncingOptions,
): Promise<void> {
  const { isAccountSyncingEnabled } = config;

  if (!canPerformAccountSyncing(config, options) || !isAccountSyncingEnabled) {
    return;
  }

  const {
    maxNumberOfAccountsToAdd = 100,
    onAccountAdded,
    onAccountNameUpdated,
    onAccountSyncErroneousSituation,
  } = config;
  const { getMessenger, getUserStorageControllerInstance } = options;

  try {
    await getUserStorageControllerInstance().setIsAccountSyncingInProgress(
      true,
    );

    const userStorageAccountsList = await getUserStorageAccountsList(options);

    if (!userStorageAccountsList || !userStorageAccountsList.length) {
      await saveInternalAccountsListToUserStorage(
        { isAccountSyncingEnabled },
        options,
      );
      await getUserStorageControllerInstance().setHasAccountSyncingSyncedAtLeastOnce(
        true,
      );
      return;
    }

    // Prepare an array of internal accounts to be saved to the user storage
    const internalAccountsToBeSavedToUserStorage: InternalAccount[] = [];

    // Compare internal accounts list with user storage accounts list
    // First step: compare lengths
    const internalAccountsList = await getInternalAccountsList(options);

    if (!internalAccountsList || !internalAccountsList.length) {
      throw new Error(`Failed to get internal accounts list`);
    }

    const hasMoreUserStorageAccountsThanInternalAccounts =
      userStorageAccountsList.length > internalAccountsList.length;

    // We don't want to remove existing accounts for a user
    // so we only add new accounts if the user has more accounts in user storage than internal accounts
    if (hasMoreUserStorageAccountsThanInternalAccounts) {
      const numberOfAccountsToAdd =
        Math.min(userStorageAccountsList.length, maxNumberOfAccountsToAdd) -
        internalAccountsList.length;

      // Create new accounts to match the user storage accounts list
      for (let i = 0; i < numberOfAccountsToAdd; i++) {
        await getMessenger().call('KeyringController:addNewAccount');
        onAccountAdded?.();
      }
    }

    // Second step: compare account names
    // Get the internal accounts list again since new accounts might have been added in the previous step
    const refreshedInternalAccountsList = await getInternalAccountsList(
      options,
    );

    const newlyAddedAccounts = refreshedInternalAccountsList.filter(
      (account) =>
        !internalAccountsList.find((a) => a.address === account.address),
    );

    for (const internalAccount of refreshedInternalAccountsList) {
      const userStorageAccount = userStorageAccountsList.find(
        (account) => account.a === internalAccount.address,
      );

      // If the account is not present in user storage
      // istanbul ignore next
      if (!userStorageAccount) {
        // If the account was just added in the previous step, skip saving it, it's likely to be a bogus account
        if (newlyAddedAccounts.includes(internalAccount)) {
          onAccountSyncErroneousSituation?.(
            'An account was added to the internal accounts list but was not present in the user storage accounts list',
          );
          continue;
        }
        // Otherwise, it means that this internal account was present before the sync, and needs to be saved to the user storage
        internalAccountsToBeSavedToUserStorage.push(internalAccount);
        continue;
      }

      // From this point on, we know that the account is present in
      // both the internal accounts list and the user storage accounts list

      // One or both accounts have default names
      const isInternalAccountNameDefault = isNameDefaultAccountName(
        internalAccount.metadata.name,
      );
      const isUserStorageAccountNameDefault = isNameDefaultAccountName(
        userStorageAccount.n,
      );

      // Internal account has default name
      if (isInternalAccountNameDefault) {
        if (!isUserStorageAccountNameDefault) {
          getMessenger().call(
            'AccountsController:updateAccountMetadata',
            internalAccount.id,
            {
              name: userStorageAccount.n,
            },
          );

          onAccountNameUpdated?.();
        }
        continue;
      }

      // Internal account has custom name but user storage account has default name
      if (isUserStorageAccountNameDefault) {
        internalAccountsToBeSavedToUserStorage.push(internalAccount);
        continue;
      }

      // Both accounts have custom names

      // User storage account has a nameLastUpdatedAt timestamp
      // Note: not storing the undefined checks in constants to act as a type guard
      if (userStorageAccount.nlu !== undefined) {
        if (internalAccount.metadata.nameLastUpdatedAt !== undefined) {
          const isInternalAccountNameNewer =
            internalAccount.metadata.nameLastUpdatedAt > userStorageAccount.nlu;

          if (isInternalAccountNameNewer) {
            internalAccountsToBeSavedToUserStorage.push(internalAccount);
            continue;
          }
        }

        getMessenger().call(
          'AccountsController:updateAccountMetadata',
          internalAccount.id,
          {
            name: userStorageAccount.n,
            nameLastUpdatedAt: userStorageAccount.nlu,
          },
        );

        const areInternalAndUserStorageAccountNamesEqual =
          internalAccount.metadata.name === userStorageAccount.n;

        if (!areInternalAndUserStorageAccountNamesEqual) {
          onAccountNameUpdated?.();
        }

        continue;
      } else if (internalAccount.metadata.nameLastUpdatedAt !== undefined) {
        internalAccountsToBeSavedToUserStorage.push(internalAccount);
        continue;
      }
    }

    // Save the internal accounts list to the user storage
    if (internalAccountsToBeSavedToUserStorage.length) {
      await getUserStorageControllerInstance().performBatchSetStorage(
        USER_STORAGE_FEATURE_NAMES.accounts,
        internalAccountsToBeSavedToUserStorage.map((account) => [
          account.address,
          JSON.stringify(mapInternalAccountToUserStorageAccount(account)),
        ]),
      );
    }

    // In case we have corrupted user storage with accounts that don't exist in the internal accounts list
    // Delete those accounts from the user storage
    const userStorageAccountsToBeDeleted = userStorageAccountsList.filter(
      (account) =>
        !refreshedInternalAccountsList.find((a) => a.address === account.a),
    );

    if (userStorageAccountsToBeDeleted.length) {
      await getUserStorageControllerInstance().performBatchDeleteStorage(
        USER_STORAGE_FEATURE_NAMES.accounts,
        userStorageAccountsToBeDeleted.map((account) => account.a),
      );
      onAccountSyncErroneousSituation?.(
        'An account was present in the user storage accounts list but was not found in the internal accounts list after the sync',
      );
    }

    // We do this here and not in the finally statement because we want to make sure that
    // the accounts are saved / updated / deleted at least once before we set this flag
    await getUserStorageControllerInstance().setHasAccountSyncingSyncedAtLeastOnce(
      true,
    );
  } catch (e) {
    // istanbul ignore next
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
    // ESLint is confused here.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(
      `${
        getUserStorageControllerInstance().name
      } - failed to sync user storage accounts list - ${errorMessage}`,
    );
  } finally {
    await getUserStorageControllerInstance().setIsAccountSyncingInProgress(
      false,
    );
  }
}
