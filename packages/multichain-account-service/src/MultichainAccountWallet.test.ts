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
  setupAccountProvider,
  getMultichainAccountServiceMessenger,
  getRootMessenger,
} from './tests';

function setup({
  entropySource = MOCK_WALLET_1_ENTROPY_SOURCE,
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
  providers?: MockAccountProvider[];
  accounts?: InternalAccount[][];
} = {}): {
  wallet: MultichainAccountWallet<Bip44Account<InternalAccount>>;
  providers: MockAccountProvider[];
} {
  providers ??= accounts.map((providerAccounts) => {
    return setupAccountProvider({ accounts: providerAccounts });
  });

  const wallet = new MultichainAccountWallet<Bip44Account<InternalAccount>>({
    providers,
    entropySource,
    messenger: getMultichainAccountServiceMessenger(getRootMessenger()),
  });

  return { wallet, providers };
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
      const provider = setupAccountProvider({
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
      const provider = setupAccountProvider({
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
      const provider = setupAccountProvider({
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

    it('fails to create an account group if any of the provider fails to create its account', async () => {
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

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      await expect(
        wallet.createMultichainAccountGroup(groupIndex),
      ).rejects.toThrow(
        'Unable to create multichain account group for index: 1',
      );
      expect(consoleSpy).toHaveBeenCalled();
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

  describe('alignGroups', () => {
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
      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount1, mockEvmAccount2], [mockSolAccount]],
      });

      await wallet.alignGroups();

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
      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount], [mockSolAccount]],
      });

      await wallet.alignGroup(0);

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

  describe('getIsAlignmentInProgress', () => {
    it('returns false initially', () => {
      const { wallet } = setup();
      expect(wallet.getIsAlignmentInProgress()).toBe(false);
    });

    it('returns true during alignment and false after completion', async () => {
      const { wallet } = setup();

      // Start alignment (don't await yet)
      const alignmentPromise = wallet.alignGroups();

      // Check if alignment is in progress
      expect(wallet.getIsAlignmentInProgress()).toBe(true);

      // Wait for completion
      await alignmentPromise;

      // Should be false after completion
      expect(wallet.getIsAlignmentInProgress()).toBe(false);
    });
  });

  describe('concurrent alignment prevention', () => {
    it('prevents concurrent alignGroups calls', async () => {
      // Setup with EVM account in group 0, Sol account in group 1 (missing group 0)
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount], [mockSolAccount]],
      });

      // Make provider createAccounts slow to ensure concurrency
      providers[1].createAccounts.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );

      // Start first alignment
      const firstAlignment = wallet.alignGroups();

      // Start second alignment while first is still running
      const secondAlignment = wallet.alignGroups();

      // Both should complete without error
      await Promise.all([firstAlignment, secondAlignment]);

      // Provider should only be called once (not twice due to concurrency protection)
      expect(providers[1].createAccounts).toHaveBeenCalledTimes(1);
    });

    it('prevents concurrent alignGroup calls', async () => {
      // Setup with EVM account in group 0, Sol account in group 1 (missing group 0)
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount], [mockSolAccount]],
      });

      // Make provider createAccounts slow to ensure concurrency
      providers[1].createAccounts.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );

      // Start first alignment
      const firstAlignment = wallet.alignGroup(0);

      // Start second alignment while first is still running
      const secondAlignment = wallet.alignGroup(0);

      // Both should complete without error
      await Promise.all([firstAlignment, secondAlignment]);

      // Provider should only be called once (not twice due to concurrency protection)
      expect(providers[1].createAccounts).toHaveBeenCalledTimes(1);
    });
  });

  describe('discoverAndCreateAccounts', () => {
    it('fast-forwards lagging providers to the highest group index', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      providers[0].getName.mockImplementation(() => 'EVM');
      providers[1].getName.mockImplementation(() => 'Solana');

      // Fast provider: succeeds at indices 0,1 then stops at 2
      providers[0].discoverAndCreateAccounts
        .mockImplementationOnce(() => Promise.resolve([{}]))
        .mockImplementationOnce(() => Promise.resolve([{}]))
        .mockImplementationOnce(() => Promise.resolve([]));

      // Slow provider: first call (index 0) resolves on a later tick, then it should be
      // rescheduled directly at index 2 (the max group index) and stop there
      providers[1].discoverAndCreateAccounts
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve([{}]), 100)),
        )
        .mockImplementationOnce(() => Promise.resolve([]));

      // Avoid side-effects from alignment for this orchestrator behavior test
      jest.spyOn(wallet, 'alignGroups').mockResolvedValue(undefined);

      jest.useFakeTimers();
      const discovery = wallet.discoverAndCreateAccounts();
      // Allow fast provider microtasks to run and advance maxGroupIndex first
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await discovery;

      // Assert call order per provider shows skipping ahead
      const fastIndices = Array.from(
        providers[0].discoverAndCreateAccounts.mock.calls,
      ).map((c) => Number(c[0].groupIndex));
      expect(fastIndices).toStrictEqual([0, 1, 2]);

      const slowIndices = Array.from(
        providers[1].discoverAndCreateAccounts.mock.calls,
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
      providers[0].discoverAndCreateAccounts
        .mockImplementationOnce(() => Promise.resolve([{}]))
        .mockImplementationOnce(() => Promise.resolve([]));

      // Second provider stops immediately at 0
      providers[1].discoverAndCreateAccounts.mockImplementationOnce(() =>
        Promise.resolve([]),
      );

      jest.spyOn(wallet, 'alignGroups').mockResolvedValue(undefined);

      await wallet.discoverAndCreateAccounts();

      expect(providers[0].discoverAndCreateAccounts).toHaveBeenCalledTimes(2);
      expect(providers[1].discoverAndCreateAccounts).toHaveBeenCalledTimes(1);
    });

    it('marks a provider stopped on error and does not reschedule it', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      providers[0].getName.mockImplementation(() => 'EVM');
      providers[1].getName.mockImplementation(() => 'Solana');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(wallet, 'alignGroups').mockResolvedValue(undefined);

      // First provider throws on its first step
      providers[0].discoverAndCreateAccounts.mockImplementationOnce(() =>
        Promise.reject(new Error('Failed to discover accounts')),
      );
      // Second provider stops immediately
      providers[1].discoverAndCreateAccounts.mockImplementationOnce(() =>
        Promise.resolve([]),
      );

      await wallet.discoverAndCreateAccounts();

      // Thrown provider should have been called once and not rescheduled
      expect(providers[0].discoverAndCreateAccounts).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
      expect((consoleSpy.mock.calls[0][0] as Error).message).toBe(
        'Failed to discover accounts',
      );

      // Other provider proceeds normally
      expect(providers[1].discoverAndCreateAccounts).toHaveBeenCalledTimes(1);
    });
  });
});
