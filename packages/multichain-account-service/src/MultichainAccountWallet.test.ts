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
import { TimeoutError } from './providers';
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
  mockCreateAccountsOnce,
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

async function waitForOtherProvidersToHaveBeenCalled(
  providers: MockAccountProvider[] = [],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const provider of providers) {
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 0);
    });
  }
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
        accounts: [[], []], // 2 providers: EVM + SOL
      });

      const [evmProvider, solProvider] = providers;
      const mockNextEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(groupIndex)
        .get();
      evmProvider.createAccounts.mockResolvedValueOnce([mockNextEvmAccount]);
      evmProvider.getAccounts.mockReturnValueOnce([mockNextEvmAccount]);
      evmProvider.getAccount.mockReturnValueOnce(mockNextEvmAccount);

      // By default (wait=false), only the EVM provider creates the group immediately.
      // Non-EVM account creation is deferred via fire-and-forget alignAccounts, which
      // uses the batch Bip44DeriveIndexRange API.
      const specificGroup =
        await wallet.createMultichainAccountGroup(groupIndex);
      expect(specificGroup.groupIndex).toBe(groupIndex);

      // EVM provider is called during group creation.
      expect(evmProvider.createAccounts).toHaveBeenCalled();

      // The fire-and-forget alignment acquires the lock as a microtask before the test
      // resumes, so by the time we reach here SOL has already been called with the batch API.
      expect(solProvider.createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: wallet.entropySource,
        range: { from: groupIndex, to: groupIndex },
      });
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
        `Bad group index, groupIndex (${groupIndex}) cannot be higher than the next available one (<= 1)`,
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

    it('does not capture exception when a provider times out creating accounts', async () => {
      const groupIndex = 1;
      const { wallet, providers, messenger } = setup({
        accounts: [[MOCK_HD_ACCOUNT_1]],
      });
      const [provider] = providers;
      provider.createAccounts.mockRejectedValueOnce(
        new TimeoutError('Timed out after: 500ms'),
      );
      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(
        wallet.createMultichainAccountGroup(groupIndex),
      ).rejects.toThrow('Timed out after: 500ms');
      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('defers non-EVM account creation to alignment after group creation (waitForAllProvidersToFinishCreatingAccounts = false)', async () => {
      const groupIndex = 1;

      const mockEvmAccount0 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockEvmAccount1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(groupIndex)
        .get();

      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount0], []], // EVM has group 0, SOL has none
      });

      const [evmProvider, solProvider] = providers;
      evmProvider.createAccounts.mockResolvedValueOnce([mockEvmAccount1]);
      evmProvider.getAccounts.mockReturnValueOnce([mockEvmAccount1]);
      evmProvider.getAccount.mockReturnValueOnce(mockEvmAccount1);

      await wallet.createMultichainAccountGroup(groupIndex);

      // Alignment fires as fire-and-forget, so wait for this.
      await waitForOtherProvidersToHaveBeenCalled([solProvider]);

      expect(solProvider.createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: wallet.entropySource,
        range: { from: groupIndex, to: groupIndex },
      });
    });
  });

  describe('createNextMultichainAccountGroup', () => {
    it('does not schedule alignment (uses all providers synchronously)', async () => {
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
        .withUuid()
        .get();

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

      const alignAccountsOfSpy = jest.spyOn(wallet, 'alignAccountsOf');
      const alignAccountsSpy = jest.spyOn(wallet, 'alignAccounts');

      await wallet.createNextMultichainAccountGroup();

      // createNextMultichainAccountGroup uses wait=true, so no alignment is scheduled.
      expect(alignAccountsOfSpy).not.toHaveBeenCalled();
      expect(alignAccountsSpy).not.toHaveBeenCalled();
    });

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
    it('creates multiple groups from 0 to maxGroupIndex when no groups exist (waitForAllProvidersToFinishCreatingAccounts = false)', async () => {
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

      // With wait=false (default), only the EVM provider creates accounts immediately.
      const groups = await wallet.createMultichainAccountGroups({ to: 2 });

      expect(groups).toHaveLength(3);
      expect(groups[0].groupIndex).toBe(0);
      expect(groups[1].groupIndex).toBe(1);
      expect(groups[2].groupIndex).toBe(2);
      expect(wallet.getAccountGroups()).toHaveLength(3);

      // EVM is called for creation; SOL is called by fire-and-forget alignment
      // covering the full batch range via the Bip44DeriveIndexRange API.
      expect(evmProvider.createAccounts).toHaveBeenCalled();

      // Alignment fires as fire-and-forget, so wait for this.
      await waitForOtherProvidersToHaveBeenCalled([solProvider]);

      expect(solProvider.createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: wallet.entropySource,
        range: { from: 0, to: 2 },
      });
    });

    it('returns existing groups and creates new ones when some groups already exist (waitForAllProvidersToFinishCreatingAccounts = false)', async () => {
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

      jest.spyOn(wallet, 'alignAccounts').mockResolvedValue(undefined);

      // With wait=false (default), only EVM accounts are created immediately.
      const groups = await wallet.createMultichainAccountGroups({ to: 2 });

      expect(groups).toHaveLength(3);
      expect(groups[0].groupIndex).toBe(0); // Existing group.
      expect(groups[1].groupIndex).toBe(1); // New group.
      expect(groups[2].groupIndex).toBe(2); // New group.
      expect(wallet.getAccountGroups()).toHaveLength(3);

      // SOL provider is not called during group creation; it's deferred to alignment.
      expect(solProvider.createAccounts).not.toHaveBeenCalled();
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

      jest.spyOn(wallet, 'alignAccounts').mockResolvedValue(undefined);

      // Request groups 0-1 when groups 0-2 exist.
      const groups = await wallet.createMultichainAccountGroups({ to: 1 });

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

      const badIndex = -1;
      await expect(
        wallet.createMultichainAccountGroups({ to: badIndex }),
      ).rejects.toThrow(`Bad range, to (${badIndex}) must be >= 0`);
    });

    it('captures an error with batch mode message when EVM provider fails', async () => {
      const { wallet, providers, messenger } = setup({
        accounts: [[]],
      });

      const [evmProvider] = providers;
      const providerError = new Error('EVM provider failed');
      evmProvider.createAccounts.mockRejectedValueOnce(providerError);

      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');

      await expect(
        wallet.createMultichainAccountGroups({ to: 2 }),
      ).rejects.toThrow('EVM provider failed');

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

    it('does not capture exception when a provider times out creating accounts in batch', async () => {
      const { wallet, providers, messenger } = setup({
        accounts: [[]],
      });

      const [evmProvider] = providers;
      evmProvider.createAccounts.mockRejectedValueOnce(
        new TimeoutError('Timed out after: 500ms'),
      );

      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        wallet.createMultichainAccountGroups({ to: 2 }),
      ).rejects.toThrow('Timed out after: 500ms');

      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('creates accounts for all providers synchronously when waitForAllProvidersToFinishCreatingAccounts is true', async () => {
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

      const alignAccountsSpy = jest.spyOn(wallet, 'alignAccounts');

      const groups = await wallet.createMultichainAccountGroups(
        { to: 0 },
        {
          waitForAllProvidersToFinishCreatingAccounts: true,
        },
      );

      expect(groups).toHaveLength(1);
      expect(groups[0].groupIndex).toBe(0);

      // Both providers are called synchronously; no alignment is scheduled.
      expect(evmProvider.createAccounts).toHaveBeenCalled();
      expect(solProvider.createAccounts).toHaveBeenCalled();
      expect(alignAccountsSpy).not.toHaveBeenCalled();
    });

    it('defers non-EVM account creation to alignment after group creation (waitForAllProvidersToFinishCreatingAccounts = false)', async () => {
      const { wallet, providers } = setup({
        accounts: [[], []],
      });

      const [evmProvider, solProvider] = providers;

      const evmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      evmProvider.createAccounts.mockResolvedValueOnce([evmAccount]);

      await wallet.createMultichainAccountGroups({ to: 0 });

      // Alignment fires as fire-and-forget, so wait for this.
      await waitForOtherProvidersToHaveBeenCalled([solProvider]);

      expect(solProvider.createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: wallet.entropySource,
        range: { from: 0, to: 0 },
      });
    });

    it('updates an existing group when created accounts overlap with it (gap scenario)', async () => {
      const account0 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const account2 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(2)
        .withUuid()
        .get();

      // Wallet with groups 0 and 2, gap at 1.
      const { wallet, providers } = setup({
        accounts: [[account0, account2]],
      });

      const [evmProvider] = providers;

      const account1 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(1)
        .withUuid()
        .get();
      const account2Updated = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(2)
        .withUuid()
        .get();
      // Provider returns accounts for both gap (1) and existing (2) indices.
      evmProvider.createAccounts.mockResolvedValueOnce([
        account1,
        account2Updated,
      ]);

      // Request range [0..2]: pre-loop pushes group 0, then creates [1..2].
      // Group 1 is new (created), group 2 already exists (updated — hits update branch).
      const groups = await wallet.createMultichainAccountGroups(
        { from: 0, to: 2 },
        { waitForAllProvidersToFinishCreatingAccounts: true },
      );

      expect(groups).toHaveLength(3); // group 0 (pre-loop) + group 1 (created) + group 2 (updated).
      expect(groups[0].groupIndex).toBe(0);
      expect(groups[1].groupIndex).toBe(1);
      expect(groups[2].groupIndex).toBe(2);
      // Group 2 was updated (not re-created), still exists.
      expect(wallet.getMultichainAccountGroup(2)).toBeDefined();
    });

    it('does not throw if a group cannot be created if it has no accounts', async () => {
      const { wallet, providers } = setup({
        accounts: [[]],
      });

      const [evmProvider] = providers;

      // Provider only returns an account for group 0, not group 1 in the range [0..1].
      const account0 = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      evmProvider.createAccounts.mockResolvedValueOnce([account0]);

      // Request range [0..1] BUT group 1 has no accounts.
      const groups = await wallet.createMultichainAccountGroups(
        { from: 0, to: 1 },
        { waitForAllProvidersToFinishCreatingAccounts: true },
      );

      expect(groups).toHaveLength(1);
      expect(groups[0].groupIndex).toBe(0);
      expect(wallet.getMultichainAccountGroup(1)).toBeUndefined();
    });

    it('logs an error to console when post-alignment fails unexpectedly', async () => {
      // Group 0 exists for EVM; SOL has no accounts yet (will be aligned).
      const { wallet, providers, messenger } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });

      const [, solProvider] = providers;

      // The Solana provider creates an account during alignment, which causes
      // group.update() to run and publish `:multichainAccountGroupUpdated`.
      solProvider.createAccounts.mockResolvedValueOnce([
        MOCK_WALLET_1_SOL_ACCOUNT,
      ]);

      const alignmentError = new Error('Unexpected alignment failure');

      // `:multichainAccountGroupUpdated` is published inside `group.update()`,
      // which is called from `#createOrUpdateMultichainAccountGroup` in
      // `#alignAccountsForRange` — outside `Promise.allSettled`. A throw here
      // escapes `#alignAccountsForRange` and `#withLock`, triggering the .catch()
      // on the fire-and-forget `alignOtherAccounts()` call.
      jest.spyOn(messenger, 'publish').mockImplementation((event, ..._args) => {
        if (
          event === 'MultichainAccountService:multichainAccountGroupUpdated'
        ) {
          throw alignmentError;
        }
      });

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const from = 0;
      const to = 2;
      await wallet.createMultichainAccountGroups({ from, to });

      // Wait for the fire-and-forget alignment to have run and failed.
      await waitForOtherProvidersToHaveBeenCalled([solProvider]);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unable to align non-EVM accounts from group index ${from} to ${to}`,
        alignmentError,
      );
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

      // Sol provider is missing group 1; should be called via the batch range API covering all groups.
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: wallet.entropySource,
        range: { from: 0, to: 1 },
      });
    });

    it('updates a group when a provider returns accounts during alignment', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();
      const mockSolAccount = MockAccountBuilder.from(MOCK_SOL_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .withUuid()
        .get();

      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount], []], // SOL provider has no accounts yet
      });

      // SOL provider returns an account for group 0 during alignment (also updates internal mock state)
      mockCreateAccountsOnce(providers[1], [mockSolAccount]);

      await wallet.alignAccounts();

      // The group should now include the newly aligned SOL account
      const group = wallet.getMultichainAccountGroup(0);
      expect(group).toBeDefined();
      expect(group?.getAccounts()).toContainEqual(
        expect.objectContaining({ id: mockSolAccount.id }),
      );
    });

    it('logs a warning and does not throw when a provider fails during alignment', async () => {
      const mockEvmAccount = MockAccountBuilder.from(MOCK_HD_ACCOUNT_1)
        .withEntropySource(MOCK_HD_KEYRING_1.metadata.id)
        .withGroupIndex(0)
        .get();

      const { wallet, providers } = setup({
        accounts: [[mockEvmAccount], []], // EVM + SOL
      });

      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      providers[1].createAccounts.mockRejectedValueOnce(
        new Error('alignment provider failed'),
      );

      // Should not throw; failures during alignment are best-effort
      expect(await wallet.alignAccounts()).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unable to align some accounts'),
      );
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

      // Sol provider is missing group 0; should be called via the batch range API for that group only.
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: wallet.entropySource,
        range: { from: 0, to: 0 },
      });

      expect(providers[1].createAccounts).not.toHaveBeenCalledWith({
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: wallet.entropySource,
        range: { from: 1, to: 1 },
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
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Error),
      );
      expect((consoleSpy.mock.calls[0][1] as Error).message).toBe(
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
        new Error(
          'Unable to discover accounts with provider "Mocked Provider 0"',
        ),
      );
      expect(captureExceptionSpy.mock.lastCall[0]).toHaveProperty(
        'cause',
        providerError,
      );
    });

    it('does not capture exception when a provider times out during account discovery', async () => {
      const { wallet, providers, messenger } = setup({
        accounts: [[], []],
      });
      providers[0].discoverAccounts.mockRejectedValueOnce(
        new TimeoutError('Timed out after: 500ms'),
      );
      const captureExceptionSpy = jest.spyOn(messenger, 'captureException');
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      providers[1].discoverAccounts.mockResolvedValueOnce([]);
      await wallet.discoverAccounts();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
