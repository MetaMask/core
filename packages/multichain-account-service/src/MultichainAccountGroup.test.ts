/* eslint-disable jsdoc/require-jsdoc */
import type { Bip44Account } from '@metamask/account-api';
import {
  AccountGroupType,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import type { Messenger } from '@metamask/base-controller';
import { EthScope, SolScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  type GroupState,
  MultichainAccountGroup,
} from './MultichainAccountGroup';
import { MultichainAccountWallet } from './MultichainAccountWallet';
import type { MockAccountProvider } from './tests';
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
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountServiceActions,
  MultichainAccountServiceEvents,
} from './types';

function setup({
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
  messenger?: Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >;
  accounts?: InternalAccount[][];
} = {}): {
  wallet: MultichainAccountWallet<Bip44Account<InternalAccount>>;
  group: MultichainAccountGroup<Bip44Account<InternalAccount>>;
  providers: MockAccountProvider[];
} {
  const providers = accounts.map((providerAccounts, idx) => {
    return setupBip44AccountProvider({
      name: `Provider ${idx + 1}`,
      accounts: providerAccounts,
    });
  });

  const wallet = new MultichainAccountWallet<Bip44Account<InternalAccount>>({
    entropySource: MOCK_WALLET_1_ENTROPY_SOURCE,
    messenger: getMultichainAccountServiceMessenger(messenger),
    providers,
  });

  const group = new MultichainAccountGroup({
    wallet,
    groupIndex,
    providers,
    messenger: getMultichainAccountServiceMessenger(messenger),
  });

  // Initialize group state from provided accounts so that constructor tests
  // observe accounts immediately
  const groupState = providers.reduce<GroupState>((state, provider, idx) => {
    const ids = accounts[idx]
      .filter((a) => 'options' in a && a.options?.entropy)
      .map((a) => a.id);
    if (ids.length > 0) {
      state[provider.getName()] = ids;
    }
    return state;
  }, {});

  group.init(groupState);

  return { wallet, group, providers };
}

