import { publicToAddress } from '@ethereumjs/util';
import { isBip44Account } from '@metamask/account-api';
import { HdKeyring as LegacyHdKeyring } from '@metamask/eth-hd-keyring';
import { AccountCreationType, EthScope } from '@metamask/keyring-api';
import type {
  CreateAccountOptions,
  KeyringAccount,
} from '@metamask/keyring-api';
import type { Keyring } from '@metamask/keyring-api/v2';
import { KeyringType } from '@metamask/keyring-api/v2';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
} from '@metamask/network-controller';
import { add0x, bytesToHex } from '@metamask/utils';

import { TraceName } from '../analytics/traces';
import {
  asKeyringAccount,
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
import {
  EVM_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
  EVM_ACCOUNT_PROVIDER_NAME,
  EvmAccountProvider,
  EvmAccountProviderConfig,
} from './EvmAccountProvider';
import { TimeoutError } from './utils';

// Real HD root rooted at a valid BIP-39 test mnemonic so the address peeked via
// `keyring.root.deriveChild(groupIndex)` matches the address that the mock's
// `createAccounts` later returns at the same index.
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
let mockHdRoot: NonNullable<LegacyHdKeyring['root']>;

/**
 * Derives the EVM address for a given group index using the test mnemonic.
 *
 * @param groupIndex - The BIP-44 group index.
 * @returns The lowercase hex address.
 */
function deriveAddressForIndex(groupIndex: number): string {
  const child = mockHdRoot.deriveChild(groupIndex);
  if (!child.publicKey) {
    throw new Error('Expected derived public key to be set');
  }
  return add0x(
    bytesToHex(publicToAddress(child.publicKey, true)).toLowerCase(),
  );
}

/**
 * Builds an HD account fixture whose address matches what
 * `mockHdRoot.deriveChild(groupIndex)` would derive.
 *
 * @param groupIndex - The BIP-44 group index.
 * @returns A Bip44 InternalAccount fixture for the index.
 */
function makeDerivedHdAccount(groupIndex: number): InternalAccount {
  return MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
    .withUuid()
    .withAddress(deriveAddressForIndex(groupIndex))
    .withGroupIndex(groupIndex)
    .get();
}

// Mock V2 HD Keyring implementing the Keyring interface from @metamask/keyring-api/v2.
class MockHdKeyringV2 implements Keyring {
  readonly type = KeyringType.Hd;

  readonly capabilities = {
    scopes: [EthScope.Eoa],
    bip44: { deriveIndex: true },
  };

  // Internal test-only state — not part of the Keyring interface.
  readonly accounts: KeyringAccount[];

  readonly metadata: KeyringMetadata = {
    id: 'mock-eth-keyring-id',
    name: '',
  };

  constructor(accounts: InternalAccount[]) {
    this.accounts = accounts.map(
      ({ metadata, ...keyringAccount }) => keyringAccount,
    );
  }

  /**
   * The HD root that the EVM provider uses to peek the next address
   * (via `root.deriveChild(groupIndex)`) without persisting an account.
   *
   * @returns The HD root derived from the test mnemonic.
   */
  get root(): NonNullable<LegacyHdKeyring['root']> {
    return mockHdRoot;
  }

  getAccounts = jest.fn().mockImplementation(() => this.accounts);

  getAccount = jest.fn().mockImplementation((accountId: string) => {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }
    return account;
  });

  createAccounts = jest
    .fn()
    .mockImplementation((options: CreateAccountOptions) => {
      const newAccounts: KeyringAccount[] = [];

      if (options.type === AccountCreationType.Bip44DeriveIndex) {
        // Derive at the caller-supplied `groupIndex` (rather than
        // `this.accounts.length`) so that a production bug forwarding the
        // wrong index would surface as an address/identity mismatch in
        // tests, instead of being masked by the mock re-deriving
        // sequentially.
        const { groupIndex } = options;
        const { metadata, ...keyringAccount } =
          makeDerivedHdAccount(groupIndex);
        this.accounts.push(keyringAccount);
        newAccounts.push(keyringAccount);
      }

      return newAccounts;
    });

  deleteAccount = jest.fn().mockImplementation((accountId: string) => {
    const index = this.accounts.findIndex((a) => a.id === accountId);
    if (index >= 0) {
      this.accounts.splice(index, 1);
    }
  });

  serialize = jest.fn().mockResolvedValue({});

  deserialize = jest.fn().mockResolvedValue(undefined);

  submitRequest = jest.fn();
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
  keyring: MockHdKeyringV2;
  mocks: {
    mockProviderRequest: jest.Mock;
    mockGetAccount: jest.Mock;
  };
} {
  const keyring = new MockHdKeyringV2(accounts);

  messenger.registerActionHandler(
    'AccountsController:getAccounts',
    (accountIds: string[]) =>
      keyring.accounts.filter((account) => accountIds.includes(account.id)),
  );

  const mockGetAccount = jest.fn().mockImplementation((id) => {
    return keyring.accounts.find((account) => account.id === id);
  });

  messenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount,
  );

  const mockProviderRequest = jest.fn().mockImplementation(({ method }) => {
    if (method === 'eth_getTransactionCount') {
      return discovery?.transactionCount ?? '0x2';
    }
    throw new Error(`Unknown method: ${method}`);
  });

  messenger.registerActionHandler(
    'KeyringController:withKeyringV2',
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
  beforeAll(async () => {
    const legacy = new LegacyHdKeyring();
    await legacy.deserialize({ mnemonic: TEST_MNEMONIC });
    if (!legacy.root) {
      throw new Error('Failed to initialize test HD root');
    }
    mockHdRoot = legacy.root;
  });

  it('getName returns EVM', () => {
    const { provider } = setup({ accounts: [] });
    expect(provider.getName()).toBe(EVM_ACCOUNT_PROVIDER_NAME);
  });

  it('gets accounts', () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(
      accounts.map(asKeyringAccount),
    );
  });

  it('gets a specific account', () => {
    const customId = 'custom-id-123';
    const account = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
      .withId(customId)
      .get();
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(customId)).toStrictEqual(
      asKeyringAccount(account),
    );
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
    expect(newAccounts[0]).toStrictEqual(asKeyringAccount(MOCK_HD_ACCOUNT_1));
  });

  it('creates multiple accounts using Bip44DeriveIndexRange', async () => {
    const accounts = [MOCK_HD_ACCOUNT_1];
    const { provider, keyring } = setup({
      accounts,
    });

    const from = 1;
    const newAccounts = await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndexRange,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      range: {
        from,
        to: 3,
      },
    });

    expect(newAccounts).toHaveLength(3);
    // HdKeyringV2 only supports bip44:derive-index, so range creation
    // calls createAccounts once per new index.
    expect(keyring.createAccounts).toHaveBeenCalledTimes(3);

    // Verify each account has the correct group index.
    for (const [index, account] of newAccounts.entries()) {
      expect(isBip44Account(account)).toBe(true);
      expect(account.options.entropy.groupIndex).toBe(from + index);
    }
  });

  it('creates accounts with range starting from 0', async () => {
    const { provider, keyring } = setup({
      accounts: [],
    });

    const newAccounts = await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndexRange,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      range: {
        from: 0,
        to: 2,
      },
    });

    expect(newAccounts).toHaveLength(3);
    expect(keyring.createAccounts).toHaveBeenCalledTimes(3);
    expect(keyring.createAccounts).toHaveBeenCalledWith({
      type: AccountCreationType.Bip44DeriveIndex,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
    });
  });

  it('creates a single account when range from equals to', async () => {
    const { provider, keyring } = setup({
      accounts: [],
    });

    // First create accounts 0-4 to avoid gaps.
    await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndexRange,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      range: {
        from: 0,
        to: 4,
      },
    });

    // Now create a single account at index 5 where from equals to.
    const newAccounts = await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndexRange,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      range: {
        from: 5,
        to: 5,
      },
    });

    expect(newAccounts).toHaveLength(1);
    // 5 calls for range 0-4 + 1 call for account 5.
    expect(keyring.createAccounts).toHaveBeenCalledTimes(6);
    expect(
      isBip44Account(newAccounts[0]) &&
        newAccounts[0].options.entropy.groupIndex,
    ).toBe(5);
  });

  it('throws when trying to create gaps with range', async () => {
    const { provider } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    const nextGroupIndex = MOCK_HD_ACCOUNT_1.options.entropy.groupIndex + 1;

    const from = 5;
    await expect(
      provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: {
          from,
          to: 10,
        },
      }),
    ).rejects.toThrow(
      `Bad account creation request, group index range would create gaps (${from} (from) > ${nextGroupIndex} (next available index))`,
    );
  });

  it('returns existing accounts when range includes already created accounts', async () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider, keyring } = setup({
      accounts,
    });

    const newAccounts = await provider.createAccounts({
      type: AccountCreationType.Bip44DeriveIndexRange,
      entropySource: MOCK_HD_KEYRING_1.metadata.id,
      range: {
        from: 0,
        to: 3,
      },
    });

    // Should return 4 accounts: 2 existing (indices 0,1) + 2 new (indices 2,3).
    expect(newAccounts).toHaveLength(4);
    expect(newAccounts[0]).toStrictEqual(asKeyringAccount(MOCK_HD_ACCOUNT_1));
    expect(newAccounts[1]).toStrictEqual(asKeyringAccount(MOCK_HD_ACCOUNT_2));
    // Only new accounts (indices 2 and 3) should be created — one call each.
    expect(keyring.createAccounts).toHaveBeenCalledTimes(2);
  });

  it('throws when the keyring returns no created account during range creation', async () => {
    const { provider, keyring } = setup({ accounts: [] });

    // Simulate the keyring failing to create an account on the first call.
    keyring.createAccounts.mockImplementationOnce(() => []);

    await expect(
      provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        range: {
          from: 0,
          to: 1,
        },
      }),
    ).rejects.toThrow('Account creation failed');
  });

  it('throws when single Bip44DeriveIndex creation returns no account', async () => {
    const { provider, keyring } = setup({ accounts: [] });

    keyring.createAccounts.mockImplementationOnce(() => []);

    await expect(
      provider.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow('Account creation failed');
    // The provider should not register the account when nothing was created.
    expect(provider.getAccounts()).toStrictEqual([]);
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

  it('throws an error when type is not "bip44:derive-index"', async () => {
    const { provider } = setup({
      accounts: [MOCK_HD_ACCOUNT_1],
    });

    await expect(
      provider.createAccounts({
        // @ts-expect-error Testing invalid type handling.
        type: 'unsupported-type',
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow(
      'Unsupported create account option type: unsupported-type',
    );
  });

  it('discover accounts at the next group index', async () => {
    const { provider } = setup({
      accounts: [],
    });

    const expectedAccount = {
      ...asKeyringAccount(makeDerivedHdAccount(0)),
      id: expect.any(String),
    };

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
    const { provider, keyring } = setup({
      accounts: [],
      discovery: {
        transactionCount: '0x0',
      },
    });

    expect(
      await provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).toStrictEqual([]);

    expect(provider.getAccounts()).toStrictEqual([]);
    // Address is peeked via `keyring.root.deriveChild`, so no account
    // is created (or deleted) when there is no on-chain activity.
    expect(keyring.createAccounts).not.toHaveBeenCalled();
    expect(keyring.deleteAccount).not.toHaveBeenCalled();
  });

  it('throws during discovery if the keyring returns no created account', async () => {
    const { provider, keyring } = setup({ accounts: [] });

    // Transaction count > 0 (default mock), so discovery proceeds to creation.
    keyring.createAccounts.mockImplementationOnce(() => []);

    await expect(
      provider.discoverAccounts({
        entropySource: MOCK_HD_KEYRING_1.metadata.id,
        groupIndex: 0,
      }),
    ).rejects.toThrow('Account creation failed');
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
    ).toStrictEqual([asKeyringAccount(MOCK_HD_ACCOUNT_1)]);
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

    const expectedAccount = {
      ...asKeyringAccount(makeDerivedHdAccount(0)),
      id: expect.any(String),
    };

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

    const expectedAccount = {
      ...asKeyringAccount(makeDerivedHdAccount(0)),
      id: expect.any(String),
    };

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
