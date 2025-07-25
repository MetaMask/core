import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  canPerformAccountSyncing,
  getInternalAccountsList,
  getUserStorageAccountsList,
} from './sync-utils';
import type { AccountSyncingOptions } from './types';
import {
  isNameDefaultAccountName,
  mapInternalAccountToUserStorageAccount,
} from './utils';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import { TraceName } from '../constants';

/**
 * Saves an individual internal account to the user storage.
 *
 * @param internalAccount - The internal account to save
 * @param options - parameters used for saving the internal account
 * @returns Promise that resolves when the account is saved
 */
export async function saveInternalAccountToUserStorage(
  internalAccount: InternalAccount,
  options: AccountSyncingOptions,
): Promise<void> {
  const { trace } = options;

  const saveAccount = async () => {
    const { getUserStorageControllerInstance } = options;

    if (
      !canPerformAccountSyncing(options) ||
      internalAccount.metadata.keyring.type !== String(KeyringTypes.hd) // sync only EVM accounts until we support multichain accounts
    ) {
      return;
    }

    // properties of `options` are (wrongly?) typed as `Json` and eslint crashes if we try to interpret it as such and call a `?.toString()` on it.
    // but we know this is a string?, so we can safely cast it
    const entropySourceId = internalAccount.options?.entropySource as
      | string
      | undefined;

    try {
      // Map the internal account to the user storage account schema
      const mappedAccount =
        mapInternalAccountToUserStorageAccount(internalAccount);

      await getUserStorageControllerInstance().performSetStorage(
        `${USER_STORAGE_FEATURE_NAMES.accounts}.${internalAccount.address}`,
        JSON.stringify(mappedAccount),
        entropySourceId,
      );
    } catch (e) {
      // istanbul ignore next
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `UserStorageController - failed to save account to user storage - ${errorMessage}`,
      );
    }
  };

  if (trace) {
    return await trace(
      { name: TraceName.AccountSyncSaveIndividual },
      saveAccount,
    );
  }

  return await saveAccount();
}

/**
 * Saves the list of internal accounts to the user storage.
 *
 * @param options - parameters used for saving the list of internal accounts
 * @param entropySourceId - The entropy source ID used to derive the key,
 * when multiple sources are available (Multi-SRP).
 * @returns Promise that resolves when all accounts are saved
 */
export async function saveInternalAccountsListToUserStorage(
  options: AccountSyncingOptions,
  entropySourceId: string,
): Promise<void> {
  const { getUserStorageControllerInstance } = options;

  const internalAccountsList = await getInternalAccountsList(
    options,
    entropySourceId,
  );

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
    entropySourceId,
  );
}

type SyncInternalAccountsWithUserStorageConfig = {
  maxNumberOfAccountsToAdd?: number;
  onAccountAdded?: () => void;
  onAccountNameUpdated?: () => void;
  onAccountSyncErroneousSituation?: (
    errorMessage: string,
    sentryContext?: Record<string, unknown>,
  ) => void;
};

/**
 * Syncs the internal accounts list with the user storage accounts list.
 * This method is used to make sure that the internal accounts list is up-to-date with the user storage accounts list and vice-versa.
 * It will add new accounts to the internal accounts list, update/merge conflicting names and re-upload the results in some cases to the user storage.
 *
 * @param config - parameters used for syncing the internal accounts list with the user storage accounts list
 * @param options - parameters used for syncing the internal accounts list with the user storage accounts list
 * @param entropySourceId - The entropy source ID used to derive the key,
 * @returns Promise that resolves when synchronization is complete
 */
