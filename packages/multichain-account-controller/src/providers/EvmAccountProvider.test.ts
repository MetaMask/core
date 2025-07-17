import type { Messenger } from '@metamask/base-controller';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';

import { EvmAccountProvider } from './EvmAccountProvider';
import {
  getMultichainAccountControllerMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MockAccountBuilder,
} from '../tests';
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountControllerActions,
  MultichainAccountControllerEvents,
} from '../types';

class MockEthKeyring implements EthKeyring {
  readonly type = 'MockEthKeyring';

  readonly metadata: KeyringMetadata = {
    id: 'mock-eth-keyring-id',
    name: '',
  };

  readonly accounts: InternalAccount[];

  constructor(accounts: InternalAccount[]) {
    this.accounts = accounts;
  }

  async serialize() {
    return 'serialized';
  }

  async deserialize(_: string) {
    // Not required.
  }

  getAccounts = jest
    .fn()
    .mockImplementation(() => this.accounts.map((account) => account.address));

  addAccounts = jest.fn().mockImplementation((numberOfAccounts: number) => {
    const newAccountsIndex = this.accounts.length;

    // Just generate a new address by appending the number of accounts owned by that fake keyring.
    for (let i = 0; i < numberOfAccounts; i++) {
      this.accounts.push(
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withUuid()
          .withAddressSuffix(`${this.accounts.length}`)
          .get(),
      );
    }

    return this.accounts
      .slice(newAccountsIndex)
      .map((account) => account.address);
  });
}

/**
 * Sets up a EvmAccountProvider for testing.
 *
 * @param options - Configuration options for setup.
 * @param options.messenger - An optional messenger instance to use. Defaults to a new Messenger.
 * @param options.accounts - List of accounts to use.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts = [],
}: {
  messenger?: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
} = {}): {
  provider: EvmAccountProvider;
  messenger: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
  keyring: MockEthKeyring;
  mocks: {
    getAccountsByAddress: jest.Mock;
  };
} {
  const keyring = new MockEthKeyring(accounts);

  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    () => accounts,
  );

  const mockGetAccountByAddress = jest
    .fn()
    .mockImplementation((address: string) =>
      keyring.accounts.find((account) => account.address === address),
    );
  messenger.registerActionHandler(
    'AccountsController:getAccountByAddress',
    mockGetAccountByAddress,
  );

  messenger.registerActionHandler(
    'KeyringController:withKeyring',
    async (_, operation) => operation({ keyring, metadata: keyring.metadata }),
  );

  const provider = new EvmAccountProvider(
    getMultichainAccountControllerMessenger(messenger),
  );

  return {
    provider,
    messenger,
    keyring,
    mocks: {
      getAccountsByAddress: mockGetAccountByAddress,
    },
  };
}

describe('EvmAccountProvider', () => {
  it('gets accounts', () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const account = MOCK_HD_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(account.id)).toStrictEqual(account);
  });

  it('throws if account does not exist', () => {
    const account = MOCK_HD_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    const unknownAccount = MOCK_HD_ACCOUNT_2;
    expect(() => provider.getAccount(unknownAccount.id)).toThrow(
      `Unable to find account: ${unknownAccount.id}`,
    );
  });
});
