import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerState } from '../AssetsController';
import type { Caip19AssetId } from '../types';
import type { AccountsById, EnabledNetworkMap } from './balance';
import {
  calculateBalanceChangeForAccountGroup,
  calculateBalanceForAllWallets,
  getAccountIdsForGroup,
  getAggregatedBalanceForAccount,
  getAggregatedBalanceForAccountIds,
  getGroupIdForAccount,
  getInternalAccountsForGroup,
} from './balance';

describe('balance selectors', () => {
  const accountId1 = 'account-id-1';
  const accountId2 = 'account-id-2';
  const groupId0 = 'entropy:wallet1/0';
  const groupId1 = 'entropy:wallet1/1';

  const selectedAccount: InternalAccount = {
    id: accountId1,
    address: '0x1111',
    type: 'eip155:eoa',
    options: {},
    metadata: {},
  } as InternalAccount;

  const account2: InternalAccount = {
    id: accountId2,
    address: '0x2222',
    type: 'eip155:eoa',
    options: {},
    metadata: {},
  } as InternalAccount;

  const accountTreeState = {
    accountTree: {
      wallets: {
        wallet1: {
          id: 'wallet1',
          type: 'entropy',
          status: 'active',
          groups: {
            [groupId0]: {
              id: groupId0,
              type: 'multichain',
              accounts: [accountId1, accountId2],
              metadata: { name: { value: 'Group 0' } },
            },
            [groupId1]: {
              id: groupId1,
              type: 'multichain',
              accounts: [accountId2],
              metadata: { name: { value: 'Group 1' } },
            },
          },
          metadata: {},
        },
      },
    },
    selectedAccountGroup: '',
    isAccountTreeSyncingInProgress: false,
    hasAccountTreeSyncingSyncedAtLeastOnce: true,
    accountGroupsMetadata: {},
    accountWalletsMetadata: {},
  } as unknown as AccountTreeControllerState;

  const accountsById: AccountsById = {
    [accountId1]: selectedAccount,
    [accountId2]: account2,
  };

  describe('getGroupIdForAccount', () => {
    it('returns groupId when account is in a group', () => {
      expect(getGroupIdForAccount(accountTreeState, accountId1)).toBe(groupId0);
      expect(getGroupIdForAccount(accountTreeState, accountId2)).toBe(groupId0);
    });

    it('returns undefined when account is not in tree', () => {
      expect(
        getGroupIdForAccount(accountTreeState, 'nonexistent-account-id'),
      ).toBeUndefined();
    });

    it('returns undefined when wallets is missing', () => {
      const emptyTree: AccountTreeControllerState = {
        ...accountTreeState,
        accountTree: {
          wallets: {},
        },
        selectedAccountGroup: '',
      };
      expect(getGroupIdForAccount(emptyTree, accountId1)).toBeUndefined();
    });

    it('returns undefined when accountTree is missing', () => {
      const noTree = {
        ...accountTreeState,
        accountTree:
          undefined as unknown as AccountTreeControllerState['accountTree'],
      };
      expect(
        getGroupIdForAccount(noTree as AccountTreeControllerState, accountId1),
      ).toBeUndefined();
    });
  });

  describe('getInternalAccountsForGroup', () => {
    it('returns InternalAccount[] when group exists and accountsById has them', () => {
      const result = getInternalAccountsForGroup(
        accountTreeState,
        accountsById,
        groupId0,
      );
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id)).toStrictEqual([accountId1, accountId2]);
    });

    it('returns empty array when groupId not found', () => {
      const result = getInternalAccountsForGroup(
        accountTreeState,
        accountsById,
        'nonexistent-group',
      );
      expect(result).toStrictEqual([]);
    });

    it('returns empty array when wallets is missing', () => {
      const emptyTree: AccountTreeControllerState = {
        ...accountTreeState,
        accountTree: {
          wallets: {},
        },
        selectedAccountGroup: '',
      };
      const result = getInternalAccountsForGroup(
        emptyTree,
        accountsById,
        groupId0,
      );
      expect(result).toStrictEqual([]);
    });

    it('filters out accounts missing from accountsById', () => {
      const partialAccountsById: AccountsById = {
        [accountId1]: selectedAccount,
      };
      const result = getInternalAccountsForGroup(
        accountTreeState,
        partialAccountsById,
        groupId0,
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(accountId1);
    });
  });

  describe('getAggregatedBalanceForAccount', () => {
    const assetEth = 'eip155:1/slip44:60' as Caip19AssetId;
    const assetUsdc =
      'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

    it('returns entries only when no assetsPrice', () => {
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: {
            [assetEth]: { amount: '1.5' },
            [assetUsdc]: { amount: '100' },
          },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
          [assetUsdc]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(state, selectedAccount);

      expect(result.entries).toHaveLength(2);
      expect(result.entries.map((entry) => entry.assetId).sort()).toStrictEqual(
        [assetEth, assetUsdc].sort(),
      );
      expect(
        result.entries.find((entry) => entry.assetId === assetEth),
      ).toMatchObject({
        amount: '1.5',
        symbol: 'ETH',
      });
      expect(result.totalBalanceInFiat).toBeUndefined();
      expect(result.pricePercentChange1d).toBeUndefined();
    });

    it('returns totalBalanceInFiat and pricePercentChange1d when assetsPrice present', () => {
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: {
            [assetEth]: { amount: '1' },
            [assetUsdc]: { amount: '1000' },
          },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
          [assetUsdc]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
        assetsPrice: {
          [assetEth]: {
            price: 2000,
            pricePercentChange1d: 2,
          } as AssetsControllerState['assetsPrice'][Caip19AssetId],
          [assetUsdc]: {
            price: 1,
            pricePercentChange1d: 0,
          } as AssetsControllerState['assetsPrice'][Caip19AssetId],
        },
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(state, selectedAccount);

      expect(result.entries).toHaveLength(2);
      expect(result.totalBalanceInFiat).toBe(2000 * 1 + 1 * 1000);
      expect(result.totalBalanceInFiat).toBe(3000);
      expect(result.pricePercentChange1d).toBeDefined();
      expect(result.pricePercentChange1d).toBeCloseTo(
        (2000 / 3000) * 2 + (1000 / 3000) * 0,
        10,
      );
    });

    it('excludes hidden assets', () => {
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: {
            [assetEth]: { amount: '1' },
            [assetUsdc]: { amount: '100' },
          },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
          [assetUsdc]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {
          [assetUsdc]: { hidden: true },
        },
      };

      const result = getAggregatedBalanceForAccount(state, selectedAccount);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].assetId).toBe(assetEth);
    });

    it('filters by enabledNetworkMap (eip155 hex keys)', () => {
      const enabledNetworkMap: EnabledNetworkMap = {
        eip155: {
          '0x1': true,
          '0x137': false,
        },
      };
      const assetPolygon = 'eip155:137/slip44:966' as Caip19AssetId;
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: {
            [assetEth]: { amount: '1' },
            [assetPolygon]: { amount: '10' },
          },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
          [assetPolygon]: {
            type: 'native',
            symbol: 'POL',
            name: 'Polygon',
            decimals: 18,
          },
        },
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(
        state,
        selectedAccount,
        enabledNetworkMap,
      );

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].assetId).toBe(assetEth);
    });

    it('aggregates multiple accounts when internalAccountsOrAccountIds is AccountId[]', () => {
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: { [assetEth]: { amount: '1' } },
          [accountId2]: { [assetEth]: { amount: '2' } },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
        },
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(
        state,
        selectedAccount,
        undefined,
        undefined,
        [accountId1, accountId2],
      );

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].assetId).toBe(assetEth);
      expect(result.entries[0].amount).toBe('3');
    });

    it('uses only selected account when no optional params', () => {
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: { [assetEth]: { amount: '1' } },
          [accountId2]: { [assetEth]: { amount: '99' } },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
        },
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(state, selectedAccount);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].amount).toBe('1');
    });

    it('uses group accounts when accountTreeState and accountsById provided', () => {
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: { [assetEth]: { amount: '1' } },
          [accountId2]: { [assetUsdc]: { amount: '500' } },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
          [assetUsdc]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(
        state,
        selectedAccount,
        undefined,
        accountTreeState,
        undefined,
        accountsById,
      );

      expect(result.entries).toHaveLength(2);
      const amounts = result.entries.map((entry) => entry.amount).sort();
      expect(amounts).toStrictEqual(['1', '500']);
    });

    it('returns empty entries when state has no balance for account', () => {
      const state: AssetsControllerState = {
        assetsBalance: {},
        assetsInfo: {},
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(state, selectedAccount);

      expect(result.entries).toStrictEqual([]);
      expect(result.totalBalanceInFiat).toBeUndefined();
      expect(result.pricePercentChange1d).toBeUndefined();
    });

    it('when enabledNetworkMap is undefined all chains are included', () => {
      const assetPolygon = 'eip155:137/slip44:966' as Caip19AssetId;
      const state: AssetsControllerState = {
        assetsBalance: {
          [accountId1]: {
            [assetEth]: { amount: '1' },
            [assetPolygon]: { amount: '10' },
          },
        },
        assetsInfo: {
          [assetEth]: {
            type: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
          },
          [assetPolygon]: {
            type: 'native',
            symbol: 'POL',
            name: 'Polygon',
            decimals: 18,
          },
        },
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      };

      const result = getAggregatedBalanceForAccount(state, selectedAccount);

      expect(result.entries).toHaveLength(2);
    });
  });

  describe('getAccountIdsForGroup', () => {
    it('returns account ids for an existing group', () => {
      expect(getAccountIdsForGroup(accountTreeState, groupId0)).toStrictEqual([
        accountId1,
        accountId2,
      ]);
      expect(getAccountIdsForGroup(accountTreeState, groupId1)).toStrictEqual([
        accountId2,
      ]);
    });

    it('returns a copy of the accounts array (not a reference)', () => {
      const result = getAccountIdsForGroup(accountTreeState, groupId0);
      result.push('mutated');
      expect(getAccountIdsForGroup(accountTreeState, groupId0)).toStrictEqual([
        accountId1,
        accountId2,
      ]);
    });

    it('returns empty array when group does not exist', () => {
      expect(
        getAccountIdsForGroup(accountTreeState, 'nonexistent-group'),
      ).toStrictEqual([]);
    });

    it('returns empty array when wallets are missing', () => {
      const emptyTree: AccountTreeControllerState = {
        ...accountTreeState,
        accountTree: { wallets: {} },
        selectedAccountGroup: '',
      };
      expect(getAccountIdsForGroup(emptyTree, groupId0)).toStrictEqual([]);
    });
  });

  describe('getAggregatedBalanceForAccountIds', () => {
    const assetEth = 'eip155:1/slip44:60' as Caip19AssetId;

    const state: AssetsControllerState = {
      assetsBalance: {
        [accountId1]: { [assetEth]: { amount: '1' } },
        [accountId2]: { [assetEth]: { amount: '2' } },
      },
      assetsInfo: {
        [assetEth]: {
          type: 'native',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
        },
      },
      assetsPrice: {},
      customAssets: {},
      assetPreferences: {},
    };

    it('aggregates balances across the provided account ids', () => {
      const result = getAggregatedBalanceForAccountIds(state, [
        accountId1,
        accountId2,
      ]);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].assetId).toBe(assetEth);
      expect(result.entries[0].amount).toBe('3');
    });

    it('aggregates a single account id', () => {
      const result = getAggregatedBalanceForAccountIds(state, [accountId1]);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].amount).toBe('1');
    });

    it('returns empty entries for an empty account id list', () => {
      const result = getAggregatedBalanceForAccountIds(state, []);

      expect(result.entries).toStrictEqual([]);
      expect(result.totalBalanceInFiat).toBeUndefined();
    });

    it('computes fiat totals when prices are present', () => {
      const pricedState: AssetsControllerState = {
        ...state,
        assetsPrice: {
          [assetEth]: {
            price: 2000,
            pricePercentChange1d: 5,
          } as AssetsControllerState['assetsPrice'][Caip19AssetId],
        },
      };

      const result = getAggregatedBalanceForAccountIds(pricedState, [
        accountId1,
        accountId2,
      ]);

      expect(result.totalBalanceInFiat).toBe(6000);
      expect(result.pricePercentChange1d).toBeCloseTo(5, 10);
      expect(result.previousTotalInFiat).toBeCloseTo(6000 / 1.05, 10);
    });
  });
});

