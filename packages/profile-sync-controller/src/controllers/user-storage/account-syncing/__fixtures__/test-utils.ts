import type { InternalAccount } from '@metamask/keyring-internal-api';

import { createSHA256Hash } from '../../../../shared/encryption';
import { mockUserStorageMessenger } from '../../__fixtures__/mockMessenger';
import { mapInternalAccountToUserStorageAccount } from '../utils';
import { MOCK_INTERNAL_ACCOUNTS } from './mockAccounts';

/**
 * Test Utility - create a mock user storage messenger for account syncing tests
 *
 * @param options - options for the mock messenger
 * @param options.accounts - options for the accounts part of the controller
 * @param options.accounts.accountsList - list of accounts to return for the 'AccountsController:listAccounts' action
 * @returns Mock User Storage Messenger
 */
export function mockUserStorageMessengerForAccountSyncing(options?: {
  accounts?: {
    accountsList?: InternalAccount[];
  };
}) {
  const messengerMocks = mockUserStorageMessenger();

  messengerMocks.mockKeyringAddNewAccount.mockImplementation(async () => {
    messengerMocks.baseMessenger.publish(
      'AccountsController:accountAdded',
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
    );
    return MOCK_INTERNAL_ACCOUNTS.ONE[0].address;
  });

  messengerMocks.mockAccountsListAccounts.mockReturnValue(
    (options?.accounts?.accountsList ??
      MOCK_INTERNAL_ACCOUNTS.ALL) as InternalAccount[],
  );

  return messengerMocks;
}

/**
 * Test Utility - creates a realistic expected batch upsert payload
 * @param data - data supposed to be upserted
 * @param storageKey - storage key
 * @returns expected body
 */
export function createExpectedAccountSyncBatchUpsertBody(
  data: [string, InternalAccount][],
  storageKey: string,
) {
  return data.map(([entryKey, entryValue]) => [
    createSHA256Hash(String(entryKey) + storageKey),
    JSON.stringify(mapInternalAccountToUserStorageAccount(entryValue)),
  ]);
}

/**
 * Test Utility - creates a realistic expected batch delete payload
 * @param data - data supposed to be deleted
 * @param storageKey - storage key
 * @returns expected body
 */
export function createExpectedAccountSyncBatchDeleteBody(
  data: string[],
  storageKey: string,
) {
  return data.map((entryKey) =>
    createSHA256Hash(String(entryKey) + storageKey),
  );
}
