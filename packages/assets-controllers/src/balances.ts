import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Hex } from '@metamask/utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import {
  KnownCaipNamespace,
  parseCaipAssetType,
  parseCaipChainId,
  isStrictHexString,
} from '@metamask/utils';

import type { CurrencyRateState } from './CurrencyRateController';
import type { MultichainAssetsRatesControllerState } from './MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from './MultichainBalancesController';
import type { TokenBalancesControllerState } from './TokenBalancesController';
import type { TokenRatesControllerState } from './TokenRatesController';
import type { TokensControllerState } from './TokensController';

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

const evmRatePropertiesRecord = {
  '1d': 'pricePercentChange1d',
  '7d': 'pricePercentChange7d',
  '30d': 'pricePercentChange30d',
} as const;

const nonEvmRatePropertiesRecord = {
  '1d': 'P1D',
  '7d': 'P7D',
  '30d': 'P30D',
};

export type BalanceChangeResult = {
  period: BalanceChangePeriod;
  currentTotalInUserCurrency: number;
  previousTotalInUserCurrency: number;
  amountChangeInUserCurrency: number;
  percentChange: number;
  userCurrency: string;
};

const isChainEnabledByMap = (
  map: Record<string, Record<string, boolean>> | undefined,
  id: Hex | CaipChainId,
): boolean => {
  if (!map) {
    return true;
  }
  if (isStrictHexString(id)) {
    return Boolean(map[KnownCaipNamespace.Eip155]?.[id]);
  }
  const { namespace } = parseCaipChainId(id);
  return Boolean(map[namespace]?.[id]);
};

const getWalletIdFromGroupId = (groupId: string): AccountWalletId => {
  return groupId.split('/')[0] as AccountWalletId;
};

const getInternalAccountsForGroup = (
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  groupId: string,
): InternalAccount[] => {
  const walletId = getWalletIdFromGroupId(groupId);
  const wallet = accountTreeState.accountTree.wallets[walletId];
  if (!wallet) {
    return [];
  }
  const group = wallet.groups[groupId as AccountGroupId];
  if (!group) {
    return [];
  }
  return group.accounts
    .map(
      (accountId: string) => accountsState.internalAccounts.accounts[accountId],
    )
    .filter(Boolean);
};

const isNonNaNNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);

/**
 * Combined function that gets valid token balances with calculation data
 *
 * @param account - Internal account.
 * @param tokenBalancesState - Token balances state.
 * @param tokensState - Tokens state.
 * @param tokenRatesState - Token rates state.
 * @param currencyRateState - Currency rate state.
 * @param isEvmChainEnabled - Predicate to check EVM chain enablement.
 * @returns token calculation data
 */
