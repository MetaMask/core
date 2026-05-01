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
  messenger?: RootMessenger;
  accounts?: InternalAccount[][];
} = {}): {
  wallet: MultichainAccountWallet<Bip44Account<InternalAccount>>;
  group: MultichainAccountGroup<Bip44Account<InternalAccount>>;
  providers: MockAccountProvider[];
  messenger: MultichainAccountServiceMessenger;
} {
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

  group.init(groupState);

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
});