describe('MultichainAccount', () => {
  describe('constructor', () => {
    it('constructs a multichain account group', async () => {
      const accounts = [
        [MOCK_WALLET_1_EVM_ACCOUNT],
        [MOCK_WALLET_1_SOL_ACCOUNT],
      ];
      const groupIndex = 0;
      const { wallet, group } = setup({ groupIndex, accounts });

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
      const { group } = setup({ groupIndex });

      expect(group.groupIndex).toBe(groupIndex);
    });
  });

  describe('getAccount', () => {
    it('gets internal account from its id', async () => {
      const evmAccount = MOCK_WALLET_1_EVM_ACCOUNT;
      const solAccount = MOCK_WALLET_1_SOL_ACCOUNT;
      const { group } = setup({ accounts: [[evmAccount], [solAccount]] });

      expect(group.getAccount(evmAccount.id)).toBe(evmAccount);
      expect(group.getAccount(solAccount.id)).toBe(solAccount);
    });

    it('returns undefined if the account ID does not belong to the multichain account group', async () => {
      const { group } = setup();

      expect(group.getAccount('unknown-id')).toBeUndefined();
    });
  });

  describe('get', () => {
    it('gets one account using a selector', () => {
      const { group } = setup({ accounts: [[MOCK_WALLET_1_EVM_ACCOUNT]] });

      expect(group.get({ scopes: [EthScope.Mainnet] })).toBe(
        MOCK_WALLET_1_EVM_ACCOUNT,
      );
    });

    it('gets no account if selector did not match', () => {
      const { group } = setup({ accounts: [[MOCK_WALLET_1_EVM_ACCOUNT]] });

      expect(group.get({ scopes: [SolScope.Mainnet] })).toBeUndefined();
    });

    it('throws if too many accounts are matching selector', () => {
      const { group } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT, MOCK_WALLET_1_EVM_ACCOUNT]],
      });

      expect(() => group.get({ scopes: [EthScope.Mainnet] })).toThrow(
        'Too many account candidates, expected 1, got: 2',
      );
    });
  });

  describe('select', () => {
    it('selects accounts using a selector', () => {
      const { group } = setup();

      expect(group.select({ scopes: [EthScope.Mainnet] })).toStrictEqual([
        MOCK_WALLET_1_EVM_ACCOUNT,
      ]);
    });

    it('selects no account if selector did not match', () => {
      const { group } = setup({ accounts: [[MOCK_WALLET_1_EVM_ACCOUNT]] });

      expect(group.select({ scopes: [SolScope.Mainnet] })).toStrictEqual([]);
    });
  });

  describe('alignAccounts', () => {
    it('creates missing accounts only for providers with no accounts', async () => {
      const groupIndex = 0;
      const { group, providers, wallet } = setup({
        groupIndex,
        accounts: [
          [MOCK_WALLET_1_EVM_ACCOUNT], // provider[0] already has group 0
          [], // provider[1] missing group 0
        ],
      });

      providers[1].createAccounts.mockResolvedValueOnce([
        MOCK_WALLET_1_SOL_ACCOUNT,
      ]);

      await group.alignAccounts();

      expect(providers[0].createAccounts).not.toHaveBeenCalled();
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        entropySource: wallet.entropySource,
        groupIndex,
      });
    });

    it('does nothing when already aligned', async () => {
      const groupIndex = 0;
      const { group, providers } = setup({
        groupIndex,
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], [MOCK_WALLET_1_SOL_ACCOUNT]],
      });

      await group.alignAccounts();

      expect(providers[0].createAccounts).not.toHaveBeenCalled();
      expect(providers[1].createAccounts).not.toHaveBeenCalled();
    });

    it('warns if alignment fails for a single provider', async () => {
      const groupIndex = 0;
      const { group, providers, wallet } = setup({
        groupIndex,
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      providers[1].createAccounts.mockRejectedValueOnce(
        new Error('Unable to create accounts'),
      );

      await group.alignAccounts();

      expect(providers[0].createAccounts).not.toHaveBeenCalled();
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        entropySource: wallet.entropySource,
        groupIndex,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        `Failed to fully align multichain account group for entropy ID: ${wallet.entropySource} and group index: ${groupIndex}, some accounts might be missing. Provider threw the following error:\n- Provider 2: Unable to create accounts`,
      );
    });

    it('warns if alignment fails for multiple providers', async () => {
      const groupIndex = 0;
      const { group, providers, wallet } = setup({
        groupIndex,
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], [], []],
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      providers[1].createAccounts.mockRejectedValueOnce(
        new Error('Unable to create accounts'),
      );

      providers[2].createAccounts.mockRejectedValueOnce(
        new Error('Unable to create accounts'),
      );

      await group.alignAccounts();

      expect(providers[0].createAccounts).not.toHaveBeenCalled();
      expect(providers[1].createAccounts).toHaveBeenCalledWith({
        entropySource: wallet.entropySource,
        groupIndex,
      });
      expect(providers[2].createAccounts).toHaveBeenCalledWith({
        entropySource: wallet.entropySource,
        groupIndex,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        `Failed to fully align multichain account group for entropy ID: ${wallet.entropySource} and group index: ${groupIndex}, some accounts might be missing. Providers threw the following errors:\n- Provider 2: Unable to create accounts\n- Provider 3: Unable to create accounts`,
      );
    });

    it('does not create accounts when a provider is disabled', async () => {
      const groupIndex = 0;
      const { group, providers } = setup({
        groupIndex,
        accounts: [[], []],
      });

      providers[1].setEnabled(false);
      await group.alignAccounts();

      expect(providers[0].createAccounts).toHaveBeenCalled();
      expect(providers[1].createAccounts).not.toHaveBeenCalled();
    });

    it('removes accounts from the group when a provider is disabled', async () => {
      const groupIndex = 0;
      const { group, providers } = setup({
        groupIndex,
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });

      providers[0].setEnabled(false);
      await group.alignAccounts();

      expect(providers[0].createAccounts).not.toHaveBeenCalled();
      expect(providers[1].createAccounts).toHaveBeenCalled();

      expect(group.getAccount(MOCK_WALLET_1_EVM_ACCOUNT.id)).toBeUndefined();
    });
  });
});
