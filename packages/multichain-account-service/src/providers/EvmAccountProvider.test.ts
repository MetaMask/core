import { MockAccountBuilder } from '@metamask/account-api/mocks';
import type { Messenger } from '@metamask/base-controller';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';

import { EvmAccountProvider } from './EvmAccountProvider';
import {
  MOCK_HD_INTERNAL_ACCOUNT_1,
  MOCK_HD_INTERNAL_ACCOUNT_2,
} from '../tests';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_KEYRING_1,
} from '../tests';
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountServiceActions,
  MultichainAccountServiceEvents,
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
        MockAccountBuilder.from(MOCK_HD_INTERNAL_ACCOUNT_1)
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
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
} = {}): {
  provider: EvmAccountProvider;
  messenger: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  keyring: MockEthKeyring;
  mocks: {
    getAccountByAddress: jest.Mock;
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
    getMultichainAccountServiceMessenger(messenger),
  );

  return {
    provider,
    messenger,
    keyring,
    mocks: {
      getAccountByAddress: mockGetAccountByAddress,
    },
  };
}

describe('EvmAccountProvider', () => {
  it('gets accounts', () => {
    const accounts = [MOCK_HD_INTERNAL_ACCOUNT_1, MOCK_HD_INTERNAL_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const account = MOCK_HD_INTERNAL_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(account.id)).toStrictEqual(account);
  });

  it('throws if account does not exist', () => {
    const account = MOCK_HD_INTERNAL_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    const unknownAccount = MOCK_HD_INTERNAL_ACCOUNT_2;
    expect(() => provider.getAccount(unknownAccount.id)).toThrow(
      `Unable to find account: ${unknownAccount.id}`,
    );
  });

  it('does not re-create accounts (idempotent)', async () => {
    const accounts = [MOCK_HD_INTERNAL_ACCOUNT_1, MOCK_HD_INTERNAL_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(newAccounts).toHaveLength(1);
    expect(newAccounts[0]).toStrictEqual(MOCK_HD_INTERNAL_ACCOUNT_1);
  });

  it('throws if the created account is not BIP-44 compatible', async () => {
    const accounts = [MOCK_HD_INTERNAL_ACCOUNT_1];
    const { provider, mocks } = setup({
      accounts,
    });

    mocks.getAccountByAddress.mockReturnValue({
      ...MOCK_HD_INTERNAL_ACCOUNT_1,
      options: {}, // No options, so it cannot be BIP-44 compatible.
    });

    await expect(
      provider.createAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow('Created account is not BIP-44 compatible');
  });

  it('throws when trying to create gaps', async () => {
    const { provider } = setup({
      accounts: [MOCK_HD_INTERNAL_ACCOUNT_1],
    });

    await expect(
      provider.createAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 10,
      }),
    ).rejects.toThrow('Trying to create too many accounts');
  });

  it('throws if internal account cannot be found', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_HD_INTERNAL_ACCOUNT_1],
    });

    // Simulate an account not found.
    mocks.getAccountByAddress.mockImplementation(() => undefined);

    await expect(
      provider.createAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      }),
    ).rejects.toThrow('Internal account does not exist');
  });

  it('discover accounts', async () => {
    const { provider } = setup({
      accounts: [], // No accounts by defaults, so we can discover them
    });

    // TODO: Update this once we really implement the account discovery.
    expect(
      await provider.discoverAndCreateAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([]);
  });
});
