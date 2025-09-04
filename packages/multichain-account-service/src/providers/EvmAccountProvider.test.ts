import type { Messenger } from '@metamask/base-controller';
import { EthAccountType, EthScope } from '@metamask/keyring-api';
import {
  KeyringTypes,
  type KeyringMetadata,
} from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
} from '@metamask/network-controller';

import { EvmAccountProvider } from './EvmAccountProvider';
import {
  ETH_EOA_METHODS,
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MOCK_HD_KEYRING_1,
  MockAccountBuilder,
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
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withUuid()
          .withAddressSuffix(`${this.accounts.length}`)
          .withGroupIndex(this.accounts.length)
          .get(),
      );
    }

    return this.accounts
      .slice(newAccountsIndex)
      .map((account) => account.address);
  });

  removeAccount = jest.fn().mockImplementation((address: string) => {
    const index = this.accounts.findIndex((a) => a.address === address);
    if (index >= 0) {
      this.accounts.splice(index, 1);
    }
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
    mockProviderRequest: jest.Mock;
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

  const mockProviderRequest = jest.fn().mockImplementation(({ method }) => {
    if (method === 'eth_getTransactionCount') {
      return '0x2';
    }
    throw new Error(`Unknown method: ${method}`);
  });

  messenger.registerActionHandler(
    'AccountsController:getAccountByAddress',
    mockGetAccountByAddress,
  );

  messenger.registerActionHandler(
    'KeyringController:withKeyring',
    async (_, operation) => operation({ keyring, metadata: keyring.metadata }),
  );

  messenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    () => 'mock-network-client-id',
  );

  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    () => {
      const provider = {
        request: mockProviderRequest,
      };

      return {
        provider,
      } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>;
    },
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
      mockProviderRequest,
    },
  };
}

describe('EvmAccountProvider', () => {
  it('getName returns EVM', () => {
    const { provider } = setup({ accounts: [] });
    expect(provider.getName()).toBe('EVM');
  });

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

  it('does not re-create accounts (idempotent)', async () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
    expect(newAccounts).toHaveLength(1);
    expect(newAccounts[0]).toStrictEqual(MOCK_HD_ACCOUNT_1);
  });

  it('throws if the created account is not BIP-44 compatible', async () => {
    const accounts = [MOCK_HD_ACCOUNT_1];
    const { provider, mocks } = setup({
      accounts,
    });

    mocks.getAccountByAddress.mockReturnValue({
      ...MOCK_HD_ACCOUNT_1,
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
      accounts: [MOCK_HD_ACCOUNT_1],
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
      accounts: [MOCK_HD_ACCOUNT_1],
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

  it('discover accounts at the next group index', async () => {
    const { provider } = setup({
      accounts: [],
    });

    const expectedAccount = {
      ...MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withAddressSuffix('0')
        .get(),
      id: expect.any(String),
    };

    expect(
      await provider.discoverAndCreateAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([expectedAccount]);

    expect(provider.getAccounts()).toStrictEqual([expectedAccount]);
  });

  it('removes discovered account if no transaction history is found', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    mocks.mockProviderRequest.mockReturnValue('0x0');

    expect(
      await provider.discoverAndCreateAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      }),
    ).toStrictEqual([]);

    await Promise.resolve();

    expect(provider.getAccounts()).toStrictEqual([MOCK_HD_ACCOUNT_1]);
  });

  it('removes discovered account if RPC request fails', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    mocks.mockProviderRequest.mockImplementation(() => {
      throw new Error('RPC request failed');
    });

    expect(
      await provider.discoverAndCreateAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      }),
    ).toStrictEqual([]);

    expect(provider.getAccounts()).toStrictEqual([MOCK_HD_ACCOUNT_1]);
  });

  it('returns an existing account if it already exists', async () => {
    const { provider } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    expect(
      await provider.discoverAndCreateAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([MOCK_HD_ACCOUNT_1]);
  });
});