function getEvmTokenBalances(
  account: InternalAccount,
  tokenBalancesState: TokenBalancesControllerState,
  tokensState: TokensControllerState,
  tokenRatesState: TokenRatesControllerState,
  currencyRateState: CurrencyRateState,
  isEvmChainEnabled: (chainId: Hex) => boolean,
) {
  const accountBalances =
    tokenBalancesState.tokenBalances[account.address as Hex] ?? {};

  return Object.entries(accountBalances)
    .filter(([chainId]) => isEvmChainEnabled(chainId as Hex))
    .flatMap(([chainId, chainBalances]) =>
      Object.entries(chainBalances).map(([tokenAddress, balance]) => ({
        chainId: chainId as Hex,
        tokenAddress: tokenAddress as Hex,
        balance,
      })),
    )
    .map((tokenBalance) => {
      const { chainId, tokenAddress, balance } = tokenBalance;

      // Get Token Info
      const accountTokens =
        tokensState?.allTokens?.[chainId]?.[account.address];
      const token = accountTokens?.find((t) => t.address === tokenAddress);
      if (!token) {
        return null;
      }

      // Get market data
      const tokenMarketData =
        tokenRatesState?.marketData?.[chainId]?.[tokenAddress];
      if (!tokenMarketData?.price) {
        return null;
      }

      // Get conversion rate
      const nativeToUserRate =
        currencyRateState.currencyRates[tokenMarketData.currency]
          ?.conversionRate;
      if (!nativeToUserRate) {
        return null;
      }

      // Calculate values
      const decimals = isNonNaNNumber(token.decimals) ? token.decimals : 18;
      const decimalBalance = parseInt(balance, 16);
      if (!isNonNaNNumber(decimalBalance)) {
        return null;
      }

      const userCurrencyValue =
        (decimalBalance / Math.pow(10, decimals)) *
        tokenMarketData.price *
        nativeToUserRate;

      return {
        userCurrencyValue,
        tokenMarketData, // Only needed for change calculations
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Combined function that gets valid non-EVM asset balances with calculation data
 *
 * @param account - Internal account.
 * @param multichainBalancesState - Multichain balances state.
 * @param multichainRatesState - Multichain rates state.
 * @param isAssetChainEnabled - Predicate to check asset chain enablement.
 * @returns token calculation data
 */
function getNonEvmAssetBalances(
  account: InternalAccount,
  multichainBalancesState: MultichainBalancesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  isAssetChainEnabled: (assetId: CaipAssetType) => boolean,
) {
  const accountBalances = multichainBalancesState.balances[account.id] ?? {};

  return Object.entries(accountBalances)
    .filter(([assetId]) => isAssetChainEnabled(assetId as CaipAssetType))
    .map(([assetId, balanceData]) => {
      const balanceAmount = parseFloat(balanceData.amount);
      if (Number.isNaN(balanceAmount)) {
        return null;
      }

      const conversionRate =
        multichainRatesState.conversionRates[assetId as CaipAssetType];
      if (!conversionRate) {
        return null;
      }

      const conversionRateValue = parseFloat(conversionRate.rate);
      if (Number.isNaN(conversionRateValue)) {
        return null;
      }

      const userCurrencyValue = balanceAmount * conversionRateValue;

      return {
        assetId: assetId as CaipAssetType,
        userCurrencyValue,
        conversionRate, // Only needed for change calculations
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Sum EVM account token balances in user currency.
 *
 * @param account - Internal account.
 * @param tokenBalancesState - Token balances state.
 * @param tokensState - Tokens state.
 * @param tokenRatesState - Token rates state.
 * @param currencyRateState - Currency rate state.
 * @param isEvmChainEnabled - Predicate to check EVM chain enablement.
 * @returns Total value in user currency.
 */
function sumEvmAccountBalanceInUserCurrency(
  account: InternalAccount,
  tokenBalancesState: TokenBalancesControllerState,
  tokensState: TokensControllerState,
  tokenRatesState: TokenRatesControllerState,
  currencyRateState: CurrencyRateState,
  isEvmChainEnabled: (chainId: Hex) => boolean,
): number {
  const tokenBalances = getEvmTokenBalances(
    account,
    tokenBalancesState,
    tokensState,
    tokenRatesState,
    currencyRateState,
    isEvmChainEnabled,
  );
  return tokenBalances.reduce((a, b) => a + b.userCurrencyValue, 0);
}

/**
 * Sum non‑EVM account balances in user currency from multichain sources.
 *
 * @param account - Internal account.
 * @param multichainBalancesState - Multichain balances state.
 * @param multichainRatesState - Multichain rates state.
 * @param isAssetChainEnabled - Predicate to check asset chain enablement.
 * @returns Total value in user currency.
 */
function sumNonEvmAccountBalanceInUserCurrency(
  account: InternalAccount,
  multichainBalancesState: MultichainBalancesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  isAssetChainEnabled: (assetId: CaipAssetType) => boolean,
): number {
  const assetBalances = getNonEvmAssetBalances(
    account,
    multichainBalancesState,
    multichainRatesState,
    isAssetChainEnabled,
  );

  return assetBalances.reduce((a, b) => a + b.userCurrencyValue, 0);
}

/**
 * Calculate balances for all wallets and groups.
 * Pure function – accepts controller states and returns aggregated totals.
 *
 * @param accountTreeState - AccountTreeController state
 * @param accountsState - AccountsController state
 * @param tokenBalancesState - TokenBalancesController state
 * @param tokenRatesState - TokenRatesController state
 * @param multichainRatesState - MultichainAssetsRatesController state
 * @param multichainBalancesState - MultichainBalancesController state
 * @param tokensState - TokensController state
 * @param currencyRateState - CurrencyRateController state
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace
 * @returns Aggregated balances for all wallets
 */
export function calculateBalanceForAllWallets(
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  tokenBalancesState: TokenBalancesControllerState,
  tokenRatesState: TokenRatesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  multichainBalancesState: MultichainBalancesControllerState,
  tokensState: TokensControllerState,
  currencyRateState: CurrencyRateState,
  enabledNetworkMap: Record<string, Record<string, boolean>> | undefined,
): AllWalletsBalance {
  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean =>
    isChainEnabledByMap(enabledNetworkMap, parseCaipAssetType(assetId).chainId);

  const getBalance = {
    evm: (account: InternalAccount) =>
      sumEvmAccountBalanceInUserCurrency(
        account,
        tokenBalancesState,
        tokensState,
        tokenRatesState,
        currencyRateState,
        isEvmChainEnabled,
      ),
    nonEvm: (account: InternalAccount) =>
      sumNonEvmAccountBalanceInUserCurrency(
        account,
        multichainBalancesState,
        multichainRatesState,
        isAssetChainEnabled,
      ),
  };

  const getFlatAccountBalances = () =>
    Object.entries(accountTreeState.accountTree.wallets ?? {})
      .flatMap(([walletId, wallet]) =>
        Object.keys(wallet?.groups || {}).flatMap((groupId) => {
          const accounts = getInternalAccountsForGroup(
            accountTreeState,
            accountsState,
            groupId,
          );

          return accounts.map((account) => ({
            walletId,
            groupId,
            account,
            isEvm: isEvmAccountType(account.type),
          }));
        }),
      )
      .map((flatAccount) => {
        const flatAccountWithBalance = flatAccount as typeof flatAccount & {
          balance: number;
        };
        flatAccountWithBalance.balance = flatAccount.isEvm
          ? getBalance.evm(flatAccount.account)
          : getBalance.nonEvm(flatAccount.account);
        return flatAccountWithBalance;
      });

  const getAggWalletBalance = (
    flatAccountBalances: ReturnType<typeof getFlatAccountBalances>,
  ): number => flatAccountBalances.reduce((a, b) => a + b.balance, 0);

  const getWalletBalances = (
    flatAccountBalances: ReturnType<typeof getFlatAccountBalances>,
  ): Record<string, WalletBalance> => {
    const wallets: Record<string, WalletBalance> = {};
    const defaultWalletBalance = (walletId: string): WalletBalance => ({
      walletId,
      groups: {},
      totalBalanceInUserCurrency: 0,
      userCurrency: currencyRateState.currentCurrency,
    });
    const defaultGroupBalance = (
      walletId: string,
      groupId: string,
    ): AccountGroupBalance => ({
      walletId,
      groupId,
      totalBalanceInUserCurrency: 0,
      userCurrency: currencyRateState.currentCurrency,
    });

    flatAccountBalances.forEach((flatAccount) => {
      const { walletId, groupId, balance } = flatAccount;
      wallets[walletId] ??= defaultWalletBalance(walletId);
      wallets[walletId].groups[groupId] ??= defaultGroupBalance(
        walletId,
        groupId,
      );
      wallets[walletId].groups[groupId].totalBalanceInUserCurrency += balance;
      wallets[walletId].totalBalanceInUserCurrency += balance;
    });

    // Ensure all groups (including empty ones) are represented
    Object.entries(accountTreeState.accountTree.wallets ?? {}).forEach(
      ([walletId, wallet]) => {
        if (!wallet) {
          return;
        }
        wallets[walletId] ??= defaultWalletBalance(walletId);
        Object.keys(wallet.groups || {}).forEach((groupId) => {
          wallets[walletId].groups[groupId] ??= defaultGroupBalance(
            walletId,
            groupId,
          );
        });
      },
    );

    return wallets;
  };

  const flatAccounts = getFlatAccountBalances();
  return {
    wallets: getWalletBalances(flatAccounts),
    totalBalanceInUserCurrency: getAggWalletBalance(flatAccounts),
    userCurrency: currencyRateState.currentCurrency,
  };
}

/**
 * Calculate aggregated portfolio value change for a given period (1d, 7d, 30d).
 * Logic mirrors extension/mobile historical aggregation:
 * - For each asset with available percent change for the requested period, compute current value in user currency.
 * - Reconstruct previous value by dividing current by (1 + percent/100).
 * - Sum across all assets, then compute amount change and percent change.
 *
 * @param accountTreeState - AccountTreeController state.
 * @param accountsState - AccountsController state.
 * @param tokenBalancesState - TokenBalancesController state.
 * @param tokenRatesState - TokenRatesController state.
 * @param multichainRatesState - MultichainAssetsRatesController state.
 * @param multichainBalancesState - MultichainBalancesController state.
 * @param tokensState - TokensController state.
 * @param currencyRateState - CurrencyRateController state.
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace.
 * @param period - Period to compute change for ('1d' | '7d' | '30d').
 * @returns Aggregated change details for the requested period.
 */
export function calculateBalanceChangeForAllWallets(
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  tokenBalancesState: TokenBalancesControllerState,
  tokenRatesState: TokenRatesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  multichainBalancesState: MultichainBalancesControllerState,
  tokensState: TokensControllerState,
  currencyRateState: CurrencyRateState,
  enabledNetworkMap: Record<string, Record<string, boolean>> | undefined,
  period: BalanceChangePeriod,
): BalanceChangeResult {
  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  const getAccountChange = {
    evm: (account: InternalAccount) =>
      sumEvmAccountChangeForPeriod(
        account,
        period,
        tokenBalancesState,
        tokensState,
        tokenRatesState,
        currencyRateState,
        isEvmChainEnabled,
      ),
    nonEvm: (account: InternalAccount) =>
      sumNonEvmAccountChangeForPeriod(
        account,
        period,
        multichainBalancesState,
        multichainRatesState,
        isAssetChainEnabled,
      ),
  };

  const getFlatAccountChanges = () =>
    Object.entries(accountTreeState.accountTree.wallets ?? {})
      .flatMap(([walletId, wallet]) =>
        Object.keys(wallet?.groups || {}).flatMap((groupId) => {
          const accounts = getInternalAccountsForGroup(
            accountTreeState,
            accountsState,
            groupId,
          );
          return accounts.map((account) => ({
            walletId,
            groupId,
            account,
            isEvm: isEvmAccountType(account.type),
          }));
        }),
      )
      .map((flatAccount) => {
        const flatAccountWithChange = flatAccount as typeof flatAccount & {
          current: number;
          previous: number;
        };

        const change = flatAccount.isEvm
          ? getAccountChange.evm(flatAccount.account)
          : getAccountChange.nonEvm(flatAccount.account);

        flatAccountWithChange.current = change.current;
        flatAccountWithChange.previous = change.previous;
        return flatAccountWithChange;
      });

  const getAggregatedTotals = (
    flatAccountChanges: ReturnType<typeof getFlatAccountChanges>,
  ) => {
    return flatAccountChanges.reduce(
      (totals, account) => {
        totals.current += account.current;
        totals.previous += account.previous;
        return totals;
      },
      { current: 0, previous: 0 },
    );
  };

  const flatAccountChanges = getFlatAccountChanges();
  const aggregatedTotals = getAggregatedTotals(flatAccountChanges);
  const amountChange = aggregatedTotals.current - aggregatedTotals.previous;
  const percentChange =
    aggregatedTotals.previous !== 0
      ? (amountChange / aggregatedTotals.previous) * 100
      : 0;

  return {
    period,
    currentTotalInUserCurrency: Number(aggregatedTotals.current.toFixed(8)),
    previousTotalInUserCurrency: Number(aggregatedTotals.previous.toFixed(8)),
    amountChangeInUserCurrency: Number(amountChange.toFixed(8)),
    percentChange: Number(percentChange.toFixed(8)),
    userCurrency: currencyRateState.currentCurrency,
  };
}

/**
 * Sum EVM account change for a period (current and previous totals).
 *
 * @param account - Internal account to aggregate.
 * @param period - Change period ('1d' | '7d' | '30d').
 * @param tokenBalancesState - Token balances controller state.
 * @param tokensState - Tokens controller state.
 * @param tokenRatesState - Token rates controller state.
 * @param currencyRateState - Currency rate controller state.
 * @param isEvmChainEnabled - Predicate that returns true if the EVM chain is enabled.
 * @returns Object with current and previous totals in user currency.
 */
function sumEvmAccountChangeForPeriod(
  account: InternalAccount,
  period: BalanceChangePeriod,
  tokenBalancesState: TokenBalancesControllerState,
  tokensState: TokensControllerState,
  tokenRatesState: TokenRatesControllerState,
  currencyRateState: CurrencyRateState,
  isEvmChainEnabled: (chainId: Hex) => boolean,
): { current: number; previous: number } {
  const tokenBalances = getEvmTokenBalances(
    account,
    tokenBalancesState,
    tokensState,
    tokenRatesState,
    currencyRateState,
    isEvmChainEnabled,
  );

  const tokenChanges = tokenBalances
    .map((token) => {
      const percentRaw = token.tokenMarketData[evmRatePropertiesRecord[period]];
      if (!isNonNaNNumber(percentRaw)) {
        return null;
      }

      const denom = Number((1 + percentRaw / 100).toFixed(8));
      if (denom === 0) {
        return null;
      }

      return {
        current: token.userCurrencyValue,
        previous: token.userCurrencyValue / denom,
      };
    })
    .filter((change): change is NonNullable<typeof change> => change !== null);

  return tokenChanges.reduce(
    (totals, change) => {
      totals.current += change.current;
      totals.previous += change.previous;
      return totals;
    },
    { current: 0, previous: 0 },
  );
}

/**
 * Sum non-EVM account change for a period (current and previous totals).
 *
 * @param account - Internal account to aggregate.
 * @param period - Change period ('1d' | '7d' | '30d').
 * @param multichainBalancesState - Multichain balances controller state.
 * @param multichainRatesState - Multichain assets rates controller state.
 * @param isAssetChainEnabled - Predicate that returns true if the asset's chain is enabled.
 * @returns Object with current and previous totals in user currency.
 */
function sumNonEvmAccountChangeForPeriod(
  account: InternalAccount,
  period: BalanceChangePeriod,
  multichainBalancesState: MultichainBalancesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  isAssetChainEnabled: (assetId: CaipAssetType) => boolean,
): { current: number; previous: number } {
  const assetBalances = getNonEvmAssetBalances(
    account,
    multichainBalancesState,
    multichainRatesState,
    isAssetChainEnabled,
  );

  const assetChanges = assetBalances
    .map((asset) => {
      const percentObj = (
        asset.conversionRate as unknown as {
          marketData?: { pricePercentChange?: Record<string, number> };
        }
      )?.marketData?.pricePercentChange;
      const percentRaw = percentObj?.[nonEvmRatePropertiesRecord[period]];

      if (!isNonNaNNumber(percentRaw)) {
        return null;
      }

      const denom = Number((1 + percentRaw / 100).toFixed(8));
      if (denom === 0) {
        return null;
      }

      return {
        current: asset.userCurrencyValue,
        previous: asset.userCurrencyValue / denom,
      };
    })
    .filter((change): change is NonNullable<typeof change> => change !== null);

  return assetChanges.reduce(
    (totals, change) => ({
      current: totals.current + change.current,
      previous: totals.previous + change.previous,
    }),
    { current: 0, previous: 0 },
  );
}

/**
 * Calculate portfolio value change for a specific account group and period.
 *
 * @param accountTreeState - AccountTreeController state.
 * @param accountsState - AccountsController state.
 * @param tokenBalancesState - TokenBalancesController state.
 * @param tokenRatesState - TokenRatesController state.
 * @param multichainRatesState - MultichainAssetsRatesController state.
 * @param multichainBalancesState - MultichainBalancesController state.
 * @param tokensState - TokensController state.
 * @param currencyRateState - CurrencyRateController state.
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace.
 * @param groupId - Account group ID to compute change for.
 * @param period - Change period ('1d' | '7d' | '30d').
 * @returns Change result including current, previous, delta, percent, and period.
 */
export function calculateBalanceChangeForAccountGroup(
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  tokenBalancesState: TokenBalancesControllerState,
  tokenRatesState: TokenRatesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  multichainBalancesState: MultichainBalancesControllerState,
  tokensState: TokensControllerState,
  currencyRateState: CurrencyRateState,
  enabledNetworkMap: Record<string, Record<string, boolean>> | undefined,
  groupId: string,
  period: BalanceChangePeriod,
): BalanceChangeResult {
  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  const getAccountChange = {
    evm: (account: InternalAccount) =>
      sumEvmAccountChangeForPeriod(
        account,
        period,
        tokenBalancesState,
        tokensState,
        tokenRatesState,
        currencyRateState,
        isEvmChainEnabled,
      ),
    nonEvm: (account: InternalAccount) =>
      sumNonEvmAccountChangeForPeriod(
        account,
        period,
        multichainBalancesState,
        multichainRatesState,
        isAssetChainEnabled,
      ),
  };

  const getFlatAccountChanges = () => {
    const accounts = getInternalAccountsForGroup(
      accountTreeState,
      accountsState,
      groupId,
    );
    return accounts.map((account) => ({
      account,
      isEvm: isEvmAccountType(account.type),
    }));
  };

  const getAggregatedTotals = (
    flatAccountChanges: ReturnType<typeof getFlatAccountChanges>,
  ) => {
    return flatAccountChanges.reduce(
      (totals, { account, isEvm }) => {
        const change = isEvm
          ? getAccountChange.evm(account)
          : getAccountChange.nonEvm(account);
        totals.current += change.current;
        totals.previous += change.previous;
        return totals;
      },
      { current: 0, previous: 0 },
    );
  };

  const flatAccountChanges = getFlatAccountChanges();
  const aggregatedTotals = getAggregatedTotals(flatAccountChanges);

  const amountChange = aggregatedTotals.current - aggregatedTotals.previous;
  const percentChange =
    aggregatedTotals.previous !== 0
      ? (amountChange / aggregatedTotals.previous) * 100
      : 0;

  return {
    period,
    currentTotalInUserCurrency: Number(aggregatedTotals.current.toFixed(8)),
    previousTotalInUserCurrency: Number(aggregatedTotals.previous.toFixed(8)),
    amountChangeInUserCurrency: Number(amountChange.toFixed(8)),
    percentChange: Number(percentChange.toFixed(8)),
    userCurrency: currencyRateState.currentCurrency,
  };
}
