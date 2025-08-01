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
  });

  return { wallet, providers };
}

describe('MultichainAccountWallet', () => {
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
      expect(multichainAccountGroup?.index).toBe(groupIndex);

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
      expect(specificGroup.index).toBe(groupIndex);

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
          mockNextAccount.id,
        ]);
        mockAccountProvider.getAccounts.mockReturnValueOnce([mockNextAccount]);
        mockAccountProvider.getAccount.mockReturnValueOnce(mockNextAccount);
      }

      const nextGroup = await wallet.createNextMultichainAccountGroup();
      expect(nextGroup.index).toBe(1);

      const internalAccounts = nextGroup.getAccounts();
      expect(internalAccounts).toHaveLength(2); // EVM + SOL.
      expect(internalAccounts[0].type).toBe(EthAccountType.Eoa);
      expect(internalAccounts[1].type).toBe(SolAccountType.DataAccount);
    });
  });
});
