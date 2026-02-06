import { publicToAddress } from '@ethereumjs/util';
import type { Bip44Account } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import {
  KeyringAccountEntropyMnemonicOptions,
  KeyringAccountEntropyTypeOption,
} from '@metamask/keyring-api';
import type { KeyringMetadata } from '@metamask/keyring-controller';
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

import {
  EVM_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
  EVM_ACCOUNT_PROVIDER_NAME,
  EvmAccountProvider,
  EvmAccountProviderConfig,
} from './EvmAccountProvider';
import { TimeoutError } from './utils';
import { TraceName } from '../constants/traces';
import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MOCK_HD_KEYRING_1,
  MOCK_SOL_ACCOUNT_1,
  MockAccountBuilder,
  mockAsInternalAccount,
  RootMessenger,
} from '../tests';
import { AccountCreationType } from '../types';

jest.mock('@ethereumjs/util', () => {
  const actual = jest.requireActual('@ethereumjs/util');
  return {
    ...actual,
    publicToAddress: jest.fn(),
  };
});

function mockNextDiscoveryAddress(address: string): void {
  jest.mocked(publicToAddress).mockReturnValue(createBytes(address as Hex));
}

function mockNextDiscoveryAddressOnce(address: string): void {
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

  async serialize(): Promise<string> {
    return 'serialized';
  }

  async deserialize(_: string): Promise<void> {
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
 * @param options.config - Provider config.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts = [],
  discovery,
  config,
}: {
  messenger?: RootMessenger;
  accounts?: InternalAccount[];
  discovery?: {
    transactionCount: string;
  };
  config?: EvmAccountProviderConfig;
} = {}): {
  provider: EvmAccountProvider;
  messenger: RootMessenger;
  keyring: MockEthKeyring;
  mocks: {
    mockProviderRequest: jest.Mock;
    mockGetAccount: jest.Mock;
  };
} {
  const keyring = new MockEthKeyring(accounts);

  messenger.registerActionHandler(
    'AccountsController:getAccounts',
    () => accounts,
  );

  const mockGetAccount = jest.fn().mockImplementation((id) => {
    return keyring.accounts.find(
      (account) =>
        account.id === id ||
        getUUIDFromAddressOfNormalAccount(account.address) === id,
    );
  });

  messenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount,
  );

  const mockGetAccountByAddress = jest.fn().mockImplementation((address) => {
    return keyring.accounts.find((account) => account.address === address);
  });

  messenger.registerActionHandler(
    'AccountsController:getAccountByAddress',
    mockGetAccountByAddress,
  );

  const mockProviderRequest = jest.fn().mockImplementation(({ method }) => {
    if (method === 'eth_getTransactionCount') {
      return discovery?.transactionCount ?? '0x2';
    }
    throw new Error(`Unknown method: ${method}`);
  });

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

  mockNextDiscoveryAddress('0x123');

  const provider = new EvmAccountProvider(
    getMultichainAccountServiceMessenger(messenger),
    config,
  );

  const accountIds = accounts.map((account) => account.id);
  provider.init(accountIds);

  return {
    provider,
    messenger,
    keyring,
    mocks: {
      mockProviderRequest,
      mockGetAccount,
    },
  };
}

