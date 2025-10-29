/* eslint-disable jsdoc/require-jsdoc */

import type { Bip44Account } from '@metamask/account-api';
import type { KeyringAccount } from '@metamask/keyring-api';

import {
  AccountProviderWrapper,
  BaseBip44AccountProvider,
  EvmAccountProvider,
} from '../providers';

export type MockAccountProvider = {
  accounts: KeyringAccount[];
  accountsList: KeyringAccount['id'][];
  constructor: jest.Mock;
  getAccount: jest.Mock;
  getAccounts: jest.Mock;
  createAccounts: jest.Mock;
  discoverAccounts: jest.Mock;
  addAccounts: jest.Mock;
  isAccountCompatible: jest.Mock;
  removeAccountsFromList: jest.Mock;
  getName: jest.Mock;
  isEnabled: boolean;
  isDisabled: jest.Mock;
  setEnabled: jest.Mock;
};

export function makeMockAccountProvider(
  accounts: KeyringAccount[] = [],
): MockAccountProvider {
  return {
    accounts,
    accountsList: [],
    constructor: jest.fn(),
    getAccount: jest.fn(),
    getAccounts: jest.fn(),
    createAccounts: jest.fn(),
    discoverAccounts: jest.fn(),
    addAccounts: jest.fn(),
    isAccountCompatible: jest.fn(),
    removeAccountsFromList: jest.fn(),
    getName: jest.fn(),
    isDisabled: jest.fn(),
    setEnabled: jest.fn(),
    isEnabled: true,
  };
}

export function setupBip44AccountProvider({
  name = 'Mocked Provider',
  accounts,
  mocks = makeMockAccountProvider(),
  index,
}: {
  name?: string;
  mocks?: MockAccountProvider;
  accounts: KeyringAccount[];
  filter?: (account: KeyringAccount) => boolean;
  index?: number;
}): MockAccountProvider {
  // You can mock this and all other mocks will re-use that list
  // of accounts.
  mocks.accounts = accounts;
  mocks.accountsList = accounts.map((account) => account.id);
  mocks.setEnabled.mockImplementation((bool: boolean) => {
    mocks.isEnabled = bool;
  });
  mocks.isDisabled.mockImplementation(() => !mocks.isEnabled);

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
  mocks.removeAccountsFromList.mockImplementation((ids: string[]) => {
    BaseBip44AccountProvider.prototype.removeAccountsFromList.call(mocks, ids);
  });

  if (index === 0) {
    // Make the first provider to always be an `EvmAccountProvider`, since we
    // check for this pre-condition in some methods.
    Object.setPrototypeOf(mocks, EvmAccountProvider.prototype);
  }

  if (index !== 0) {
    Object.setPrototypeOf(mocks, AccountProviderWrapper.prototype);
  }

  return mocks;
}
