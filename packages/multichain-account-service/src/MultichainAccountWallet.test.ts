/* eslint-disable jsdoc/require-jsdoc */
import type { Bip44Account } from '@metamask/account-api';
import {
  AccountWalletType,
  toAccountGroupId,
  toDefaultAccountGroupId,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import {
  EthAccountType,
  SolAccountType,
  type EntropySourceId,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { MultichainAccountWallet } from './MultichainAccountWallet';
import type { MockAccountProvider } from './tests';
import {
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_KEYRING_1,
  MOCK_SNAP_ACCOUNT_2,
  MOCK_SOL_ACCOUNT_1,
  MOCK_WALLET_1_BTC_P2TR_ACCOUNT,
  MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT,
  MOCK_WALLET_1_ENTROPY_SOURCE,
  MOCK_WALLET_1_EVM_ACCOUNT,
  MOCK_WALLET_1_SOL_ACCOUNT,
  MockAccountBuilder,
  setupNamedAccountProvider,
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  type RootMessenger,
} from './tests';
import type { MultichainAccountServiceMessenger } from './types';

function setup({
  entropySource = MOCK_WALLET_1_ENTROPY_SOURCE,
  messenger = getRootMessenger(),
  providers,
  accounts = [
    [MOCK_WALLET_1_EVM_ACCOUNT],
    [
      MOCK_WALLET_1_SOL_ACCOUNT,
      MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT,
      MOCK_WALLET_1_BTC_P2TR_ACCOUNT,
      MOCK_SNAP_ACCOUNT_2, // Non-BIP-44 account.
    ],
  ],
}: {
  entropySource?: EntropySourceId;
  messenger?: RootMessenger;
  providers?: MockAccountProvider[];
  accounts?: InternalAccount[][];
} = {}): {
  wallet: MultichainAccountWallet<Bip44Account<InternalAccount>>;
  providers: MockAccountProvider[];
  messenger: MultichainAccountServiceMessenger;
} {
  providers ??= accounts.map((providerAccounts, i) => {
    return setupNamedAccountProvider({
      name: `Mocked Provider ${i}`,
      accounts: providerAccounts,
      index: i,
    });
  });

  const serviceMessenger = getMultichainAccountServiceMessenger(messenger);

  messenger.registerActionHandler(
    'ErrorReportingService:captureException',
    jest.fn(),
  );

  const wallet = new MultichainAccountWallet<Bip44Account<InternalAccount>>({
    entropySource,
    providers,
    messenger: serviceMessenger,
  });

  return { wallet, providers, messenger: serviceMessenger };
}

describe('MultichainAccountWallet', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('constructs a multichain account wallet', () => {
      const entropySource = MOCK_WALLET_1_ENTROPY_SOURCE;
      const { wallet } = setup({
        entropySource,
      });

      const expectedWalletId = toMultichainAccountWalletId(entropySource);
      expect(wallet.id).toStrictEqual(expectedWalletId);
      expect(wallet.status).toBe('ready');
      expect(wallet.type).toBe(AccountWalletType.Entropy);
      expect(wallet.entropySource).toStrictEqual(entropySource);
      expect(wallet.getMultichainAccountGroups()).toHaveLength(1); // All internal accounts are using index 0, so it means only 1 multichain account.
    });
  });

  describe('getMultichainAccountGroup', () => {
    it('gets a multichain account group from its index', () => {
      const { wallet } = setup();

      const groupIndex = 0;
      const multichainAccountGroup =
        wallet.getMultichainAccountGroup(groupIndex);
      expect(multichainAccountGroup).toBeDefined();
      expect(multichainAccountGroup?.groupIndex).toBe(groupIndex);

      // We can still get a multichain account group as a "basic" account group too.
      const group = wallet.getAccountGroup(
        toMultichainAccountGroupId(wallet.id, groupIndex),
      );
      expect(group).toBeDefined();
      expect(group?.id).toBe(multichainAccountGroup?.id);
    });
  });

  describe('getAccountGroup', () => {
    it('gets the default multichain account group', () => {
      const { wallet } = setup();

      const group = wallet.getAccountGroup(toDefaultAccountGroupId(wallet.id));
      expect(group).toBeDefined();
      expect(group?.id).toBe(toMultichainAccountGroupId(wallet.id, 0));
    });

    it('gets a multichain account group when using a multichain account group id', () => {
      const { wallet } = setup();

      const group = wallet.getAccountGroup(toDefaultAccountGroupId(wallet.id));
      expect(group).toBeDefined();
      expect(group?.id).toBe(toMultichainAccountGroupId(wallet.id, 0));
    });

    it('returns undefined when using a bad multichain account group id', () => {
      const { wallet } = setup();

      const group = wallet.getAccountGroup(toAccountGroupId(wallet.id, 'bad'));
      expect(group).toBeUndefined();
    });
  });

  describe('sync', () => {
    it('force sync wallet after account provider got new account', () => {
      const mockEvmAccount = MOCK_WALLET_1_EVM_ACCOUNT;
      const provider = setupNamedAccountProvider({
        accounts: [mockEvmAccount],
      });
      const { wallet } = setup({
        providers: [provider],
      });

      expect(wallet.getMultichainAccountGroups()).toHaveLength(1);
      expect(wallet.getAccountGroups()).toHaveLength(1); // We can still get "basic" groups too.

      // Add a new account for the next index.
      provider.getAccounts.mockReturnValue([
        mockEvmAccount,
        {
          ...mockEvmAccount,
          options: {
            ...mockEvmAccount.options,
            entropy: {
              ...mockEvmAccount.options.entropy,
              groupIndex: 1,
            },
          },
        },
      ]);

      // Force sync, so the wallet will "find" a new multichain account.
      wallet.sync();
      expect(wallet.getAccountGroups()).toHaveLength(2);
      expect(wallet.getMultichainAccountGroups()).toHaveLength(2);
    });

    it('skips non-matching wallet during sync', () => {
      const mockEvmAccount = MOCK_WALLET_1_EVM_ACCOUNT;
      const provider = setupNamedAccountProvider({
        accounts: [mockEvmAccount],
      });
      const { wallet } = setup({
        providers: [provider],
      });

      expect(wallet.getMultichainAccountGroups()).toHaveLength(1);

      // Add a new account for another index but not for this wallet.
      provider.getAccounts.mockReturnValue([
        mockEvmAccount,
        {
          ...mockEvmAccount,
          options: {
            ...mockEvmAccount.options,
            entropy: {
              ...mockEvmAccount.options.entropy,
              id: 'mock-unknown-entropy-id',
              groupIndex: 1,
            },
          },
        },
      ]);

      // Even if we have a new account, it's not for this wallet, so it should
      // not create a new multichain account!
      wallet.sync();
      expect(wallet.getMultichainAccountGroups()).toHaveLength(1);
    });

    it('cleans up old multichain account group during sync', () => {
      const mockEvmAccount = MOCK_WALLET_1_EVM_ACCOUNT;
      const provider = setupNamedAccountProvider({
        accounts: [mockEvmAccount],
      });
      const { wallet } = setup({
        providers: [provider],
      });

      expect(wallet.getMultichainAccountGroups()).toHaveLength(1);

      // Account for index 0 got removed, thus, the multichain account for index 0
      // will also be removed.
      provider.getAccounts.mockReturnValue([]);

      // We should not have any multichain account anymore.
      wallet.sync();
      expect(wallet.getMultichainAccountGroups()).toHaveLength(0);
    });
  });

  describe('createMultichainAccountGroup', () => {
    it('creates a multichain account group for a given index', async () => {
      const groupIndex = 1;

      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount]], // 1 provider
      });

      const [provider] = providers;
      const mockNextEvmAccount = MockAccountBuilder.from(mockEvmAccount)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(groupIndex)
        .get();
      // 1. Create the accounts for the new index and returns their IDs.
      provider.createAccounts.mockResolvedValueOnce([mockNextEvmAccount]);
      // 2. When the wallet creates a new multichain account group, it will query
      // all accounts for this given index (so similar to the one we just created).
      provider.getAccounts.mockReturnValueOnce([mockNextEvmAccount]);
      // 3. Required when we call `getAccounts` (below) on the multichain account.
      provider.getAccount.mockReturnValueOnce(mockNextEvmAccount);

      const specificGroup =
        await wallet.createMultichainAccountGroup(groupIndex);
      expect(specificGroup.groupIndex).toBe(groupIndex);

      const internalAccounts = specificGroup.getAccounts();
      expect(internalAccounts).toHaveLength(1);
      expect(internalAccounts[0].type).toBe(EthAccountType.Eoa);
    });

    it('returns the same reference when re-creating using the same index', async () => {
      const { wallet } = setup({
        accounts: [[MOCK_HD_ACCOUNT_1]],
      });

      const group = wallet.getMultichainAccountGroup(0);
      const newGroup = await wallet.createMultichainAccountGroup(0);

      expect(newGroup).toBe(group);
    });

    it('fails to create an account beyond the next index', async () => {
      const { wallet } = setup({
        accounts: [[MOCK_HD_ACCOUNT_1]],
      });

      const groupIndex = 10;
      await expect(
        wallet.createMultichainAccountGroup(groupIndex),
      ).rejects.toThrow(
        `You cannot use a group index that is higher than the next available one: expected <=1, got ${groupIndex}`,
      );
    });

    it('fails to create an account group if the EVM provider fails to create its account', async () => {
      const groupIndex = 1;

      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount]], // 1 provider
      });

      const [provider] = providers;
      provider.createAccounts.mockRejectedValueOnce(
        new Error('Unable to create accounts'),
      );

      await expect(
        wallet.createMultichainAccountGroup(groupIndex),
      ).rejects.toThrow(
        'Unable to create multichain account group for index: 1 with provider "Mocked Provider 0"',
      );
    });

    it('does not fail to create an account group if a non-EVM provider fails to create its account', async () => {
      const groupIndex = 0;
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(groupIndex)
        .get();

      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      const [evmProvider, solProvider] = providers;

      const mockSolProviderError = jest
        .fn()
        .mockRejectedValue('Unable to create');
      evmProvider.createAccounts.mockResolvedValueOnce([mockEvmAccount]);
      solProvider.createAccounts.mockImplementation(mockSolProviderError);

      await wallet.createMultichainAccountGroup(groupIndex);

      expect(
        await wallet.createMultichainAccountGroup(groupIndex),
      ).toBeDefined();
      expect(mockSolProviderError).toHaveBeenCalled();
    });

    it('fails to create an account group if any of the provider fails to create its account and waitForAllProvidersToFinishCreatingAccounts is true', async () => {
      const groupIndex = 1;

      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount]], // 1 provider
      });
      const [provider] = providers;
      provider.createAccounts.mockRejectedValueOnce(
        new Error('Unable to create accounts'),
      );

      await expect(
        wallet.createMultichainAccountGroup(groupIndex, {
          waitForAllProvidersToFinishCreatingAccounts: true,
        }),
      ).rejects.toThrow(
        'Unable to create multichain account group for index: 1',
      );
    });

    it('captures an error when a provider fails to create its account', async () => {
      const groupIndex = 1;
      const { wallet, providers, messenger } = setup({
        accounts: [[MOCK_HD_ACCOUNT_1]],
      });
      const [provider] = providers;
      const providerError = new Error('Unable to create accounts');
      provider.createAccounts.mockRejectedValueOnce(providerError);
      const callSpy = jest.spyOn(messenger, 'call');
      await expect(
        wallet.createMultichainAccountGroup(groupIndex),
      ).rejects.toThrow(
        'Unable to create multichain account group for index: 1',
      );
      expect(callSpy).toHaveBeenCalledWith(
        'ErrorReportingService:captureException',
        new Error('Unable to create account with provider "Mocked Provider 0"'),
      );
      expect(callSpy.mock.lastCall?.[1]).toHaveProperty('cause', providerError);
    });

    it('aggregates non-EVM failures when waiting for all providers', async () => {
      const startingIndex = 0;

      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(startingIndex)
        .get();

      const { wallet, providers } = setup({
        providers: [
          setupNamedAccountProvider({ accounts: [mockEvmAccount], index: 0 }),
          setupNamedAccountProvider({
            name: 'Non-EVM Provider',
            accounts: [],
            index: 1,
          }),
        ],
      });

      const nextIndex = 1;
      const nextEvmAccount = MockAccountBuilder.from(mockEvmAccount)
        .withGroupIndex(nextIndex)
        .get();

      const [evmProvider, solProvider] = providers;
      evmProvider.createAccounts.mockResolvedValueOnce([nextEvmAccount]);
      evmProvider.getAccounts.mockReturnValueOnce([nextEvmAccount]);
      evmProvider.getAccount.mockReturnValueOnce(nextEvmAccount);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const SOL_PROVIDER_ERROR = 'SOL create failed';
      solProvider.createAccounts.mockRejectedValueOnce(
        new Error(SOL_PROVIDER_ERROR),
      );

      await expect(
        wallet.createMultichainAccountGroup(nextIndex, {
          waitForAllProvidersToFinishCreatingAccounts: true,
        }),
      ).rejects.toThrow(
        `Unable to create multichain account group for index: ${nextIndex}:\n- Error: ${SOL_PROVIDER_ERROR}`,
      );

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('createNextMultichainAccountGroup', () => {
    it('creates the next multichain account group (with multiple providers)', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { wallet, providers } = setup({
        accounts: [
          [mockEvmAccount], // EVM provider.
          [mockSolAccount], // Solana provider.
        ],
      });

      const mockNextEvmAccount = MockAccountBuilder.from(mockEvmAccount)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const mockNextSolAccount = MockAccountBuilder.from(mockSolAccount)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .withUuid() // Required by KeyringClient.
        .get();

      // We need to mock every call made to the providers when creating an accounts:
      const [evmAccountProvider, solAccountProvider] = providers;
      for (const [mockAccountProvider, mockNextAccount] of [
        [evmAccountProvider, mockNextEvmAccount],
        [solAccountProvider, mockNextSolAccount],
      ] as const) {
        mockAccountProvider.createAccounts.mockResolvedValueOnce([
          mockNextAccount,
        ]);
        mockAccountProvider.getAccounts.mockReturnValueOnce([mockNextAccount]);
        mockAccountProvider.getAccount.mockReturnValueOnce(mockNextAccount);
      }

      const nextGroup = await wallet.createNextMultichainAccountGroup();
      expect(nextGroup.groupIndex).toBe(1);

      const internalAccounts = nextGroup.getAccounts();
      expect(internalAccounts).toHaveLength(2); // EVM + SOL.
      expect(internalAccounts[0].type).toBe(EthAccountType.Eoa);
      expect(internalAccounts[1].type).toBe(SolAccountType.DataAccount);
    });
  });

  describe('alignAccounts', () => {
    it('creates missing accounts only for providers with no accounts associated with a particular group index', async () => {
      const mockEvmAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockEvmAccount2 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const { wallet, providers, messenger } = setup({
        accounts: [[mockEvmAccount1, mockEvmAccount2], [mockSolAccount]],
      });

      const mockWalletStatusChange = jest
        .fn()
        // 1. Triggered when group alignment begins.
        .mockImplementationOnce((walletId, status) => {
          expect(walletId).toBe(wallet.id);
          expect(status).toBe('in-progress:alignment');
        })
        // 2. Triggered when group alignment ends.
        .mockImplementationOnce((walletId, status) => {
          expect(walletId).toBe(wallet.id);
          expect(status).toBe('ready');
        });

      messenger.subscribe(
        'MultichainAccountService:walletStatusChange',
        mockWalletStatusChange,
      );

      await wallet.alignAccounts();

      // EVM provider already has group 0 and 1; should not be called.
      expect(providers[0].createAccounts).not.toHaveBeenCalled();

      // Sol provider is missing group 1; should be called to create it.
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        entropySource: wallet.entropySource,
        groupIndex: 1,
      });
    });
  });

  describe('alignGroup', () => {
    it('aligns a specific multichain account group', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const { wallet, providers, messenger } = setup({
        accounts: [[mockEvmAccount], [mockSolAccount]],
      });

      const mockWalletStatusChange = jest
        .fn()
        // 1. Triggered when group alignment begins.
        .mockImplementationOnce((walletId, status) => {
          expect(walletId).toBe(wallet.id);
          expect(status).toBe('in-progress:alignment');
        })
        // 2. Triggered when group alignment ends.
        .mockImplementationOnce((walletId, status) => {
          expect(walletId).toBe(wallet.id);
          expect(status).toBe('ready');
        });

      messenger.subscribe(
        'MultichainAccountService:walletStatusChange',
        mockWalletStatusChange,
      );

      await wallet.alignAccountsOf(0);

      // EVM provider already has group 0; should not be called.
      expect(providers[0].createAccounts).not.toHaveBeenCalled();

      // Sol provider is missing group 0; should be called to create it.
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        entropySource: wallet.entropySource,
        groupIndex: 0,
      });

      expect(providers[1].createAccounts).not.toHaveBeenCalledWith({
        entropySource: wallet.entropySource,
        groupIndex: 1,
      });
    });
  });

  describe('discoverAccounts', () => {
    it('runs discovery', async () => {
      const { wallet, providers, messenger } = setup({
        accounts: [[], []],
      });

      providers[0].discoverAccounts
        .mockImplementationOnce(async () => [MOCK_HD_ACCOUNT_1])
        .mockImplementationOnce(async () => []);
      providers[1].discoverAccounts
        .mockImplementationOnce(async () => [MOCK_SOL_ACCOUNT_1])
        .mockImplementationOnce(async () => []);

      const mockWalletStatusChange = jest
        .fn()
        // 1. Triggered when group alignment begins.
        .mockImplementationOnce((walletId, status) => {
          expect(walletId).toBe(wallet.id);
          expect(status).toBe('in-progress:discovery');
        })
        // 2. Triggered when group alignment ends.
        .mockImplementationOnce((walletId, status) => {
          expect(walletId).toBe(wallet.id);
          expect(status).toBe('ready');
        });

      messenger.subscribe(
        'MultichainAccountService:walletStatusChange',
        mockWalletStatusChange,
      );

      await wallet.discoverAccounts();

      expect(providers[0].discoverAccounts).toHaveBeenCalledTimes(2);
      expect(providers[1].discoverAccounts).toHaveBeenCalledTimes(2);
    });

    it('fast-forwards lagging providers to the highest group index', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      providers[0].getName.mockImplementation(() => 'EVM');
      providers[1].getName.mockImplementation(() => 'Solana');

      // Fast provider: succeeds at indices 0,1 then stops at 2
      providers[0].discoverAccounts
        .mockImplementationOnce(() => Promise.resolve([{}]))
        .mockImplementationOnce(() => Promise.resolve([{}]))
        .mockImplementationOnce(() => Promise.resolve([]));

      // Slow provider: first call (index 0) resolves on a later tick, then it should be
      // rescheduled directly at index 2 (the max group index) and stop there
      providers[1].discoverAccounts
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve([{}]), 100)),
        )
        .mockImplementationOnce(() => Promise.resolve([]));

      // Avoid side-effects from alignment for this orchestrator behavior test
      jest.spyOn(wallet, 'alignAccounts').mockResolvedValue(undefined);

      jest.useFakeTimers();
      const discovery = wallet.discoverAccounts();
      // Allow fast provider microtasks to run and advance maxGroupIndex first
      await Promise.resolve(); // Mutex lock.
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await discovery;

      // Assert call order per provider shows skipping ahead
      const fastIndices = Array.from(
        providers[0].discoverAccounts.mock.calls,
      ).map((c) => Number(c[0].groupIndex));
      expect(fastIndices).toStrictEqual([0, 1, 2]);

      const slowIndices = Array.from(
        providers[1].discoverAccounts.mock.calls,
      ).map((c) => Number(c[0].groupIndex));
      expect(slowIndices).toStrictEqual([0, 2]);
    });

    it('stops scheduling a provider when it returns no accounts', async () => {
      const { wallet, providers } = setup({
        accounts: [[MOCK_HD_ACCOUNT_1], []],
      });

      providers[0].getName.mockImplementation(() => 'EVM');
      providers[1].getName.mockImplementation(() => 'Solana');

      // First provider finds one at 0 then stops at 1
      providers[0].discoverAccounts
        .mockImplementationOnce(() => Promise.resolve([{}]))
        .mockImplementationOnce(() => Promise.resolve([]));

      // Second provider stops immediately at 0
      providers[1].discoverAccounts.mockImplementationOnce(() =>
        Promise.resolve([]),
      );

      jest.spyOn(wallet, 'alignAccounts').mockResolvedValue(undefined);

      await wallet.discoverAccounts();

      expect(providers[0].discoverAccounts).toHaveBeenCalledTimes(2);
      expect(providers[1].discoverAccounts).toHaveBeenCalledTimes(1);
    });

    it('marks a provider stopped on error and does not reschedule it', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      providers[0].getName.mockImplementation(() => 'EVM');
      providers[1].getName.mockImplementation(() => 'Solana');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(wallet, 'alignAccounts').mockResolvedValue(undefined);

      // First provider throws on its first step
      providers[0].discoverAccounts.mockImplementationOnce(() =>
        Promise.reject(new Error('Failed to discover accounts')),
      );
      // Second provider stops immediately
      providers[1].discoverAccounts.mockImplementationOnce(() =>
        Promise.resolve([]),
      );

      await wallet.discoverAccounts();

      // Thrown provider should have been called once and not rescheduled
      expect(providers[0].discoverAccounts).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
      expect((consoleSpy.mock.calls[0][0] as Error).message).toBe(
        'Failed to discover accounts',
      );

      // Other provider proceeds normally
      expect(providers[1].discoverAccounts).toHaveBeenCalledTimes(1);
    });

    it('captures an error when a provider fails to discover its accounts', async () => {
      const { wallet, providers, messenger } = setup({
        accounts: [[], []],
      });
      const providerError = new Error('Unable to discover accounts');
      providers[0].discoverAccounts.mockRejectedValueOnce(providerError);
      const callSpy = jest.spyOn(messenger, 'call');
      // Ensure the other provider stops immediately to finish the Promise.all
      providers[1].discoverAccounts.mockResolvedValueOnce([]);
      await wallet.discoverAccounts();
      expect(callSpy).toHaveBeenCalledWith(
        'ErrorReportingService:captureException',
        new Error('Unable to discover accounts'),
      );
      expect(callSpy.mock.lastCall?.[1]).toHaveProperty('cause', providerError);
    });
  });
});
