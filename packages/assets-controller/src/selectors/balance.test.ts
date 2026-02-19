import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountsById, EnabledNetworkMap } from './balance';
import {
  getAggregatedBalanceForAccount,
  getGroupIdForAccount,
  getInternalAccountsForGroup,
} from './balance';
import type { AssetsControllerState } from '../AssetsController';
import type { Caip19AssetId } from '../types';

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
      selectedAccountGroup: '',
    },
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
          selectedAccountGroup: '',
        },
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
          selectedAccountGroup: '',
        },
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
});