describe('wallet-balance selectors', () => {
  const accountId1 = 'account-id-1';
  const accountId2 = 'account-id-2';
  const accountId3 = 'account-id-3';
  const groupId0 = 'entropy:wallet1/0';
  const groupId1 = 'entropy:wallet1/1';
  const groupId2 = 'entropy:wallet2/0';

  const assetEth = 'eip155:1/slip44:60' as Caip19AssetId;
  const assetUsdc =
    'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

  const accountTreeState = {
    accountTree: {
      wallets: {
        wallet1: {
          id: 'wallet1',
          groups: {
            [groupId0]: { id: groupId0, accounts: [accountId1, accountId2] },
            [groupId1]: { id: groupId1, accounts: [accountId3] },
          },
        },
        wallet2: {
          id: 'wallet2',
          groups: {
            [groupId2]: { id: groupId2, accounts: [] },
          },
        },
      },
    },
  } as unknown as AccountTreeControllerState;

  const buildState = (
    overrides?: Partial<AssetsControllerState>,
  ): AssetsControllerState =>
    ({
      assetsBalance: {
        [accountId1]: { [assetEth]: { amount: '1' } },
        [accountId2]: { [assetUsdc]: { amount: '1000' } },
        [accountId3]: { [assetEth]: { amount: '2' } },
      },
      assetsInfo: {
        [assetEth]: {
          type: 'native',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
        },
        [assetUsdc]: {
          type: 'erc20',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      },
      assetsPrice: {
        [assetEth]: {
          price: 2000,
          pricePercentChange1d: 10,
        },
        [assetUsdc]: {
          price: 1,
          pricePercentChange1d: 0,
        },
      },
      customAssets: {},
      assetPreferences: {},
      selectedCurrency: 'usd',
      ...overrides,
    }) as unknown as AssetsControllerState;

  describe('calculateBalanceForAllWallets', () => {
    it('aggregates totals per group, wallet, and overall', () => {
      const result = calculateBalanceForAllWallets(
        buildState(),
        accountTreeState,
      );

      // group0: 1 ETH * 2000 + 1000 USDC * 1 = 3000
      expect(
        result.wallets.wallet1.groups[groupId0].totalBalanceInUserCurrency,
      ).toBe(3000);
      // group1: 2 ETH * 2000 = 4000
      expect(
        result.wallets.wallet1.groups[groupId1].totalBalanceInUserCurrency,
      ).toBe(4000);
      // empty group => 0
      expect(
        result.wallets.wallet2.groups[groupId2].totalBalanceInUserCurrency,
      ).toBe(0);

      expect(result.wallets.wallet1.totalBalanceInUserCurrency).toBe(7000);
      expect(result.wallets.wallet2.totalBalanceInUserCurrency).toBe(0);
      expect(result.totalBalanceInUserCurrency).toBe(7000);
    });

    it('includes the user currency derived from selectedCurrency', () => {
      const result = calculateBalanceForAllWallets(
        buildState({
          selectedCurrency: 'eur',
        } as Partial<AssetsControllerState>),
        accountTreeState,
      );

      expect(result.userCurrency).toBe('eur');
      expect(result.wallets.wallet1.userCurrency).toBe('eur');
      expect(result.wallets.wallet1.groups[groupId0].userCurrency).toBe('eur');
    });

    it('falls back to usd when selectedCurrency is missing', () => {
      const state = buildState();
      delete (state as { selectedCurrency?: unknown }).selectedCurrency;

      const result = calculateBalanceForAllWallets(state, accountTreeState);

      expect(result.userCurrency).toBe('usd');
    });

    it('returns an empty result when there are no wallets', () => {
      const emptyTree = {
        accountTree: { wallets: {} },
      } as unknown as AccountTreeControllerState;

      const result = calculateBalanceForAllWallets(buildState(), emptyTree);

      expect(result.wallets).toStrictEqual({});
      expect(result.totalBalanceInUserCurrency).toBe(0);
    });

    it('forwards the enabled network map to filter balances', () => {
      const enabledNetworkMap = { eip155: { '0x1': false } };

      const result = calculateBalanceForAllWallets(
        buildState(),
        accountTreeState,
        enabledNetworkMap,
      );

      expect(result.totalBalanceInUserCurrency).toBe(0);
    });
  });

  describe('calculateBalanceChangeForAccountGroup', () => {
    it('derives current/previous/amount/percent from the 1d price change', () => {
      const result = calculateBalanceChangeForAccountGroup(
        buildState(),
        accountTreeState,
        groupId1,
        '1d',
      );

      // group1 current = 2 ETH * 2000 = 4000, 10% change => previous ~3636.36
      expect(result.period).toBe('1d');
      expect(result.currentTotalInUserCurrency).toBe(4000);
      expect(result.previousTotalInUserCurrency).toBeCloseTo(4000 / 1.1, 4);
      expect(result.amountChangeInUserCurrency).toBeCloseTo(
        4000 - 4000 / 1.1,
        4,
      );
      expect(result.percentChange).toBeCloseTo(10, 4);
      expect(result.userCurrency).toBe('usd');
    });

    it('sums each asset prior value from its own 1d change for mixed-asset groups', () => {
      // group0 holds 1 ETH (price 2000, +10%) and 1000 USDC (price 1, 0%).
      // current = 2000 + 1000 = 3000.
      // Correct previous (per asset) = 2000 / 1.1 + 1000 / 1 = 2818.1818...
      // A portfolio-weighted approach would instead use the blended 6.6667%
      // change (3000 / 1.066667 = 2812.5), which is materially different.
      const result = calculateBalanceChangeForAccountGroup(
        buildState(),
        accountTreeState,
        groupId0,
        '1d',
      );

      const expectedPrevious = 2000 / 1.1 + 1000;
      expect(result.currentTotalInUserCurrency).toBe(3000);
      expect(result.previousTotalInUserCurrency).toBeCloseTo(
        expectedPrevious,
        4,
      );
      expect(result.amountChangeInUserCurrency).toBeCloseTo(
        3000 - expectedPrevious,
        4,
      );
      expect(result.percentChange).toBeCloseTo(
        ((3000 - expectedPrevious) / expectedPrevious) * 100,
        4,
      );

      // Guard against regressing to the weighted-average reconstruction.
      expect(result.previousTotalInUserCurrency).not.toBeCloseTo(2812.5, 4);
    });

    it('returns a zeroed change for non-1d periods', () => {
      const result = calculateBalanceChangeForAccountGroup(
        buildState(),
        accountTreeState,
        groupId1,
        '30d',
      );

      expect(result.period).toBe('30d');
      expect(result.currentTotalInUserCurrency).toBe(4000);
      expect(result.previousTotalInUserCurrency).toBe(4000);
      expect(result.amountChangeInUserCurrency).toBe(0);
      expect(result.percentChange).toBe(0);
    });

    it('returns a zeroed change for an empty group', () => {
      const result = calculateBalanceChangeForAccountGroup(
        buildState(),
        accountTreeState,
        groupId2,
        '1d',
      );

      expect(result.currentTotalInUserCurrency).toBe(0);
      expect(result.previousTotalInUserCurrency).toBe(0);
      expect(result.amountChangeInUserCurrency).toBe(0);
      expect(result.percentChange).toBe(0);
    });

    it('returns a zeroed change for an unknown group', () => {
      const result = calculateBalanceChangeForAccountGroup(
        buildState(),
        accountTreeState,
        'nonexistent-group',
        '1d',
      );

      expect(result.currentTotalInUserCurrency).toBe(0);
      expect(result.previousTotalInUserCurrency).toBe(0);
    });
  });
});
