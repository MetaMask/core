/* eslint-disable jsdoc/require-jsdoc */

import type { Bip44Account } from '@metamask/account-api';
import { isBip44Account } from '@metamask/account-api';
import type { KeyringAccount } from '@metamask/keyring-api';

export type MockAccountProvider = {
  accounts: KeyringAccount[];
  getAccount: jest.Mock;
  getAccounts: jest.Mock;
  createAccounts: jest.Mock;
  discoverAndCreateAccounts: jest.Mock;
  isAccountCompatible?: jest.Mock;
};

export function makeMockAccountProvider(
  accounts: KeyringAccount[] = [],
): MockAccountProvider {
  return {
    accounts,
    getAccount: jest.fn(),
    getAccounts: jest.fn(),
    createAccounts: jest.fn(),
    discoverAndCreateAccounts: jest.fn(),
    isAccountCompatible: jest.fn(),
  };
}

export function setupAccountProvider({
  accounts,
  mocks = makeMockAccountProvider(),
  filter = () => true,
}: {
  mocks?: MockAccountProvider;
  accounts: KeyringAccount[];
  filter?: (account: KeyringAccount) => boolean;
}): MockAccountProvider {
  // You can mock this and all other mocks will re-use that list
  // of accounts.
  mocks.accounts = accounts;

  const getAccounts = () =>
    mocks.accounts.filter(
      (account) => isBip44Account(account) && filter(account),
    );

  mocks.getAccounts.mockImplementation(getAccounts);
  mocks.getAccount.mockImplementation(
    (id: Bip44Account<KeyringAccount>['id']) =>
      // Assuming this never fails.
      getAccounts().find((account) => account.id === id),
  );

  return mocks;
}
