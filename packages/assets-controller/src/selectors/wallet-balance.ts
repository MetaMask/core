import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { TraceCallback } from '@metamask/controller-utils';

import type { EnabledNetworkMap } from './balance';
import {
  getAccountIdsForGroup,
  getAggregatedBalanceForAccountIds,
} from './balance';
import type { AssetsControllerState } from '../AssetsController';

/**
 * Default user currency used when {@link AssetsControllerState.selectedCurrency}
 * is not set.
 */
const DEFAULT_USER_CURRENCY = 'usd';

export type AccountGroupBalance = {
  walletId: string;
  groupId: string;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type WalletBalance = {
  walletId: string;
  groups: Record<string, AccountGroupBalance>;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type AllWalletsBalance = {
  wallets: Record<string, WalletBalance>;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type BalanceChangePeriod = '1d' | '7d' | '30d';

export type BalanceChangeResult = {
  period: BalanceChangePeriod;
  currentTotalInUserCurrency: number;
  previousTotalInUserCurrency: number;
  amountChangeInUserCurrency: number;
  percentChange: number;
  userCurrency: string;
};

/**
 * Resolve the user currency for a balance calculation, falling back to a
 * sensible default when the controller has no selected currency.
 *
 * @param assetsControllerState - AssetsController state slice.
 * @returns The user currency code.
 */
function getUserCurrency(assetsControllerState: AssetsControllerState): string {
  return assetsControllerState.selectedCurrency ?? DEFAULT_USER_CURRENCY;
}

/**
 * Reconstruct the current and previous totals from the aggregated fiat balance
 * and its 1d price change.
 *
 * The AssetsController state only exposes a 1d price change, so non-`1d`
 * periods produce a zeroed change (current equals previous).
 *
 * @param totalBalanceInFiat - Aggregated current balance in user currency.
 * @param pricePercentChange1d - Weighted 1d price percentage change.
 * @param period - Period to compute the change for.
 * @returns The current and previous totals in user currency.
 */
function getCurrentAndPrevious(
  totalBalanceInFiat: number,
  pricePercentChange1d: number,
  period: BalanceChangePeriod,
): { current: number; previous: number } {
  const DEFAULT_VALUE = { current: 0, previous: 0 } as const;
  const percentRaw = period === '1d' ? pricePercentChange1d : 0;

  const denom = Number((1 + percentRaw / 100).toFixed(8));
  if (denom === 0) {
    return DEFAULT_VALUE;
  }

  const current = totalBalanceInFiat;
  const previous = current / denom;
  return { current, previous };
}

/**
 * Build a {@link BalanceChangeResult} from current/previous totals.
 *
 * @param current - Current total in user currency.
 * @param previous - Previous total in user currency.
 * @param period - Period the change was computed for.
 * @param userCurrency - User currency code.
 * @returns The change result with delta and percent change.
 */
function buildBalanceChangeResult(
  current: number,
  previous: number,
  period: BalanceChangePeriod,
  userCurrency: string,
): BalanceChangeResult {
  const amountChange = current - previous;
  const percentChange = previous === 0 ? 0 : (amountChange / previous) * 100;
  return {
    period,
    currentTotalInUserCurrency: Number(current.toFixed(8)),
    previousTotalInUserCurrency: Number(previous.toFixed(8)),
    amountChangeInUserCurrency: Number(amountChange.toFixed(8)),
    percentChange: Number(percentChange.toFixed(8)),
    userCurrency,
  };
}

/**
 * Calculate aggregated balances for all wallets and groups.
 *
 * Mirrors the legacy `@metamask/assets-controllers` `calculateBalanceForAllWallets`
 * output shape, but sources every group total from the unified AssetsController
 * state via {@link getAggregatedBalanceForAccountIds}. The account tree is walked
 * to aggregate each group individually.
 *
 * @param assetsControllerState - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state.
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace.
 * @param trace - Optional trace callback forwarded to the aggregation selector.
 * @returns Aggregated balances for all wallets and groups.
 */
export function calculateBalanceForAllWallets(
  assetsControllerState: AssetsControllerState,
  accountTreeState: AccountTreeControllerState,
  enabledNetworkMap?: EnabledNetworkMap,
  trace?: TraceCallback,
): AllWalletsBalance {
  const userCurrency = getUserCurrency(assetsControllerState);
  const wallets: AllWalletsBalance['wallets'] = {};
  let totalBalanceInUserCurrency = 0;

  type WalletWithGroups = { groups?: Record<string, unknown> };
  for (const [walletId, wallet] of Object.entries(
    accountTreeState.accountTree?.wallets ?? {},
  )) {
    const walletBalance: WalletBalance = {
      walletId,
      groups: {},
      totalBalanceInUserCurrency: 0,
      userCurrency,
    };

    const groups = (wallet as WalletWithGroups)?.groups ?? {};
    for (const groupId of Object.keys(groups)) {
      const accountIds = getAccountIdsForGroup(accountTreeState, groupId);
      const { totalBalanceInFiat = 0 } = getAggregatedBalanceForAccountIds(
        assetsControllerState,
        accountIds,
        enabledNetworkMap,
        trace,
      );

      walletBalance.groups[groupId] = {
        walletId,
        groupId,
        totalBalanceInUserCurrency: totalBalanceInFiat,
        userCurrency,
      };
      walletBalance.totalBalanceInUserCurrency += totalBalanceInFiat;
    }

    wallets[walletId] = walletBalance;
    totalBalanceInUserCurrency += walletBalance.totalBalanceInUserCurrency;
  }

  return { wallets, totalBalanceInUserCurrency, userCurrency };
}

/**
 * Calculate the portfolio value change for a single account group and period.
 *
 * @param assetsControllerState - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state.
 * @param groupId - Account group id to compute the change for.
 * @param period - Change period (`1d` | `7d` | `30d`).
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace.
 * @param trace - Optional trace callback forwarded to the aggregation selector.
 * @returns The change result for the requested period.
 */
export function calculateBalanceChangeForAccountGroup(
  assetsControllerState: AssetsControllerState,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
  period: BalanceChangePeriod,
  enabledNetworkMap?: EnabledNetworkMap,
  trace?: TraceCallback,
): BalanceChangeResult {
  const userCurrency = getUserCurrency(assetsControllerState);
  const accountIds = getAccountIdsForGroup(accountTreeState, groupId);
  const { totalBalanceInFiat = 0, pricePercentChange1d = 0 } =
    getAggregatedBalanceForAccountIds(
      assetsControllerState,
      accountIds,
      enabledNetworkMap,
      trace,
    );

  const { current, previous } = getCurrentAndPrevious(
    totalBalanceInFiat,
    pricePercentChange1d,
    period,
  );

  return buildBalanceChangeResult(current, previous, period, userCurrency);
}
