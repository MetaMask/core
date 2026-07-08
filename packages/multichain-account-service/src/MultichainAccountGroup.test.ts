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

  describe('status', () => {
    it('starts as uninitialized before init()', () => {
      const serviceMessenger =
        getMultichainAccountServiceMessenger(getRootMessenger());
      const providers = [
        setupBip44AccountProvider({
          name: 'Provider 1',
          accounts: [MOCK_WALLET_1_EVM_ACCOUNT],
        }),
      ];
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

      expect(group.status).toBe('uninitialized');
    });

    it('is aligned after init() when all providers have accounts', () => {
      const { group } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], [MOCK_WALLET_1_SOL_ACCOUNT]],
      });

      expect(group.status).toBe('aligned');
    });

    it('is misaligned after init() when a provider has no accounts', () => {
      const { group } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });

      expect(group.status).toBe('misaligned');
    });

    it('publishes groupStatusChange event when withState transitions to in-progress then settles', async () => {
      const { group, messenger: serviceMessenger } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });
      const publishSpy = jest.spyOn(serviceMessenger, 'publish');

      await group.withState('in-progress:alignment', async () => {
        expect(group.status).toBe('in-progress:alignment');
      });

      expect(group.status).toBe('misaligned');
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainAccountService:groupStatusChange',
        group.id,
        'in-progress:alignment',
      );
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainAccountService:groupStatusChange',
        group.id,
        'misaligned',
      );
    });

    it('preserves in-progress:create-accounts through an inner in-progress:alignment withState', async () => {
      const { group } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });
      const statusDuringInner: string[] = [];

      await group.withState('in-progress:create-accounts', async () => {
        // Inner withState with a different in-progress status should not override
        await group.withState('in-progress:alignment', async () => {
          statusDuringInner.push(group.status);
        });
        statusDuringInner.push(group.status);
      });

      // 'in-progress:create-accounts' is preserved through the inner call since
      // the guard skips the entry when already in any in-progress state.
      expect(statusDuringInner[0]).toBe('in-progress:create-accounts');
      // After both finally blocks fire, status is 'misaligned'.
      expect(group.status).toBe('misaligned');
    });

    it('auto-corrects status on update() when not in an in-progress state', () => {
      const { group, providers } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });
      expect(group.status).toBe('misaligned');

      // Simulate provider 2 now being considered aligned (e.g. disabled wrapper)
      providers[1].isAligned.mockReturnValue(true);
      group.update({
        'Provider 1': [MOCK_WALLET_1_EVM_ACCOUNT.id],
      });

      expect(group.status).toBe('aligned');
    });

    it('does not override in-progress status on update()', async () => {
      const { group, providers } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], []],
      });

      await group.withState('in-progress:alignment', async () => {
        // update() called inside withState should NOT change the status
        providers[1].isAligned.mockReturnValue(true);
        group.update({ 'Provider 1': [MOCK_WALLET_1_EVM_ACCOUNT.id] });
        expect(group.status).toBe('in-progress:alignment');
      });

      // After withState finalizes, status should reflect isAligned()
      expect(group.status).toBe('aligned');
    });
  });

  describe('isAligned', () => {
    it('returns true when every provider has at least one account in the group', () => {
      const { group } = setup({
        accounts: [[MOCK_WALLET_1_EVM_ACCOUNT], [MOCK_WALLET_1_SOL_ACCOUNT]],
      });

      expect(group.isAligned()).toBe(true);
    });

    it('returns false when at least one provider has no accounts in the group', () => {
      const { group } = setup({
        accounts: [
          [MOCK_WALLET_1_EVM_ACCOUNT],
          [], // second provider has no accounts for this group
        ],
      });

      expect(group.isAligned()).toBe(false);
    });

    it('returns true for a group with no providers', () => {
      const { group } = setup({ accounts: [] });

      expect(group.isAligned()).toBe(true);
    });

    it('returns true when a provider mock is configured to return true despite having no accounts (simulates disabled wrapper)', () => {
      const { group, providers } = setup({
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
