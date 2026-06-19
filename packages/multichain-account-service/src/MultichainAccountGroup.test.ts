import type { Bip44Account } from '@metamask/account-api';
import {
  AccountGroupType,
  isBip44Account,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { EthScope, SolScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { GroupState } from './MultichainAccountGroup';
import { MultichainAccountGroup } from './MultichainAccountGroup';
import { MultichainAccountWallet } from './MultichainAccountWallet';
import type { RootMessenger, MockAccountProvider } from './tests';
import {
  MOCK_SNAP_ACCOUNT_2,
  MOCK_WALLET_1_BTC_P2TR_ACCOUNT,
  MOCK_WALLET_1_BTC_P2WPKH_ACCOUNT,
  MOCK_WALLET_1_ENTROPY_SOURCE,
  MOCK_WALLET_1_EVM_ACCOUNT,
  MOCK_WALLET_1_SOL_ACCOUNT,
  setupBip44AccountProvider,
  getMultichainAccountServiceMessenger,
  getRootMessenger,
} from './tests';
import type { MultichainAccountServiceMessenger } from './types';

async function setup({
  groupIndex = 0,
  messenger = getRootMessenger(),
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
  groupIndex?: number;
  messenger?: RootMessenger;
  accounts?: InternalAccount[][];
} = {}): Promise<{
  wallet: MultichainAccountWallet<Bip44Account<InternalAccount>>;
  group: MultichainAccountGroup<Bip44Account<InternalAccount>>;
  providers: MockAccountProvider[];
  messenger: MultichainAccountServiceMessenger;
}> {
  const providers = accounts.map((providerAccounts, idx) => {
    return setupBip44AccountProvider({
      name: `Provider ${idx + 1}`,
      accounts: providerAccounts,
    });
  });

  const serviceMessenger = getMultichainAccountServiceMessenger(messenger);

  const wallet = new MultichainAccountWallet<Bip44Account<InternalAccount>>({
    entropySource: MOCK_WALLET_1_ENTROPY_SOURCE,
    messenger: serviceMessenger,
    providers,
  });

  const group = new MultichainAccountGroup({
    wallet,
    groupIndex,
    providers,
    messenger: serviceMessenger,
  });

  // Initialize group state from provided accounts so that constructor tests
  // observe accounts immediately
  const groupState = providers.reduce<GroupState>((state, provider, idx) => {
    const ids = accounts[idx].filter(isBip44Account).map((a) => a.id);
    if (ids.length > 0) {
      state[provider.getName()] = ids;
    }
    return state;
  }, {});

  await group.init(groupState);

  return { wallet, group, providers, messenger: serviceMessenger };
}

describe('MultichainAccountGroup', () => {
  describe('constructor', () => {
    it('constructs a multichain account group', async () => {
      const accounts = [
        [MOCK_WALLET_1_EVM_ACCOUNT],
        [MOCK_WALLET_1_SOL_ACCOUNT],
      ];
      const groupIndex = 0;
      const { wallet, group } = await setup({ groupIndex, accounts });

      const expectedWalletId = toMultichainAccountWalletId(
        wallet.entropySource,
      );
      const expectedAccounts = accounts.flat();

      expect(group.id).toStrictEqual(
        toMultichainAccountGroupId(expectedWalletId, groupIndex),
      );
      expect(group.type).toBe(AccountGroupType.MultichainAccount);
      expect(group.groupIndex).toBe(groupIndex);
      expect(group.wallet).toStrictEqual(wallet);
      expect(group.hasAccounts()).toBe(true);
      expect(group.getAccountIds()).toStrictEqual(
        expectedAccounts.map((a) => a.id),
      );
      expect(group.getAccounts()).toHaveLength(expectedAccounts.length);
      expect(group.getAccounts()).toStrictEqual(expectedAccounts);
    });

    it('constructs a multichain account group for a specific index', async () => {
      const groupIndex = 2;
      const { group } = await setup({ groupIndex });

      expect(group.groupIndex).toBe(groupIndex);
    });
  });

  describe('getAccount', () => {
    it('gets internal account from its id', async () => {
      const evmAccount = MOCK_WALLET_1_EVM_ACCOUNT;
      const solAccount = MOCK_WALLET_1_SOL_ACCOUNT;
      const { group } = await setup({ accounts: [[evmAccount], [solAccount]] });

      expect(group.getAccount(evmAccount.id)).toBe(evmAccount);
      expect(group.getAccount(solAccount.id)).toBe(solAccount);
    });

    it('returns undefined if the account ID does not belong to the multichain account group', async () => {
      const { group } = await setup();

      expect(group.getAccount('unknown-id')).toBeUndefined();
    });
  });

  describe('get', () => {
    it('gets one account using a selector', async () => {
      const { group } = await setup({ accounts: [[MOCK_WALLET_1_EVM_ACCOUNT]] });

      expect(group.get({ scopes: [EthScope.Mainnet] })).toBe(
        MOCK_WALLET_1_EVM_ACCOUNT,
      );
    });

    it('gets no account if selector did not match', async () => {
      const { group } = await setup({ accounts: [[MOCK_WALLET_1_EVM_ACCOUNT]] });

      expect(group.get({ scopes: [SolScope.Mainnet] })).toBeUndefined();
    });

    it('throws if too many accounts are matching selector', async () => {
      const { group } = await setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT, MOCK_WALLET_1_EVM_ACCOUNT]],
      });

      expect(() => group.get({ scopes: [EthScope.Mainnet] })).toThrow(
        'Too many account candidates, expected 1, got: 2',
      );
    });
  });

  describe('select', () => {
    it('selects accounts using a selector', async () => {
      const { group } = await setup();

      expect(group.select({ scopes: [EthScope.Mainnet] })).toStrictEqual([
        MOCK_WALLET_1_EVM_ACCOUNT,
      ]);
    });

    it('selects no account if selector did not match', async () => {
      const { group } = await setup({ accounts: [[MOCK_WALLET_1_EVM_ACCOUNT]] });

      expect(group.select({ scopes: [SolScope.Mainnet] })).toStrictEqual([]);
    });
  });

  describe('status', () => {
    it('is aligned when every provider has at least one account in the group', async () => {
      const { group } = await setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], [MOCK_WALLET_1_SOL_ACCOUNT]],
      });

      expect(group.status).toBe('aligned');
    });

    it('is missing-accounts when at least one provider has no accounts in the group', async () => {
      const { group } = await setup({
        accounts: [
          [MOCK_WALLET_1_EVM_ACCOUNT],
          [], // second provider has no accounts for this group
        ],
      });

      expect(group.status).toBe('missing-accounts');
    });

    it('does not publish a status change event during init', async () => {
      const messenger = getRootMessenger();
      const mockStatusChange = jest.fn();
      messenger.subscribe(
        'MultichainAccountService:multichainAccountGroupStatusChange',
        mockStatusChange,
      );

      await setup({ messenger });

      expect(mockStatusChange).not.toHaveBeenCalled();
    });

    it('publishes a status change event when update transitions the group to aligned', async () => {
      const messenger = getRootMessenger();
      const providers = [
        setupBip44AccountProvider({
          name: 'Provider 1',
          accounts: [MOCK_WALLET_1_EVM_ACCOUNT],
          index: 0,
        }),
        setupBip44AccountProvider({
          name: 'Provider 2',
          accounts: [MOCK_WALLET_1_SOL_ACCOUNT],
          index: 1,
        }),
      ];
      const serviceMessenger = getMultichainAccountServiceMessenger(messenger);
      const wallet = new MultichainAccountWallet({
        entropySource: MOCK_WALLET_1_ENTROPY_SOURCE,
        messenger: serviceMessenger,
        providers,
      });
      const group = new MultichainAccountGroup({
        wallet,
        groupIndex: 0,
        providers,
        messenger: serviceMessenger,
      });

      await group.init({
        [providers[0].getName()]: [MOCK_WALLET_1_EVM_ACCOUNT.id],
      });

      expect(group.status).toBe('missing-accounts');

      const mockStatusChange = jest.fn();
      serviceMessenger.subscribe(
        'MultichainAccountService:multichainAccountGroupStatusChange',
        mockStatusChange,
      );

      await group.update({
        [providers[0].getName()]: [MOCK_WALLET_1_EVM_ACCOUNT.id],
        [providers[1].getName()]: [MOCK_WALLET_1_SOL_ACCOUNT.id],
      });

      expect(group.status).toBe('aligned');
      expect(mockStatusChange).toHaveBeenCalledTimes(1);
      expect(mockStatusChange).toHaveBeenCalledWith(group.id, 'aligned');
    });

    it('does not publish a status change event when update does not change status', async () => {
      const { group, providers, messenger } = await setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], [MOCK_WALLET_1_SOL_ACCOUNT]],
      });

      const mockStatusChange = jest.fn();
      messenger.subscribe(
        'MultichainAccountService:multichainAccountGroupStatusChange',
        mockStatusChange,
      );

      await group.update({
        [providers[0].getName()]: [MOCK_WALLET_1_EVM_ACCOUNT.id],
        [providers[1].getName()]: [MOCK_WALLET_1_SOL_ACCOUNT.id],
      });

      expect(group.status).toBe('aligned');
      expect(mockStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('isAligned', () => {
    it('returns true when every provider has at least one account in the group', async () => {
      const { group } = await setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], [MOCK_WALLET_1_SOL_ACCOUNT]],
      });

      expect(group.isAligned()).toBe(true);
    });

    it('returns false when at least one provider has no accounts in the group', async () => {
      const { group } = await setup({
        accounts: [
          [MOCK_WALLET_1_EVM_ACCOUNT],
          [], // second provider has no accounts for this group
        ],
      });

      expect(group.isAligned()).toBe(false);
    });

    it('returns true for a group with no providers', async () => {
      const { group } = await setup({ accounts: [] });

      expect(group.isAligned()).toBe(true);
    });

    it('returns true when a provider mock is configured to return true despite having no accounts (simulates disabled wrapper)', async () => {
      const { group, providers } = await setup({
        accounts: [
          [MOCK_WALLET_1_EVM_ACCOUNT],
          [], // second provider has no accounts
        ],
      });
      // Simulate a disabled AccountProviderWrapper, which always returns true.
      providers[1].isAligned.mockReturnValue(true);

      expect(group.isAligned()).toBe(true);
    });
  });
});
