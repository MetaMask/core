import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountWalletObject } from '@metamask/account-tree-controller';
import type { AccountGroupObject } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Hex } from '@metamask/utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import {
  KnownCaipNamespace,
  parseCaipAssetType,
  parseCaipChainId,
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

export type PortfolioChangePeriod = '1d' | '7d' | '30d';

export type AggregatedChangeForAllWallets = {
  period: PortfolioChangePeriod;
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
  const isHex = typeof id === 'string' && id.startsWith('0x');
  if (isHex) {
    const evm = map[String(KnownCaipNamespace.Eip155)];
    return Boolean(evm?.[id as Hex]);
  }
  const { namespace } = parseCaipChainId(id as CaipChainId);
  return Boolean(map[namespace]?.[id as CaipChainId]);
};

const getInternalAccountsForGroup = (
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  groupId: string,
) => {
  const walletId = groupId.split('/')[0] as EntropySourceId;
  const wallet = (
    accountTreeState.accountTree.wallets as Record<string, AccountWalletObject>
  )[walletId];
  if (!wallet) {
    return [] as InternalAccount[];
  }
  const group = (wallet.groups as Record<string, AccountGroupObject>)[groupId];
  if (!group) {
    return [] as InternalAccount[];
  }
  return group.accounts
    .map(
      (accountId: string) => accountsState.internalAccounts.accounts[accountId],
    )
    .filter(Boolean) as InternalAccount[];
};

const isNonNaNNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);

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
  const walletBalances: Record<string, WalletBalance> = {};
  let totalBalanceInUserCurrency = 0;

  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  const walletIds = Object.keys(
    accountTreeState.accountTree.wallets,
  ) as string[];

  for (const walletId of walletIds) {
    const wallet = (
      accountTreeState.accountTree.wallets as Record<
        string,
        AccountWalletObject
      >
    )[walletId];
    if (!wallet) {
      continue;
    }

    const groupBalances: Record<string, AccountGroupBalance> = {};
    let walletTotalBalance = 0;

    const groups = Object.keys(wallet.groups || {}) as string[];
    for (const groupId of groups) {
      const accounts = getInternalAccountsForGroup(
        accountTreeState,
        accountsState,
        groupId,
      );

      if (accounts.length === 0) {
        groupBalances[groupId] = {
          walletId,
          groupId,
          totalBalanceInUserCurrency: 0,
          userCurrency: currencyRateState.currentCurrency,
        };
        continue;
      }

      let groupTotalBalance = 0;

      for (const account of accounts) {
        const isEvmAccount = isEvmAccountType(account.type);
        if (isEvmAccount) {
          const accountBalances =
            tokenBalancesState.tokenBalances[account.address as Hex];
          if (accountBalances) {
            for (const [chainId, chainBalances] of Object.entries(
              accountBalances,
            )) {
              if (!isEvmChainEnabled(chainId as Hex)) {
                continue;
              }
              for (const [tokenAddress, balance] of Object.entries(
                chainBalances,
              )) {
                const chainTokens = tokensState.allTokens[chainId as Hex];
                const accountTokens = chainTokens?.[account.address];
                const token = accountTokens?.find(
                  (t) => t.address === tokenAddress,
                );
                if (!token) {
                  continue;
                }
                const decimals =
                  typeof token.decimals === 'number' &&
                  !Number.isNaN(token.decimals)
                    ? token.decimals
                    : 18;
                const balanceInSmallestUnit = parseInt(balance as string, 16);
                if (Number.isNaN(balanceInSmallestUnit)) {
                  continue;
                }
                const balanceInTokenUnits =
                  balanceInSmallestUnit / Math.pow(10, decimals);
                const chainMarketData =
                  tokenRatesState.marketData[chainId as Hex];
                const tokenMarketData = chainMarketData?.[tokenAddress as Hex];
                if (tokenMarketData?.price) {
                  const nativeCurrency = tokenMarketData.currency;
                  const nativeToUserRate =
                    currencyRateState.currencyRates[nativeCurrency]
                      ?.conversionRate;
                  if (nativeToUserRate) {
                    const tokenPriceInUserCurrency =
                      tokenMarketData.price * nativeToUserRate;
                    const balanceInUserCurrency =
                      balanceInTokenUnits * tokenPriceInUserCurrency;
                    groupTotalBalance += balanceInUserCurrency;
                  }
                }
              }
            }
          }
        } else {
          const accountBalances = multichainBalancesState.balances[account.id];
          if (accountBalances) {
            for (const [assetId, balanceData] of Object.entries(
              accountBalances,
            )) {
              if (!isAssetChainEnabled(assetId as CaipAssetType)) {
                continue;
              }
              const balanceAmount = parseFloat(balanceData.amount);
              if (Number.isNaN(balanceAmount)) {
                continue;
              }
              const conversionRate =
                multichainRatesState.conversionRates[assetId as CaipAssetType];
              if (conversionRate) {
                const conversionRateValue = parseFloat(conversionRate.rate);
                if (Number.isNaN(conversionRateValue)) {
                  continue;
                }
                const balanceInUserCurrency =
                  balanceAmount * conversionRateValue;
                groupTotalBalance += balanceInUserCurrency;
              }
            }
          }
        }
      }

      groupBalances[groupId] = {
        walletId,
        groupId,
        totalBalanceInUserCurrency: groupTotalBalance,
        userCurrency: currencyRateState.currentCurrency,
      };
      walletTotalBalance += groupTotalBalance;
    }

    walletBalances[walletId] = {
      walletId,
      groups: groupBalances,
      totalBalanceInUserCurrency: walletTotalBalance,
      userCurrency: currencyRateState.currentCurrency,
    };
    totalBalanceInUserCurrency += walletTotalBalance;
  }

  return {
    wallets: walletBalances,
    totalBalanceInUserCurrency,
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
export function calculateAggregatedChangeForAllWallets(
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  tokenBalancesState: TokenBalancesControllerState,
  tokenRatesState: TokenRatesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  multichainBalancesState: MultichainBalancesControllerState,
  tokensState: TokensControllerState,
  currencyRateState: CurrencyRateState,
  enabledNetworkMap: Record<string, Record<string, boolean>> | undefined,
  period: PortfolioChangePeriod,
): AggregatedChangeForAllWallets {
  let currentTotal = 0;
  let previousTotal = 0;

  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  const evmPercentField: Record<
    PortfolioChangePeriod,
    keyof ReturnType<() => never> | string
  > = {
    '1d': 'pricePercentChange1d',
    '7d': 'pricePercentChange7d',
    '30d': 'pricePercentChange30d',
  };

  const nonEvmPercentKey: Record<PortfolioChangePeriod, string> = {
    '1d': 'P1D',
    '7d': 'P7D',
    '30d': 'P30D',
  };

  const walletIds = Object.keys(
    accountTreeState.accountTree.wallets,
  ) as string[];

  for (const walletId of walletIds) {
    const wallet = (
      accountTreeState.accountTree.wallets as Record<
        string,
        AccountWalletObject
      >
    )[walletId];
    if (!wallet) {
      continue;
    }

    const groups = Object.keys(wallet.groups || {}) as string[];
    for (const groupId of groups) {
      const accounts = getInternalAccountsForGroup(
        accountTreeState,
        accountsState,
        groupId,
      );

      for (const account of accounts) {
        const isEvmAccount = isEvmAccountType(account.type);

        if (isEvmAccount) {
          const accountBalances =
            tokenBalancesState.tokenBalances[account.address as Hex];
          if (!accountBalances) {
            continue;
          }

          for (const [chainId, chainBalances] of Object.entries(
            accountBalances,
          )) {
            if (!isEvmChainEnabled(chainId as Hex)) {
              continue;
            }
            const chainMarketData = tokenRatesState.marketData[chainId as Hex];

            for (const [tokenAddress, balance] of Object.entries(
              chainBalances,
            )) {
              const chainTokens = tokensState.allTokens[chainId as Hex];
              const accountTokens = chainTokens?.[account.address];
              const token = accountTokens?.find(
                (t) => t.address === tokenAddress,
              );
              if (!token) {
                continue;
              }

              const decimals =
                typeof token.decimals === 'number' &&
                !Number.isNaN(token.decimals)
                  ? token.decimals
                  : 18;

              const balanceInSmallestUnit = parseInt(balance as string, 16);
              if (Number.isNaN(balanceInSmallestUnit)) {
                continue;
              }

              const balanceInTokenUnits =
                balanceInSmallestUnit / Math.pow(10, decimals);

              const tokenMarketData = chainMarketData?.[tokenAddress as Hex];
              const price = tokenMarketData?.price as number | undefined;
              const percentRaw = (
                tokenMarketData as unknown as Record<string, unknown>
              )?.[evmPercentField[period] as string] as number | undefined;

              if (typeof price !== 'number' || Number.isNaN(price)) {
                continue;
              }

              const nativeCurrency = (
                tokenMarketData as unknown as { currency?: string }
              )?.currency;
              const nativeToUserRate =
                nativeCurrency &&
                currencyRateState.currencyRates[nativeCurrency]
                  ? currencyRateState.currencyRates[nativeCurrency]
                      ?.conversionRate
                  : undefined;

              if (
                typeof nativeToUserRate !== 'number' ||
                Number.isNaN(nativeToUserRate)
              ) {
                continue;
              }

              if (!isNonNaNNumber(percentRaw)) {
                continue;
              }

              const priceInUserCurrency = price * nativeToUserRate;
              const currentValue = balanceInTokenUnits * priceInUserCurrency;
              const denom = Number((1 + percentRaw / 100).toFixed(8));
              if (denom === 0) {
                continue;
              }
              const previousValue = currentValue / denom;
              currentTotal += currentValue;
              previousTotal += previousValue;
            }
          }
        } else {
          const accountBalances = multichainBalancesState.balances[account.id];
          if (!accountBalances) {
            continue;
          }

          for (const [assetId, balanceData] of Object.entries(
            accountBalances,
          )) {
            if (!isAssetChainEnabled(assetId as CaipAssetType)) {
              continue;
            }

            const balanceAmount = parseFloat(balanceData.amount);
            if (Number.isNaN(balanceAmount)) {
              continue;
            }

            const conversionRate =
              multichainRatesState.conversionRates[assetId as CaipAssetType];
            const rateStr = conversionRate?.rate as string | undefined;
            const percentObj = (
              conversionRate as unknown as {
                marketData?: { pricePercentChange?: Record<string, number> };
              }
            )?.marketData?.pricePercentChange;
            const percentRaw = percentObj?.[nonEvmPercentKey[period]];

            const rate =
              typeof rateStr === 'string' ? parseFloat(rateStr) : undefined;
            if (!isNonNaNNumber(rate) || !isNonNaNNumber(percentRaw)) {
              continue;
            }

            const currentValue = balanceAmount * rate;
            const denom = Number((1 + percentRaw / 100).toFixed(8));
            if (denom === 0) {
              continue;
            }
            const previousValue = currentValue / denom;
            currentTotal += currentValue;
            previousTotal += previousValue;
          }
        }
      }
    }
  }

  const amountChange = currentTotal - previousTotal;
  const percentChange =
    previousTotal !== 0 ? (amountChange / previousTotal) * 100 : 0;

  return {
    period,
    currentTotalInUserCurrency: Number(currentTotal.toFixed(8)),
    previousTotalInUserCurrency: Number(previousTotal.toFixed(8)),
    amountChangeInUserCurrency: Number(amountChange.toFixed(8)),
    percentChange: Number(percentChange.toFixed(8)),
    userCurrency: currencyRateState.currentCurrency,
  };
}

/**
 * Calculate aggregated portfolio value change for a specific account group and period.
 * Mirrors the logic of calculateAggregatedChangeForAllWallets but scoped to one group.
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
 * @param groupId - The account group ID to compute change for.
 * @param period - Period to compute change for ('1d' | '7d' | '30d').
 * @returns Aggregated change details for the requested group and period.
 */
export function calculateAggregatedChangeForGroup(
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
  period: PortfolioChangePeriod,
): AggregatedChangeForAllWallets {
  let currentTotal = 0;
  let previousTotal = 0;

  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  const evmPercentField: Record<PortfolioChangePeriod, string> = {
    '1d': 'pricePercentChange1d',
    '7d': 'pricePercentChange7d',
    '30d': 'pricePercentChange30d',
  };

  const nonEvmPercentKey: Record<PortfolioChangePeriod, string> = {
    '1d': 'P1D',
    '7d': 'P7D',
    '30d': 'P30D',
  };

  const accounts = getInternalAccountsForGroup(
    accountTreeState,
    accountsState,
    groupId,
  );

  for (const account of accounts) {
    const isEvmAccount = isEvmAccountType(account.type);

    if (isEvmAccount) {
      const accountBalances =
        tokenBalancesState.tokenBalances[account.address as Hex];
      if (!accountBalances) {
        continue;
      }

      for (const [chainId, chainBalances] of Object.entries(accountBalances)) {
        if (!isEvmChainEnabled(chainId as Hex)) {
          continue;
        }
        const chainMarketData = tokenRatesState.marketData[chainId as Hex];

        for (const [tokenAddress, balance] of Object.entries(chainBalances)) {
          const chainTokens = tokensState.allTokens[chainId as Hex];
          const accountTokens = chainTokens?.[account.address];
          const token = accountTokens?.find((t) => t.address === tokenAddress);
          if (!token) {
            continue;
          }

          const decimals =
            typeof token.decimals === 'number' && !Number.isNaN(token.decimals)
              ? token.decimals
              : 18;

          const balanceInSmallestUnit = parseInt(balance as string, 16);
          if (Number.isNaN(balanceInSmallestUnit)) {
            continue;
          }

          const balanceInTokenUnits =
            balanceInSmallestUnit / Math.pow(10, decimals);

          const tokenMarketData = chainMarketData?.[tokenAddress as Hex];
          const price = tokenMarketData?.price as number | undefined;
          const percentRaw = (
            tokenMarketData as unknown as Record<string, unknown>
          )?.[evmPercentField[period] as string] as number | undefined;

          if (!isNonNaNNumber(price)) {
            continue;
          }

          const nativeCurrency = (
            tokenMarketData as unknown as { currency?: string }
          )?.currency;
          const nativeToUserRate =
            nativeCurrency && currencyRateState.currencyRates[nativeCurrency]
              ? currencyRateState.currencyRates[nativeCurrency]?.conversionRate
              : undefined;

          if (!isNonNaNNumber(nativeToUserRate)) {
            continue;
          }

          if (!isNonNaNNumber(percentRaw)) {
            continue;
          }

          const priceInUserCurrency = price * nativeToUserRate;
          const currentValue = balanceInTokenUnits * priceInUserCurrency;
          const denom = Number((1 + percentRaw / 100).toFixed(8));
          if (denom === 0) {
            continue;
          }
          const previousValue = currentValue / denom;
          currentTotal += currentValue;
          previousTotal += previousValue;
        }
      }
    } else {
      const accountBalances = multichainBalancesState.balances[account.id];
      if (!accountBalances) {
        continue;
      }

      for (const [assetId, balanceData] of Object.entries(accountBalances)) {
        if (!isAssetChainEnabled(assetId as CaipAssetType)) {
          continue;
        }

        const balanceAmount = parseFloat(balanceData.amount);
        if (Number.isNaN(balanceAmount)) {
          continue;
        }

        const conversionRate =
          multichainRatesState.conversionRates[assetId as CaipAssetType];
        const rateStr = conversionRate?.rate as string | undefined;
        const percentObj = (
          conversionRate as unknown as {
            marketData?: { pricePercentChange?: Record<string, number> };
          }
        )?.marketData?.pricePercentChange;
        const percentRaw = percentObj?.[nonEvmPercentKey[period]];

        const rate =
          typeof rateStr === 'string' ? parseFloat(rateStr) : undefined;
        if (!isNonNaNNumber(rate) || !isNonNaNNumber(percentRaw)) {
          continue;
        }

        const currentValue = balanceAmount * rate;
        const denom = Number((1 + percentRaw / 100).toFixed(8));
        if (denom === 0) {
          continue;
        }
        const previousValue = currentValue / denom;
        currentTotal += currentValue;
        previousTotal += previousValue;
      }
    }
  }

  const amountChange = currentTotal - previousTotal;
  const percentChange =
    previousTotal !== 0 ? (amountChange / previousTotal) * 100 : 0;

  return {
    period,
    currentTotalInUserCurrency: Number(currentTotal.toFixed(8)),
    previousTotalInUserCurrency: Number(previousTotal.toFixed(8)),
    amountChangeInUserCurrency: Number(amountChange.toFixed(8)),
    percentChange: Number(percentChange.toFixed(8)),
    userCurrency: currencyRateState.currentCurrency,
  };
}