describe('EvmAccountProvider', () => {
  it('getName returns EVM', () => {
    const { provider } = setup({ accounts: [] });
    expect(provider.getName()).toBe(EVM_ACCOUNT_PROVIDER_NAME);
  });

  it('gets accounts', () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const customId = 'custom-id-123';
    const account = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withId(customId)
      .get();
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(customId)).toStrictEqual(account);
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

  it('returns true if an account is compatible', () => {
    const account = MOCK_HD_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });
    expect(provider.isAccountCompatible(account)).toBe(true);
  });

  it('returns false if an account is not compatible', () => {
    const account = MOCK_SOL_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });
    expect(provider.isAccountCompatible(account)).toBe(false);
  });

  it('does create accounts', async () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = (await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndex,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 2,
    })) as Bip44Account<InternalAccount>[];
    expect(newAccounts).toHaveLength(1);
    expect(newAccounts[0].options.entropy.type).toBe(
      KeyringAccountEntropyTypeOption.Mnemonic,
    );

    // We now this is safe, we have have checked for `entropy` above.
    const options = newAccounts[0].options
      .entropy as KeyringAccountEntropyMnemonicOptions;
    expect(options.groupIndex).toBe(2);
  });

  it('does not re-create accounts (idempotent)', async () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndex,
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

    mocks.mockGetAccount.mockReturnValue({
      ...mockAsInternalAccount(MOCK_HD_ACCOUNT_1),
      options: {}, // No options, so it cannot be BIP-44 compatible.
    });

    await expect(
      provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
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
        type: AccountCreationType.Bip44DeriveIndex,
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
    mocks.mockGetAccount.mockImplementation(() => undefined);

    await expect(
      provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 1,
      }),
    ).rejects.toThrow('Internal account does not exist');
  });

  describe('createAccounts with range type', () => {
    it('creates accounts for all group indices from 0 to maxGroupIndex', async () => {
      const existingAccounts = [MOCK_HD_ACCOUNT_1]; // Group 0.
      const { provider } = setup({
        accounts: existingAccounts,
      });

      const result = (await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 2 },
      })) as Bip44Account<InternalAccount>[][];

      // Should return array with 3 elements (indices 0, 1, 2).
      expect(result).toHaveLength(3);

      // Each element should be an array of accounts.
      expect(Array.isArray(result[0])).toBe(true);
      expect(Array.isArray(result[1])).toBe(true);
      expect(Array.isArray(result[2])).toBe(true);

      // Each group should have exactly 1 account.
      expect(result[0]).toHaveLength(1);
      expect(result[1]).toHaveLength(1);
      expect(result[2]).toHaveLength(1);

      // Verify group indices.
      const entropy0 = result[0][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;
      const entropy1 = result[1][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;
      const entropy2 = result[2][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;

      expect(entropy0.groupIndex).toBe(0);
      expect(entropy1.groupIndex).toBe(1);
      expect(entropy2.groupIndex).toBe(2);
    });

    it('returns array structure where index corresponds to group index', async () => {
      const { provider } = setup({
        accounts: [],
      });

      const result = (await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 1 },
      })) as Bip44Account<InternalAccount>[][];

      // result[0] should contain accounts for group 0.
      const entropy0 = result[0][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;
      expect(entropy0.groupIndex).toBe(0);

      // result[1] should contain accounts for group 1.
      const entropy1 = result[1][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;
      expect(entropy1.groupIndex).toBe(1);
    });

    it('is idempotent - returns existing accounts if they already exist', async () => {
      const existingAccounts = [
        MOCK_HD_ACCOUNT_1, // Group 0.
        MOCK_HD_ACCOUNT_2, // Group 1.
      ];
      const { provider } = setup({
        accounts: existingAccounts,
      });

      const result = (await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 1 },
      })) as Bip44Account<InternalAccount>[][];

      expect(result).toHaveLength(2);

      // Should return existing accounts.
      expect(result[0][0]).toStrictEqual(MOCK_HD_ACCOUNT_1);
      expect(result[1][0]).toStrictEqual(MOCK_HD_ACCOUNT_2);
    });

    it('handles maxGroupIndex of 0 (single account)', async () => {
      const { provider } = setup({
        accounts: [],
      });

      const result = (await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 0 },
      })) as Bip44Account<InternalAccount>[][];

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);

      const entropy = result[0][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;
      expect(entropy.groupIndex).toBe(0);
    });

    it('creates mix of new and existing accounts', async () => {
      const existingAccount = MOCK_HD_ACCOUNT_1; // Group 0 exists.
      const { provider } = setup({
        accounts: [existingAccount],
      });

      const result = (await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 2 },
      })) as Bip44Account<InternalAccount>[][];

      expect(result).toHaveLength(3);

      // Group 0 should return existing account.
      expect(result[0][0]).toStrictEqual(existingAccount);

      // Groups 1 and 2 should be newly created.
      const entropy1 = result[1][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;
      const entropy2 = result[2][0].options
        .entropy as KeyringAccountEntropyMnemonicOptions;

      expect(entropy1.groupIndex).toBe(1);
      expect(entropy2.groupIndex).toBe(2);
      expect(result[1][0].id).not.toBe(existingAccount.id);
      expect(result[2][0].id).not.toBe(existingAccount.id);
    });

    it('all created accounts are BIP-44 compatible', async () => {
      const { provider } = setup({
        accounts: [],
      });

      const result = (await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 2 },
      })) as Bip44Account<InternalAccount>[][];

      // Check that all accounts have proper BIP-44 structure.
      for (const accountGroup of result) {
        for (const account of accountGroup) {
          expect(account.options.entropy).toBeDefined();
          expect(account.options.entropy.type).toBe(
            KeyringAccountEntropyTypeOption.Mnemonic,
          );
          const mnemonicOptions = account.options
            .entropy as KeyringAccountEntropyMnemonicOptions;
          expect(typeof mnemonicOptions.groupIndex).toBe('number');
          expect(mnemonicOptions.id).toBe(MOCK_HD_KEYRING_1.metadata.id);
        }
      }
    });

    it('adds all created accounts to provider internal store', async () => {
      const { provider } = setup({
        accounts: [],
      });

      await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 2 },
      });

      // All 3 accounts should now be accessible via getAccounts.
      const allAccounts = provider.getAccounts();
      expect(allAccounts).toHaveLength(3);
    });

    it('throws if any internal account cannot be found', async () => {
      const { provider, mocks } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
      });

      // Make the second account lookup fail.
      let callCount = 0;
      mocks.mockGetAccount.mockImplementation(() => {
        callCount++;
        if (callCount > 1) {
          return undefined;
        }
        return MOCK_HD_ACCOUNT_1;
      });

      await expect(
        provider.createAccounts({
          type: AccountCreationType.Bip44DeriveIndexRange,
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          range: { from: 0, to: 2 },
        }),
      ).rejects.toThrow('Internal account does not exist');
    });

    it('throws if any created account is not BIP-44 compatible', async () => {
      const accounts = [MOCK_HD_ACCOUNT_1];
      const { provider, mocks } = setup({
        accounts,
      });

      // Make the second account return invalid structure.
      let callCount = 0;
      mocks.mockGetAccount.mockImplementation((id) => {
        callCount++;
        if (callCount > 1) {
          return {
            ...mockAsInternalAccount(MOCK_HD_ACCOUNT_1),
            options: {}, // No options, so it cannot be BIP-44 compatible.
          };
        }
        return accounts.find(
          (account) =>
            account.id === id ||
            getUUIDFromAddressOfNormalAccount(account.address) === id,
        );
      });

      await expect(
        provider.createAccounts({
          type: AccountCreationType.Bip44DeriveIndexRange,
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
          range: { from: 0, to: 2 },
        }),
      ).rejects.toThrow('Created account is not BIP-44 compatible');
    });

    it('does not throw on gaps - fills in all indices', async () => {
      const { provider } = setup({
        accounts: [MOCK_HD_ACCOUNT_1], // Only group 0 exists.
      });

      // Should succeed even though there's a gap - createAccounts with range type doesn't enforce no-gap policy.
      const result = (await provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: { from: 0, to: 5 },
      })) as Bip44Account<InternalAccount>[][];

      expect(result).toHaveLength(6);

      // All indices should be filled.
      for (let i = 0; i <= 5; i++) {
        expect(result[i]).toHaveLength(1);
        const entropy = result[i][0].options
          .entropy as KeyringAccountEntropyMnemonicOptions;
        expect(entropy.groupIndex).toBe(i);
      }
    });
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

  it('stops discovery gracefully if response is invalid', async () => {
    const { provider } = setup({
      accounts: [],
      discovery: {
        transactionCount: '', // Faking bad hex number.
      },
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([]);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Received invalid hex response from "eth_getTransactionCount" request: ""',
    );
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

  it('calls trace callback during account discovery', async () => {
    const mockTrace = jest.fn().mockImplementation(async (request, fn) => {
      expect(request.name).toBe(TraceName.EvmDiscoverAccounts);
      expect(request.data).toStrictEqual({
        provider: EVM_ACCOUNT_PROVIDER_NAME,
      });
      return await fn();
    });

    const { messenger } = setup({
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

    // Create provider with custom trace callback
    const providerWithTrace = new EvmAccountProvider(
      getMultichainAccountServiceMessenger(messenger),
      {
        discovery: {
          maxAttempts: 3,
          timeoutMs: 500,
          backOffMs: 500,
        },
      },
      mockTrace,
    );

    const result = await providerWithTrace.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(result).toStrictEqual([expectedAccount]);
    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  it('uses fallback trace when no trace callback is provided', async () => {
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

    const result = await provider.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(result).toStrictEqual([expectedAccount]);
  });

  it('trace callback is called even when discovery returns empty results', async () => {
    const mockTrace = jest.fn().mockImplementation(async (request, fn) => {
      expect(request.name).toBe(TraceName.EvmDiscoverAccounts);
      expect(request.data).toStrictEqual({
        provider: EVM_ACCOUNT_PROVIDER_NAME,
      });
      return await fn();
    });

    const { messenger } = setup({
      accounts: [],
      discovery: {
        transactionCount: '0x0', // No transactions, should return empty
      },
    });

    const account = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withAddressSuffix('0')
      .get();

    mockNextDiscoveryAddressOnce(account.address);

    const providerWithTrace = new EvmAccountProvider(
      getMultichainAccountServiceMessenger(messenger),
      {
        discovery: {
          maxAttempts: 3,
          timeoutMs: 500,
          backOffMs: 500,
        },
      },
      mockTrace,
    );

    const result = await providerWithTrace.discoverAccounts({
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });

    expect(result).toStrictEqual([]);
    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  it('does not run discovery if disabled', async () => {
    const { provider } = setup({
      accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
      config: {
        ...EVM_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
        discovery: {
          ...EVM_ACCOUNT_PROVIDER_DEFAULT_CONFIG.discovery,
          enabled: false,
        },
      },
    });

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([]);
  });

  it('does nothing when re-syncing accounts', async () => {
    const { provider } = setup({
      accounts: [],
    });

    expect(await provider.resyncAccounts()).toBeUndefined();
  });
});
