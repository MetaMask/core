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
  walletId: AccountWalletId;
  groupId: AccountGroupId;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type WalletBalance = {
  walletId: AccountWalletId;
  groups: Record<AccountGroupId, AccountGroupBalance>;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type AllWalletsBalance = {
  wallets: Record<AccountWalletId, WalletBalance>;
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

// Constants for decimal precision and calculations
const DECIMAL_PRECISION = 8;
const PERCENT_DIVISOR = 100;

/**
 * Type-safe access to percent change fields from MarketDataDetails
 *
 * @param marketData - Market data object containing percent change fields
 * @param period - Time period for the percent change ('1d', '7d', '30d')
 * @returns The percent change value for the specified period, or undefined if not available
 */
const getPercentChange = (
  marketData: { [key: string]: unknown } | undefined,
  period: BalanceChangePeriod,
): number | undefined => {
  const fieldMap: Record<BalanceChangePeriod, string> = {
    '1d': 'pricePercentChange1d',
    '7d': 'pricePercentChange7d',
    '30d': 'pricePercentChange30d',
  };
  const field = fieldMap[period];
  const value = marketData?.[field];
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
};

const isChainEnabledByMap = (
  map: Record<string, Record<string, boolean>> | undefined,
  id: Hex | CaipChainId,
): boolean => {
  if (!map) {
    return true;
  }
  const isHex = isStrictHexString(id);
  if (isHex) {
    const evm = map[String(KnownCaipNamespace.Eip155)];
    return Boolean(evm?.[id]);
  }
  const { namespace } = parseCaipChainId(id);
  return Boolean(map[namespace]?.[id]);
};

const getWalletIdFromGroupId = (groupId: AccountGroupId): AccountWalletId => {
  return groupId.split('/')[0] as AccountWalletId;
};

const getInternalAccountsForGroup = (
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  groupId: AccountGroupId,
): InternalAccount[] => {
  const walletId = getWalletIdFromGroupId(groupId);
  const wallet = accountTreeState.accountTree.wallets[walletId];
  if (!wallet) {
    return [];
  }
  const group = wallet.groups[groupId];
  if (!group) {
    return [];
  }
  return group.accounts
    .map(
      (accountId: string) => accountsState.internalAccounts.accounts[accountId],
    )
    .filter(Boolean);
};

/**
 * Build a flattened list of { groupId, account } rows for a given wallet.
 *
 * @param accountTreeState - AccountTreeController state.
 * @param accountsState - AccountsController state.
 * @param walletId - Wallet identifier containing groups/accounts to flatten.
 * @returns Array of rows with groupId and account.
 */
function getGroupAccountRows(
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  walletId: AccountWalletId,
): { groupId: AccountGroupId; account: InternalAccount }[] {
  const wallet = accountTreeState.accountTree.wallets[walletId];
  if (!wallet) {
    return [];
  }
  const groupIds = Object.keys(wallet.groups || {}) as AccountGroupId[];
  const rows: { groupId: AccountGroupId; account: InternalAccount }[] = [];
  for (const groupId of groupIds) {
    const accounts = getInternalAccountsForGroup(
      accountTreeState,
      accountsState,
      groupId as AccountGroupId,
    );
    for (const account of accounts) {
      rows.push({ groupId, account });
    }
  }
  return rows;
}

const isNonNaNNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);

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
  const getValidTokenBalances = () => {
    const accountBalances =
      tokenBalancesState.tokenBalances[account.address as Hex] ?? {};
    const tokenBalances = Object.entries(accountBalances)
      .filter(([chainId]) => isEvmChainEnabled(chainId as Hex))
      .flatMap(([chainId, chainBalances]) =>
        Object.entries(chainBalances).map(([tokenAddress, balance]) => ({
          chainId: chainId as Hex,
          tokenAddress: tokenAddress as Hex,
          balance,
        })),
      );
    return tokenBalances;
  };

  const calcTokenValue = (
    tokenBalance: ReturnType<typeof getValidTokenBalances>[number],
  ) => {
    const { chainId, tokenAddress, balance } = tokenBalance;

    // Get Token Info
    const chainTokens = tokensState.allTokens[chainId];
    const accountTokens = chainTokens?.[account.address];
    const token = accountTokens?.find((t) => t.address === tokenAddress);
    if (!token) {
      return 0;
    }

    // Get market data
    const chainMarketData = tokenRatesState.marketData[chainId as Hex];
    const tokenMarketData = chainMarketData?.[tokenAddress as Hex];
    if (!tokenMarketData?.price) {
      return 0;
    }

    // Get conversion rate
    const nativeToUserRate =
      currencyRateState.currencyRates[tokenMarketData.currency]?.conversionRate;
    if (!nativeToUserRate) {
      return 0;
    }

    // Calculate value
    const decimals = isNonNaNNumber(token.decimals) ? token.decimals : 18;
    const balanceInSmallestUnit = parseInt(balance, 16);
    if (!isNonNaNNumber(balanceInSmallestUnit)) {
      return 0;
    }

    return (
      (balanceInSmallestUnit / Math.pow(10, decimals)) *
      tokenMarketData.price *
      nativeToUserRate
    );
  };

  const tokenBalances = getValidTokenBalances();
  const total = tokenBalances.reduce((a, b) => a + calcTokenValue(b), 0);
  return total;
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
  /**
   * Retrieves and filters valid asset balances for the account.
   *
   * This function:
   * 1. Gets account balances from the multichain balances state
   * 2. Filters out disabled asset chains using the isAssetChainEnabled predicate
   * 3. Returns structured objects with assetId and balanceData
   *
   * @returns Array of valid asset balance objects for enabled chains
   */
  const getValidAssetBalances = () => {
    const accountBalances = multichainBalancesState.balances[account.id] ?? {};
    const assetBalances = Object.entries(accountBalances)
      .filter(([assetId]) => isAssetChainEnabled(assetId as CaipAssetType))
      .map(([assetId, balanceData]) => ({
        assetId: assetId as CaipAssetType,
        balanceData,
      }));
    return assetBalances;
  };

  /**
   * Calculates the USD value of a single asset balance.
   *
   * This function:
   * 1. Parses the balance amount from the asset data
   * 2. Retrieves the conversion rate for the asset
   * 3. Calculates final USD value using balance amount and conversion rate
   *
   * @param assetBalance - Asset balance object containing assetId and balanceData
   * @returns USD value of the asset balance, or 0 if calculation fails
   */
  const calcAssetValue = (
    assetBalance: ReturnType<typeof getValidAssetBalances>[number],
  ) => {
    const { assetId, balanceData } = assetBalance;

    const balanceAmount = parseFloat(balanceData.amount);
    if (Number.isNaN(balanceAmount)) {
      return 0;
    }

    const conversionRate = multichainRatesState.conversionRates[assetId];
    if (!conversionRate?.rate) {
      return 0;
    }

    const rate = parseFloat(conversionRate.rate);
    if (Number.isNaN(rate)) {
      return 0;
    }

    return balanceAmount * rate;
  };

  // Execute the functional pipeline:
  // 1. Get valid asset balances (filtered by enabled chains)
  // 2. Calculate USD value for each asset
  // 3. Sum all values to get total account balance
  const assetBalances = getValidAssetBalances();
  const total = assetBalances.reduce((a, b) => a + calcAssetValue(b), 0);
  return total;
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
            groupId as AccountGroupId,
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
  ): Record<AccountWalletId, WalletBalance> => {
    const wallets: Record<AccountWalletId, WalletBalance> = {};
    const defaultWalletBalance = (
      walletId: AccountWalletId,
    ): WalletBalance => ({
      walletId,
      groups: {},
      totalBalanceInUserCurrency: 0,
      userCurrency: currencyRateState.currentCurrency,
    });
    const defaultGroupBalance = (
      walletId: AccountWalletId,
      groupId: AccountGroupId,
    ): AccountGroupBalance => ({
      walletId,
      groupId,
      totalBalanceInUserCurrency: 0,
      userCurrency: currencyRateState.currentCurrency,
    });

    flatAccountBalances.forEach((flatAccount) => {
      const { walletId, groupId, balance } = flatAccount;
      wallets[walletId as AccountWalletId] ??= defaultWalletBalance(
        walletId as AccountWalletId,
      );
      wallets[walletId as AccountWalletId].groups[groupId as AccountGroupId] ??=
        defaultGroupBalance(
          walletId as AccountWalletId,
          groupId as AccountGroupId,
        );
      wallets[walletId as AccountWalletId].groups[
        groupId as AccountGroupId
      ].totalBalanceInUserCurrency += balance;
      wallets[walletId as AccountWalletId].totalBalanceInUserCurrency +=
        balance;
    });

    // Ensure all groups (including empty ones) are represented
    Object.entries(accountTreeState.accountTree.wallets ?? {}).forEach(
      ([walletId, wallet]) => {
        if (!wallet) {
          return;
        }
        wallets[walletId as AccountWalletId] ??= defaultWalletBalance(
          walletId as AccountWalletId,
        );
        Object.keys(wallet.groups || {}).forEach((groupId) => {
          wallets[walletId as AccountWalletId].groups[
            groupId as AccountGroupId
          ] ??= defaultGroupBalance(
            walletId as AccountWalletId,
            groupId as AccountGroupId,
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
  let currentTotal = 0;
  let previousTotal = 0;

  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  const nonEvmPercentKey: Record<BalanceChangePeriod, string> = {
    '1d': 'P1D',
    '7d': 'P7D',
    '30d': 'P30D',
  };

  const walletIds: AccountWalletId[] = Object.keys(
    accountTreeState.accountTree.wallets,
  ) as AccountWalletId[];

  for (const walletId of walletIds) {
    const wallet = accountTreeState.accountTree.wallets[walletId];
    if (!wallet) {
      continue;
    }
    const rows = getGroupAccountRows(accountTreeState, accountsState, walletId);
    for (const { account } of rows) {
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
          const chainTokens = tokensState.allTokens[chainId as Hex];
          const accountTokens = chainTokens?.[account.address] ?? [];
          const tokenIndex: Record<
            string,
            { address: string; decimals?: number }
          > = Object.fromEntries(
            accountTokens.map((t) => [
              t.address,
              { address: t.address, decimals: t.decimals },
            ]),
          );
          for (const [tokenAddress, balance] of Object.entries(chainBalances)) {
            const token = tokenIndex[tokenAddress];
            if (!token) {
              continue;
            }
            const decimals =
              typeof token.decimals === 'number' &&
              !Number.isNaN(token.decimals)
                ? token.decimals
                : 18;
            if (typeof balance !== 'string') {
              continue;
            }
            const balanceInSmallestUnit = parseInt(balance, 16);
            if (Number.isNaN(balanceInSmallestUnit)) {
              continue;
            }
            const balanceInTokenUnits =
              balanceInSmallestUnit / Math.pow(10, decimals);
            const tokenMarketData = chainMarketData?.[tokenAddress as Hex];
            const price = tokenMarketData?.price;
            const percentRaw = getPercentChange(tokenMarketData, period);
            if (!isNonNaNNumber(price)) {
              continue;
            }
            const nativeCurrency = (
              tokenMarketData as unknown as { currency?: string }
            )?.currency;
            const nativeToUserRate =
              nativeCurrency && currencyRateState.currencyRates[nativeCurrency]
                ? currencyRateState.currencyRates[nativeCurrency]
                    ?.conversionRate
                : undefined;
            if (
              !isNonNaNNumber(nativeToUserRate) ||
              !isNonNaNNumber(percentRaw)
            ) {
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
          const rateStr = conversionRate?.rate;
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
  let current = 0;
  let previous = 0;
  const accountBalances =
    tokenBalancesState.tokenBalances[account.address as Hex];
  if (!accountBalances) {
    return { current, previous };
  }
  for (const [chainId, chainBalances] of Object.entries(accountBalances)) {
    if (!isEvmChainEnabled(chainId as Hex)) {
      continue;
    }
    const chainMarketData = tokenRatesState.marketData[chainId as Hex];
    const chainTokens = tokensState.allTokens[chainId as Hex];
    const accountTokens = chainTokens?.[account.address] ?? [];
    const tokenIndex: Record<string, { address: string; decimals?: number }> =
      Object.fromEntries(
        accountTokens.map((t) => [
          t.address,
          { address: t.address, decimals: t.decimals },
        ]),
      );
    for (const [tokenAddress, balance] of Object.entries(chainBalances)) {
      const token = tokenIndex[tokenAddress];
      if (!token) {
        continue;
      }

      const decimals =
        typeof token.decimals === 'number' && !Number.isNaN(token.decimals)
          ? token.decimals
          : 18;
      if (typeof balance !== 'string') {
        continue;
      }
      const balanceInSmallestUnit = parseInt(balance, 16);
      if (Number.isNaN(balanceInSmallestUnit)) {
        continue;
      }
      const balanceInTokenUnits =
        balanceInSmallestUnit / Math.pow(10, decimals);

      const tokenMarketData = chainMarketData?.[tokenAddress as Hex];
      const price = tokenMarketData?.price;
      const percentRaw = getPercentChange(tokenMarketData, period);

      if (!isNonNaNNumber(price)) {
        continue;
      }

      const nativeCurrency = tokenMarketData?.currency;
      const nativeToUserRate =
        nativeCurrency && currencyRateState.currencyRates[nativeCurrency]
          ? currencyRateState.currencyRates[nativeCurrency]?.conversionRate
          : undefined;
      if (!isNonNaNNumber(nativeToUserRate) || !isNonNaNNumber(percentRaw)) {
        continue;
      }

      const priceInUserCurrency = price * nativeToUserRate;
      const currentValue = balanceInTokenUnits * priceInUserCurrency;
      const denom = Number(
        (1 + percentRaw / PERCENT_DIVISOR).toFixed(DECIMAL_PRECISION),
      );
      if (denom === 0) {
        continue;
      }
      const previousValue = currentValue / denom;
      current += currentValue;
      previous += previousValue;
    }
  }
  return { current, previous };
}

/**
 * Sum non-EVM account change for a period (current and previous totals).
 *
 * @param account - Internal account to aggregate.
 * @param period - Change period ('1d' | '7d' | '30d').
 * @param multichainBalancesState - Multichain balances controller state.
 * @param multichainRatesState - Multichain assets rates controller state.
 * @param isAssetChainEnabled - Predicate that returns true if the asset's chain is enabled.
 * @param nonEvmPercentKey - Map of period to the market data percent-change key (e.g., P1D).
 * @returns Object with current and previous totals in user currency.
 */
function sumNonEvmAccountChangeForPeriod(
  account: InternalAccount,
  period: BalanceChangePeriod,
  multichainBalancesState: MultichainBalancesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  isAssetChainEnabled: (assetId: CaipAssetType) => boolean,
  nonEvmPercentKey: Record<BalanceChangePeriod, string>,
): { current: number; previous: number } {
  let current = 0;
  let previous = 0;
  const accountBalances = multichainBalancesState.balances[account.id];
  if (!accountBalances) {
    return { current, previous };
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
    const rateStr = conversionRate?.rate;
    const percentObj = conversionRate?.marketData?.pricePercentChange;
    const percentRaw = percentObj?.[nonEvmPercentKey[period]];

    const rate = typeof rateStr === 'string' ? parseFloat(rateStr) : undefined;
    if (!isNonNaNNumber(rate) || !isNonNaNNumber(percentRaw)) {
      continue;
    }
    const currentValue = balanceAmount * rate;
    const denom = Number(
      (1 + percentRaw / PERCENT_DIVISOR).toFixed(DECIMAL_PRECISION),
    );
    if (denom === 0) {
      continue;
    }
    const previousValue = currentValue / denom;
    current += currentValue;
    previous += previousValue;
  }
  return { current, previous };
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
  groupId: AccountGroupId,
  period: BalanceChangePeriod,
): BalanceChangeResult {
  let currentTotal = 0;
  let previousTotal = 0;

  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  const nonEvmPercentKey: Record<BalanceChangePeriod, string> = {
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
      const { current, previous } = sumEvmAccountChangeForPeriod(
        account,
        period,
        tokenBalancesState,
        tokensState,
        tokenRatesState,
        currencyRateState,
        isEvmChainEnabled,
      );
      currentTotal += current;
      previousTotal += previous;
    } else {
      const { current, previous } = sumNonEvmAccountChangeForPeriod(
        account,
        period,
        multichainBalancesState,
        multichainRatesState,
        isAssetChainEnabled,
        nonEvmPercentKey,
      );
      currentTotal += current;
      previousTotal += previous;
    }
  }

  const amountChange = currentTotal - previousTotal;
  const percentChange =
    previousTotal !== 0 ? (amountChange / previousTotal) * 100 : 0;

  return {
    period,
    currentTotalInUserCurrency: Number(currentTotal.toFixed(DECIMAL_PRECISION)),
    previousTotalInUserCurrency: Number(
      previousTotal.toFixed(DECIMAL_PRECISION),
    ),
    amountChangeInUserCurrency: Number(amountChange.toFixed(DECIMAL_PRECISION)),
    percentChange: Number(percentChange.toFixed(DECIMAL_PRECISION)),
    userCurrency: currencyRateState.currentCurrency,
  };
}
