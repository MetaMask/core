import type { AccountTreeControllerState } from '@metamask/account-tree-controller';

import type { AssetsControllerState } from '../AssetsController';
import type { Caip19AssetId } from '../types';
import {
  calculateBalanceChangeForAccountGroup,
  calculateBalanceForAllWallets,
} from './wallet-balance';

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
        buildState({ selectedCurrency: 'eur' } as Partial<AssetsControllerState>),
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
      expect(result.amountChangeInUserCurrency).toBeCloseTo(4000 - 4000 / 1.1, 4);
      expect(result.percentChange).toBeCloseTo(10, 4);
      expect(result.userCurrency).toBe('usd');
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
