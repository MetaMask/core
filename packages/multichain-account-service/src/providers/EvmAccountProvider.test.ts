/* eslint-disable jsdoc/require-jsdoc */
import { publicToAddress } from '@ethereumjs/util';
import type { Messenger } from '@metamask/base-controller';
import { type KeyringMetadata } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
} from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { createBytes } from '@metamask/utils';

import { EvmAccountProvider } from './EvmAccountProvider';
import { TimeoutError } from './utils';
import {
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

jest.mock('@ethereumjs/util', () => ({
  publicToAddress: jest.fn(),
}));

function mockNextDiscoveryAddressOnce(address: string) {
  jest.mocked(publicToAddress).mockReturnValueOnce(createBytes(address as Hex));
}

type MockHdKey = {
  deriveChild: jest.Mock;
};

function mockHdKey(): MockHdKey {
  return {
    deriveChild: jest.fn().mockImplementation(() => {
      return {
        publicKey: new Uint8Array(65),
      };
    }),
  };
}

class MockEthKeyring implements EthKeyring {
  readonly type = 'MockEthKeyring';

  readonly metadata: KeyringMetadata = {
    id: 'mock-eth-keyring-id',
    name: '',
  };

  readonly accounts: InternalAccount[];

  readonly root: MockHdKey;

  constructor(accounts: InternalAccount[]) {
    this.accounts = accounts;
    this.root = mockHdKey();
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
 * @param options.discovery - Discovery options.
 * @param options.discovery.transactionCount - Transaction count (use '0x0' to stop the discovery).
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts = [],
  discovery,
}: {
  messenger?: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
  discovery?: {
    transactionCount: string;
  };
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
      return discovery?.transactionCount ?? '0x2';
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

    const account = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withAddressSuffix('0')
      .get();

    const expectedAccount = {
      ...account,
      id: expect.any(String),
    };

    mockNextDiscoveryAddressOnce(account.address);

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([expectedAccount]);

    expect(provider.getAccounts()).toStrictEqual([expectedAccount]);
  });

  it('stops discovery if there is no transaction activity', async () => {
    const { provider } = setup({
      accounts: [],
      discovery: {
        transactionCount: '0x0',
      },
    });

    const account = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withAddressSuffix('0')
      .get();

    mockNextDiscoveryAddressOnce(account.address);

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([]);

    expect(provider.getAccounts()).toStrictEqual([]);
  });

  it('retries RPC request up to 3 times if it fails and throws the last error', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    mocks.mockProviderRequest
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 1');
      })
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 2');
      })
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 3');
      })
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 4');
      });

    mockNextDiscoveryAddressOnce('0x123');

    await expect(
      provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      }),
    ).rejects.toThrow('RPC request failed 3');
  });

  it('throws if the RPC request times out', async () => {
    const { provider, mocks } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    mocks.mockProviderRequest.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve('0x0');
        }, 600);
      });
    });

    mockNextDiscoveryAddressOnce('0x123');

    await expect(
      provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      }),
    ).rejects.toThrow(TimeoutError);
  });

  it('returns an existing account if it already exists', async () => {
    const { provider } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([MOCK_HD_ACCOUNT_1]);
  });
});