export async function syncInternalAccountsWithUserStorage(
  config: SyncInternalAccountsWithUserStorageConfig,
  options: AccountSyncingOptions,
  entropySourceId: string,
): Promise<void> {
  const { trace } = options;

  const performAccountSync = async () => {
    if (!canPerformAccountSyncing(options)) {
      return;
    }

    const {
      maxNumberOfAccountsToAdd = Infinity,
      onAccountAdded,
      onAccountNameUpdated,
      onAccountSyncErroneousSituation,
    } = config;
    const { getMessenger, getUserStorageControllerInstance } = options;

    try {
      await getUserStorageControllerInstance().setIsAccountSyncingInProgress(
        true,
      );

      const userStorageAccountsList = await getUserStorageAccountsList(
        options,
        entropySourceId,
      );

      if (!userStorageAccountsList || !userStorageAccountsList.length) {
        await saveInternalAccountsListToUserStorage(options, entropySourceId);
        return;
      }
      // Keep a record if erroneous situations are found during the sync
      // This is done so we can send the context to Sentry in case of an erroneous situation
      let erroneousSituationsFound = false;

      // Prepare an array of internal accounts to be saved to the user storage
      const internalAccountsToBeSavedToUserStorage: InternalAccount[] = [];

      // Compare internal accounts list with user storage accounts list
      // First step: compare lengths
      const internalAccountsList = await getInternalAccountsList(
        options,
        entropySourceId,
      );

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
        await getMessenger().call(
          'KeyringController:withKeyring',
          {
            id: entropySourceId,
          },
          async ({ keyring }) => {
            await keyring.addAccounts(numberOfAccountsToAdd);
          },
        );

        // TODO: below code is kept for analytics but should probably be re-thought
        for (let i = 0; i < numberOfAccountsToAdd; i++) {
          onAccountAdded?.();
        }
      }

      // Second step: compare account names
      // Get the internal accounts list again since new accounts might have been added in the previous step
      const refreshedInternalAccountsList = await getInternalAccountsList(
        options,
        entropySourceId,
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
            erroneousSituationsFound = true;
            onAccountSyncErroneousSituation?.(
              'An account was added to the internal accounts list but was not present in the user storage accounts list',
              {
                internalAccount,
                userStorageAccount,
                newlyAddedAccounts,
                userStorageAccountsList,
                internalAccountsList,
                refreshedInternalAccountsList,
                internalAccountsToBeSavedToUserStorage,
              },
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
              internalAccount.metadata.nameLastUpdatedAt >
              userStorageAccount.nlu;

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
          entropySourceId,
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
          entropySourceId,
        );
        erroneousSituationsFound = true;
        onAccountSyncErroneousSituation?.(
          'An account was present in the user storage accounts list but was not found in the internal accounts list after the sync',
          {
            userStorageAccountsToBeDeleted,
            internalAccountsList,
            refreshedInternalAccountsList,
            internalAccountsToBeSavedToUserStorage,
            userStorageAccountsList,
          },
        );
      }

      if (erroneousSituationsFound) {
        const [finalUserStorageAccountsList, finalInternalAccountsList] =
          await Promise.all([
            getUserStorageAccountsList(options, entropySourceId),
            getInternalAccountsList(options, entropySourceId),
          ]);

        const doesEveryAccountInInternalAccountsListExistInUserStorageAccountsList =
          finalInternalAccountsList.every((account) =>
            finalUserStorageAccountsList?.some(
              (userStorageAccount) => userStorageAccount.a === account.address,
            ),
          );

        // istanbul ignore next
        const doesEveryAccountInUserStorageAccountsListExistInInternalAccountsList =
          (finalUserStorageAccountsList?.length || 0) > maxNumberOfAccountsToAdd
            ? true
            : finalUserStorageAccountsList?.every((account) =>
                finalInternalAccountsList.some(
                  (internalAccount) => internalAccount.address === account.a,
                ),
              );

        const doFinalListsMatch =
          doesEveryAccountInInternalAccountsListExistInUserStorageAccountsList &&
          doesEveryAccountInUserStorageAccountsListExistInInternalAccountsList;

        const context = {
          finalUserStorageAccountsList,
          finalInternalAccountsList,
        };
        if (doFinalListsMatch) {
          onAccountSyncErroneousSituation?.(
            'Erroneous situations were found during the sync, but final state matches the expected state',
            context,
          );
        } else {
          onAccountSyncErroneousSituation?.(
            'Erroneous situations were found during the sync, and final state does not match the expected state',
            context,
          );
        }
      }
    } catch (e) {
      // istanbul ignore next
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `UserStorageController - failed to sync user storage accounts list - ${errorMessage}`,
      );
    } finally {
      await getUserStorageControllerInstance().setIsAccountSyncingInProgress(
        false,
      );
    }
  };

  if (trace) {
    return await trace({ name: TraceName.AccountSyncFull }, performAccountSync);
  }

  return await performAccountSync();
}
