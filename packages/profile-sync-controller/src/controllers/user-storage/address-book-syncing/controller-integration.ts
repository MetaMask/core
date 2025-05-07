import { AddressBookSyncingOptions } from "./types";
import {
    canPerformAddressBookSyncing,
  } from './sync-utils';

type SyncAddressBookWithUserStorageConfig = {
    onContactUpdated?: () => void;
    onContactDeleted?: () => void;
    onAddressBookSyncErroneousSituation?: (
      errorMessage: string,
      sentryContext?: Record<string, unknown>,
    ) => void;
  };

/**
 * Syncs the address book list with the user storage address book list.
 * This method is used to make sure that the internal address book list is up-to-date with the user storage address book list and vice-versa.
 * It will add new contacts to the internal address book list, update/merge conflicting names and re-upload the results in some cases to the user storage.
 *
 * @param config - parameters used for syncing the internal address book list with the user storage address book list
 * @param options - parameters used for syncing the internal address book list with the user storage address book list
 */
export async function syncAddressBookWithUserStorage(
    config: SyncAddressBookWithUserStorageConfig,
    options: AddressBookSyncingOptions,
  ): Promise<void> {
    if (!canPerformAddressBookSyncing(options)) {
      return;
    }
  
    const {
      onContactUpdated,
      onContactDeleted,
      onAddressBookSyncErroneousSituation,
    } = config;
    const { getMessenger, getUserStorageControllerInstance } = options;
  
    console.log('TODO: syncAddressBookWithUserStorage');
  }