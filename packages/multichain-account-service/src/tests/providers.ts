/* eslint-disable jsdoc/require-jsdoc */

import type { Bip44Account } from '@metamask/account-api';
import type { KeyringAccount } from '@metamask/keyring-api';

export type MockAccountProvider = {
  accounts: KeyringAccount[];
  accountsList: KeyringAccount['id'][];
  constructor: jest.Mock;
  getAccount: jest.Mock;
  getAccounts: jest.Mock;
  createAccounts: jest.Mock;
  discoverAccounts: jest.Mock;
  addAccounts: jest.Mock;
  isAccountCompatible?: jest.Mock;
  getName: jest.Mock;
};

export function makeMockAccountProvider(
  accounts: KeyringAccount[] = [],
): MockAccountProvider {
  const accountsIds = accounts.map((account) => account.id);
  return {
    accounts,
    accountsList: accountsIds,
    constructor: jest.fn(),
    getAccount: jest.fn(),
    getAccounts: jest.fn(),
    createAccounts: jest.fn(),
    discoverAccounts: jest.fn(),
    addAccounts: jest.fn(),
    isAccountCompatible: jest.fn(),
    getName: jest.fn(),
  };
}

export function setupNamedAccountProvider({
  name = 'Mocked Provider',
  accounts,
  mocks = makeMockAccountProvider(),
}: {
  name?: string;
  mocks?: MockAccountProvider;
  accounts: KeyringAccount[];
}): MockAccountProvider {
  // You can mock this and all other mocks will re-use that list
  // of accounts.
  mocks.accounts = accounts;
  mocks.accountsList = accounts.map((account) => account.id);

  const getAccounts = () =>
    mocks.accounts.filter((account) => mocks.accountsList.includes(account.id));

  mocks.getName.mockImplementation(() => name);

  mocks.getAccounts.mockImplementation(getAccounts);
  mocks.getAccount.mockImplementation(
    (id: Bip44Account<KeyringAccount>['id']) =>
      // Assuming this never fails.
      getAccounts().find((account) => account.id === id),
  );
  mocks.createAccounts.mockResolvedValue([]);
  mocks.addAccounts.mockImplementation((ids: string[]) =>
    mocks.accountsList.push(...ids),
  );

  return mocks;
}
