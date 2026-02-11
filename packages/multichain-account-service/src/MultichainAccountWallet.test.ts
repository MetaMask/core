import type { Bip44Account } from '@metamask/account-api';
import {
  AccountWalletType,
  toAccountGroupId,
  toDefaultAccountGroupId,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import {
  EthAccountType,
  SolAccountType,
  KeyringAccountEntropyTypeOption,
  AccountCreationType,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { WalletState } from './MultichainAccountWallet';
import { MultichainAccountWallet } from './MultichainAccountWallet';
import type { MockAccountProvider, RootMessenger } from './tests';
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
  setupBip44AccountProvider,
  getMultichainAccountServiceMessenger,
  getRootMessenger,
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
  const providersList =
    providers ??
    accounts.map((providerAccounts, i) => {
      return setupBip44AccountProvider({
        name: `Mocked Provider ${i}`,
        accounts: providerAccounts,
        index: i,
      });
    });

  const serviceMessenger = getMultichainAccountServiceMessenger(messenger);

  const wallet = new MultichainAccountWallet<Bip44Account<InternalAccount>>({
    entropySource,
    providers: providersList,
    messenger: serviceMessenger,
  });

  const walletState = accounts.reduce<WalletState>(
    (state, providerAccounts, idx) => {
      const providerName = providersList[idx].getName();
      for (const account of providerAccounts) {
        if (
          'options' in account &&
          account.options?.entropy?.type ===
            KeyringAccountEntropyTypeOption.Mnemonic
        ) {
          const groupIndexKey = account.options.entropy.groupIndex;
          state[groupIndexKey] ??= {};
          const groupState = state[groupIndexKey];
          groupState[providerName] ??= [];
          groupState[providerName].push(account.id);
        }
      }
      return state;
    },
    {},
  );

  wallet.init(walletState);

  return { wallet, providers: providersList, messenger: serviceMessenger };
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

  describe('createMultichainAccountGroup', () => {
    it('creates a multichain account group for a given index (waitForAllProvidersToFinishCreatingAccounts = false)', async () => {
      const groupIndex = 0;

      const { wallet, providers } = setup({
        accounts: [[], []], // 1 provider
      });

      const [evmProvider, solProvider] = providers;
      const mockNextEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(groupIndex)
        .get();
      // 1. Create the accounts for the new index and returns their IDs.
      evmProvider.createAccounts.mockResolvedValueOnce([mockNextEvmAccount]);
      // 2. When the wallet creates a new multichain account group, it will query
      // all accounts for this given index (so similar to the one we just created).
      evmProvider.getAccounts.mockReturnValueOnce([mockNextEvmAccount]);
      // 3. Required when we call `getAccounts` (below) on the multichain account.
      evmProvider.getAccount.mockReturnValueOnce(mockNextEvmAccount);

      solProvider.createAccounts.mockResolvedValueOnce([MOCK_SOL_ACCOUNT_1]);
      solProvider.getAccounts.mockReturnValueOnce([MOCK_SOL_ACCOUNT_1]);
      solProvider.getAccount.mockReturnValueOnce(MOCK_SOL_ACCOUNT_1);

      // By default, we are not waiting for all providers to finish creating accounts, so the group should be created
      // BUT we only have the guarantee to have EVM accounts in the group, as the SOL provider might still be creating
      // the account asynchronously.
      const specificGroup =
        await wallet.createMultichainAccountGroup(groupIndex);
      expect(specificGroup.groupIndex).toBe(groupIndex);

      const internalAccounts = specificGroup.getAccounts();
      expect(internalAccounts).toHaveLength(1);
      expect(internalAccounts[0].type).toBe(EthAccountType.Eoa);
    });

    it('returns the same reference when re-creating using the same index (waitForAllProvidersToFinishCreatingAccounts = false)', async () => {
      const { wallet } = setup({
        accounts: [[MOCK_HD_ACCOUNT_1]],
      });

      const group = wallet.getMultichainAccountGroup(0);
      const newGroup = await wallet.createMultichainAccountGroup(0);

      expect(newGroup).toBe(group);
    });

    it('fails to create an account beyond the next index (waitForAllProvidersToFinishCreatingAccounts = false)', async () => {
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

    it('does not create an account group if only some of the providers fail to create its account (waitForAllProvidersToFinishCreatingAccounts = true)', async () => {
      const groupIndex = 1;

      // Baseline accounts at index 0 for two providers
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount], [mockSolAccount]], // 2 providers
      });

      const [succeedingProvider, failingProvider] = providers;

      // Arrange: first provider fails, second succeeds creating one account at index 1
      failingProvider.createAccounts.mockRejectedValueOnce(
        new Error('Unable to create accounts'),
      );

      const mockNextEvmAccount = MockAccountBuilder.from(mockEvmAccount)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(groupIndex)
        .get();

      succeedingProvider.createAccounts.mockResolvedValueOnce([
        mockNextEvmAccount,
      ]);

      succeedingProvider.getAccounts.mockReturnValueOnce([mockNextEvmAccount]);
      succeedingProvider.getAccount.mockReturnValueOnce(mockNextEvmAccount);

      await expect(
        wallet.createMultichainAccountGroup(groupIndex, {
          waitForAllProvidersToFinishCreatingAccounts: true,
        }),
      ).rejects.toThrow('Unable to create accounts');
    });

    it('captures an error when a provider fails to create its account', async () => {
      const groupIndex = 1;
      const { wallet, providers, messenger } = setup({
        accounts: [[MOCK_HD_ACCOUNT_1]],
      });
      const [provider] = providers;
      const providerError = new Error('Unable to create accounts');
      provider.createAccounts.mockRejectedValueOnce(providerError);
      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      await expect(
        wallet.createMultichainAccountGroup(groupIndex),
      ).rejects.toThrow('Unable to create accounts');
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          'Unable to create some accounts with provider "Mocked Provider 0"',
        ),
      );
      expect(captureExceptionSpy.mock.lastCall[0]).toHaveProperty(
        'cause',
        providerError,
      );
    });

    it('aggregates non-EVM failures when waiting for all providers', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      const [succeedingProvider, failingProvider] = providers;

      succeedingProvider.createAccounts.mockResolvedValueOnce([
        MOCK_HD_ACCOUNT_1,
      ]);

      failingProvider.createAccounts.mockRejectedValueOnce(
        new Error('Unable to create accounts'),
      );

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      await wallet.createMultichainAccountGroup(0);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unable to create some accounts for group index 0 with provider "Mocked Provider 1". Error: Unable to create accounts',
      );
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
      expect(wallet.getAccountGroups()).toHaveLength(2);
    });
  });

  describe('createMultichainAccountGroups', () => {
    it('creates multiple groups from 0 to maxGroupIndex when no groups exist', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      const [evmProvider, solProvider] = providers;

      // Mock EVM provider to return accounts for groups 0, 1, 2.
      const evmAccounts = [
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(0)
          .get(),
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(1)
          .get(),
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(2)
          .get(),
      ];
      evmProvider.createAccounts.mockResolvedValueOnce(evmAccounts);

      // Mock SOL provider for each group.
      for (let i = 0; i <= 2; i++) {
        const solAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(i)
          .get();
        solProvider.createAccounts.mockResolvedValueOnce([solAccount]);
      }

      const groups = await wallet.createMultichainAccountGroups(2);

      expect(groups).toHaveLength(3);
      expect(groups[0].groupIndex).toBe(0);
      expect(groups[1].groupIndex).toBe(1);
      expect(groups[2].groupIndex).toBe(2);
      expect(wallet.getAccountGroups()).toHaveLength(3);
    });

    it('returns existing groups and creates new ones when some groups already exist', async () => {
      const mockEvmAccount0 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount0 = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount0], [mockSolAccount0]],
      });

      const [evmProvider, solProvider] = providers;

      // Mock EVM provider to return accounts for groups 1, 2 (group 0 already exists).
      const evmAccounts = [
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(1)
          .get(),
        MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(2)
          .get(),
      ];
      evmProvider.createAccounts.mockResolvedValueOnce(evmAccounts);

      // Mock SOL provider for groups 1 and 2.
      for (let i = 1; i <= 2; i++) {
        const solAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
          .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
          .withGroupIndex(i)
          .get();
        solProvider.createAccounts.mockResolvedValueOnce([solAccount]);
      }

      const groups = await wallet.createMultichainAccountGroups(2);

      expect(groups).toHaveLength(3);
      expect(groups[0].groupIndex).toBe(0); // Existing group.
      expect(groups[1].groupIndex).toBe(1); // New group.
      expect(groups[2].groupIndex).toBe(2); // New group.
      expect(wallet.getAccountGroups()).toHaveLength(3);
    });

    it('returns all existing groups when maxGroupIndex is less than nextGroupIndex', async () => {
      const mockEvmAccount0 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockEvmAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .get();
      const mockEvmAccount2 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(2)
        .get();

      const { wallet } = setup({
        accounts: [[mockEvmAccount0, mockEvmAccount1, mockEvmAccount2]],
      });

      // Request groups 0-1 when groups 0-2 exist.
      const groups = await wallet.createMultichainAccountGroups(1);

      expect(groups).toHaveLength(2);
      expect(groups[0].groupIndex).toBe(0);
      expect(groups[1].groupIndex).toBe(1);
      // Verify we didn't create any new groups.
      expect(wallet.getAccountGroups()).toHaveLength(3);
    });

    it('throws when maxGroupIndex is negative', async () => {
      const { wallet } = setup({
        accounts: [[]],
      });

      await expect(wallet.createMultichainAccountGroups(-1)).rejects.toThrow(
        'maxGroupIndex must be >= 0',
      );
    });

    it('captures an error with batch mode message when EVM provider fails', async () => {
      const { wallet, providers, messenger } = setup({
        accounts: [[]],
      });

      const [evmProvider] = providers;
      const providerError = new Error('EVM provider failed');
      evmProvider.createAccounts.mockRejectedValueOnce(providerError);

      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');

      await expect(wallet.createMultichainAccountGroups(2)).rejects.toThrow(
        'EVM provider failed',
      );

      expect(captureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          'Unable to create some accounts (batch) with provider "Mocked Provider 0"',
        ),
      );
      expect(captureExceptionSpy.mock.lastCall[0]).toHaveProperty(
        'cause',
        providerError,
      );
    });

    it('waits for all providers when waitForAllProvidersToFinishCreatingAccounts is true', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      const [evmProvider, solProvider] = providers;

      // Mock EVM provider.
      const evmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      evmProvider.createAccounts.mockResolvedValueOnce([evmAccount]);

      // Mock SOL provider.
      const solAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      solProvider.createAccounts.mockResolvedValueOnce([solAccount]);

      const groups = await wallet.createMultichainAccountGroups(0, {
        waitForAllProvidersToFinishCreatingAccounts: true,
      });

      expect(groups).toHaveLength(1);
      expect(groups[0].groupIndex).toBe(0);

      // Verify both providers were called.
      expect(evmProvider.createAccounts).toHaveBeenCalled();
      expect(solProvider.createAccounts).toHaveBeenCalled();
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

      // Sol provider is missing group 1; should be called to create it.
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndex,
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

      // Sol provider is missing group 0; should be called to create it.
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: wallet.entropySource,
        groupIndex: 0,
      });

      expect(providers[1].createAccounts).not.toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndex,
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
      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      // Ensure the other provider stops immediately to finish the Promise.all
      providers[1].discoverAccounts.mockResolvedValueOnce([]);
      await wallet.discoverAccounts();
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        new Error('Unable to discover accounts'),
      );
      expect(captureExceptionSpy.mock.lastCall[0]).toHaveProperty(
        'cause',
        providerError,
      );
    });
  });
});
