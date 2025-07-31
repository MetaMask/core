/* eslint-disable jsdoc/require-jsdoc */

import type { Bip44Account } from '@metamask/account-api';
import { isBip44Account } from '@metamask/account-api';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { MultichainAccountServiceMessenger } from '../types';

export type MockAccountProvider = {
  accounts: InternalAccount[];
  getAccount: jest.Mock;
  getAccounts: jest.Mock;
  createAccounts: jest.Mock;
  discoverAndCreateAccounts: jest.Mock;
};

export function mockAccountProvider<Provider>(
  providerClass: new (messenger: MultichainAccountServiceMessenger) => Provider,
  mocks: MockAccountProvider,
  accounts: InternalAccount[],
  type?: KeyringAccount['type'],
) {
  jest
    .mocked(providerClass)
    .mockImplementation(() => mocks as unknown as Provider);

  // You can mock this and all other mocks will re-use that list
  // of accounts.
  mocks.accounts = accounts;

  const getAccounts = () =>
    mocks.accounts.filter(
      (account) => isBip44Account(account) && type && account.type === type,
    );

  mocks.getAccounts.mockImplementation(getAccounts);
  mocks.getAccount.mockImplementation(
    (id: Bip44Account<InternalAccount>['id']) =>
      // Assuming this never fails.
      getAccounts().find((account) => account.id === id),
  );
}
