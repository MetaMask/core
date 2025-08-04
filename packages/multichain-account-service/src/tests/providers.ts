/* eslint-disable jsdoc/require-jsdoc */

import type { Bip44Account } from '@metamask/account-api';
import { isBip44Account } from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

export type MockAccountProvider = {
  accounts: InternalAccount[];
  getAccount: jest.Mock;
  getAccounts: jest.Mock;
  createAccounts: jest.Mock;
  discoverAndCreateAccounts: jest.Mock;
};

export function makeMockAccountProvider(
  accounts: InternalAccount[] = [],
): MockAccountProvider {
  return {
    accounts,
    getAccount: jest.fn(),
    getAccounts: jest.fn(),
    createAccounts: jest.fn(),
    discoverAndCreateAccounts: jest.fn(),
  };
}

export function setupAccountProvider({
  accounts,
  mocks = makeMockAccountProvider(),
  filter = () => true,
}: {
  mocks?: MockAccountProvider;
  accounts: InternalAccount[];
  filter?: (account: InternalAccount) => boolean;
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
    (id: Bip44Account<InternalAccount>['id']) =>
      // Assuming this never fails.
      getAccounts().find((account) => account.id === id),
  );

  return mocks;
}
