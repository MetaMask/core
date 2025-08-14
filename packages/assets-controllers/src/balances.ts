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
 * Sum EVM account balance changes for a specific period (1d, 7d, 30d).
 *
 * This function calculates the current and previous portfolio values for EVM tokens
 * by aggregating balance changes across all enabled chains and tokens.
 *
 * @param account - Internal account to calculate changes for
 * @param period - Time period for the change calculation ('1d', '7d', '30d')
 * @param tokenBalancesState - Token balances controller state
 * @param tokensState - Tokens controller state
 * @param tokenRatesState - Token rates controller state
 * @param currencyRateState - Currency rate controller state
 * @param isEvmChainEnabled - Predicate to check if an EVM chain is enabled
 * @returns Object containing current and previous portfolio values in user currency
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
  const accountBalances =
    tokenBalancesState.tokenBalances[account.address as Hex];
  if (!accountBalances) {
    return { current: 0, previous: 0 };
  }

  /**
   * Retrieves and filters valid token changes for the account.
   *
   * This function:
   * 1. Filters out disabled chains using the isEvmChainEnabled predicate
   * 2. Creates a token index for efficient lookups
   * 3. Maps chain balances to structured token change objects
   * 4. Filters out invalid tokens and balance data
   *
   * @returns Array of valid token change objects with all necessary data for calculation
   */
  const getValidTokenChanges = () => {
    const tokenChanges = Object.entries(accountBalances)
      .filter(([chainId]) => isEvmChainEnabled(chainId as Hex))
      .flatMap(([chainId, chainBalances]) => {
        const chainMarketData = tokenRatesState.marketData[chainId as Hex];
        const chainTokens = tokensState.allTokens[chainId as Hex];
        const accountTokens = chainTokens?.[account.address] ?? [];

        // Create efficient token lookup index
        const tokenIndex: Record<
          string,
          { address: string; decimals?: number }
        > = Object.fromEntries(
          accountTokens.map((t) => [
            t.address,
            { address: t.address, decimals: t.decimals },
          ]),
        );

        return Object.entries(chainBalances)
          .map(([tokenAddress, balance]) => ({
            chainId: chainId as Hex,
            tokenAddress: tokenAddress as Hex,
            balance,
            token: tokenIndex[tokenAddress],
            chainMarketData,
          }))
          .filter((item) => item.token && typeof item.balance === 'string');
      });

    return tokenChanges;
  };

  /**
   * Calculates the current and previous values for a single token change.
   *
   * This function:
   * 1. Converts balance from hex to token units using proper decimals
   * 2. Retrieves current market price and percentage change data
   * 3. Applies currency conversion rates
   * 4. Calculates both current and previous values using percentage change
   * 5. Returns early with zeros if any required data is missing
   *
   * @param tokenChange - Token change object containing balance, token metadata, and market data
   * @returns Object with current and previous values, or zeros if calculation fails
   */
  const calcTokenChange = (
    tokenChange: ReturnType<typeof getValidTokenChanges>[number],
  ) => {
    const { balance, token, chainMarketData } = tokenChange;

    // Convert balance from hex to token units
    const decimals =
      typeof token.decimals === 'number' && !Number.isNaN(token.decimals)
        ? token.decimals
        : 18;

    const balanceInSmallestUnit = parseInt(balance, 16);
    if (Number.isNaN(balanceInSmallestUnit)) {
      return { current: 0, previous: 0 };
    }

    const balanceInTokenUnits = balanceInSmallestUnit / Math.pow(10, decimals);

    // Get market data and percentage change
    const tokenMarketData = chainMarketData?.[token.address as Hex];
    const price = tokenMarketData?.price;
    const percentRaw = getPercentChange(tokenMarketData, period);

    if (!isNonNaNNumber(price)) {
      return { current: 0, previous: 0 };
    }

    // Apply currency conversion rate
    const nativeCurrency = tokenMarketData?.currency;
    const nativeToUserRate =
      nativeCurrency && currencyRateState.currencyRates[nativeCurrency]
        ? currencyRateState.currencyRates[nativeCurrency]?.conversionRate
        : undefined;

    if (!isNonNaNNumber(nativeToUserRate) || !isNonNaNNumber(percentRaw)) {
      return { current: 0, previous: 0 };
    }

    // Calculate current and previous values
    const priceInUserCurrency = price * nativeToUserRate;
    const currentValue = balanceInTokenUnits * priceInUserCurrency;
    const denom = Number(
      (1 + percentRaw / PERCENT_DIVISOR).toFixed(DECIMAL_PRECISION),
    );

    if (denom === 0) {
      return { current: 0, previous: 0 };
    }

    const previousValue = currentValue / denom;
    return { current: currentValue, previous: previousValue };
  };

  // Execute the functional pipeline:
  // 1. Get valid token changes (filtered by enabled chains and valid data)
  // 2. Calculate current/previous values for each token
  // 3. Aggregate totals across all tokens
  const tokenChanges = getValidTokenChanges();
  const totals = tokenChanges.reduce(
    (acc, tokenChange) => {
      const change = calcTokenChange(tokenChange);
      return {
        current: acc.current + change.current,
        previous: acc.previous + change.previous,
      };
    },
    { current: 0, previous: 0 },
  );

  return totals;
}

/**
 * Sum non-EVM account balance changes for a specific period (1d, 7d, 30d).
 *
 * This function calculates the current and previous portfolio values for non-EVM assets
 * by aggregating balance changes across all enabled asset chains.
 *
 * @param account - Internal account to calculate changes for
 * @param period - Time period for the change calculation ('1d', '7d', '30d')
 * @param multichainBalancesState - Multichain balances controller state
 * @param multichainRatesState - Multichain assets rates controller state
 * @param isAssetChainEnabled - Predicate to check if an asset chain is enabled
 * @param nonEvmPercentKey - Map of period to market data percent-change key (e.g., P1D, P7D, P30D)
 * @returns Object containing current and previous portfolio values in user currency
 */
function sumNonEvmAccountChangeForPeriod(
  account: InternalAccount,
  period: BalanceChangePeriod,
  multichainBalancesState: MultichainBalancesControllerState,
  multichainRatesState: MultichainAssetsRatesControllerState,
  isAssetChainEnabled: (assetId: CaipAssetType) => boolean,
  nonEvmPercentKey: Record<BalanceChangePeriod, string>,
): { current: number; previous: number } {
  const accountBalances = multichainBalancesState.balances[account.id];
  if (!accountBalances) {
    return { current: 0, previous: 0 };
  }

  /**
   * Retrieves and filters valid asset changes for the account.
   *
   * This function:
   * 1. Filters out disabled asset chains using the isAssetChainEnabled predicate
   * 2. Maps asset balances to structured asset change objects
   * 3. Filters out assets with invalid balance amounts or missing rate data
   * 4. Ensures all required data is available for percentage change calculations
   *
   * @returns Array of valid asset change objects with balance data and conversion rates
   */
  const getValidAssetChanges = () => {
    const assetChanges = Object.entries(accountBalances)
      .filter(([assetId]) => isAssetChainEnabled(assetId as CaipAssetType))
      .map(([assetId, balanceData]) => ({
        assetId: assetId as CaipAssetType,
        balanceData,
        conversionRate:
          multichainRatesState.conversionRates[assetId as CaipAssetType],
      }))
      .filter((item) => {
        // Validate balance amount
        const balanceAmount = parseFloat(item.balanceData.amount);
        if (Number.isNaN(balanceAmount)) {
          return false;
        }

        // Validate conversion rate and percentage change data
        const rateStr = item.conversionRate?.rate;
        const percentObj = item.conversionRate?.marketData?.pricePercentChange;
        const percentRaw = percentObj?.[nonEvmPercentKey[period]];

        const rate =
          typeof rateStr === 'string' ? parseFloat(rateStr) : undefined;
        return isNonNaNNumber(rate) && isNonNaNNumber(percentRaw);
      });

    return assetChanges;
  };

  /**
   * Calculates the current and previous values for a single asset change.
   *
   * This function:
   * 1. Parses the balance amount from the asset data
   * 2. Retrieves the conversion rate and percentage change data
   * 3. Calculates current value using balance amount and conversion rate
   * 4. Calculates previous value using percentage change formula
   * 5. Returns early with zeros if denominator calculation fails
   *
   * @param assetChange - Asset change object containing balance data and conversion rate
   * @returns Object with current and previous values, or zeros if calculation fails
   */
  const calcAssetChange = (
    assetChange: ReturnType<typeof getValidAssetChanges>[number],
  ) => {
    const { balanceData, conversionRate } = assetChange;

    // Parse balance and rate data
    const balanceAmount = parseFloat(balanceData.amount);
    const rateStr = conversionRate.rate;
    const percentObj = conversionRate.marketData?.pricePercentChange;
    const percentRaw = percentObj?.[nonEvmPercentKey[period]];

    if (!percentRaw) {
      return { current: 0, previous: 0 };
    }

    // Calculate current value
    const rate = parseFloat(rateStr);
    const currentValue = balanceAmount * rate;

    // Calculate previous value using percentage change
    const denom = Number(
      (1 + percentRaw / PERCENT_DIVISOR).toFixed(DECIMAL_PRECISION),
    );

    if (denom === 0) {
      return { current: 0, previous: 0 };
    }

    const previousValue = currentValue / denom;
    return { current: currentValue, previous: previousValue };
  };

  // Execute the functional pipeline:
  // 1. Get valid asset changes (filtered by enabled chains and valid data)
  // 2. Calculate current/previous values for each asset
  // 3. Aggregate totals across all assets
  const assetChanges = getValidAssetChanges();
  const totals = assetChanges.reduce(
    (acc, assetChange) => {
      const change = calcAssetChange(assetChange);
      return {
        current: acc.current + change.current,
        previous: acc.previous + change.previous,
      };
    },
    { current: 0, previous: 0 },
  );

  return totals;
}

/**
 * Calculate portfolio value change for a specific account group and period.
 *
 * This function aggregates balance changes across all accounts in a specific group,
 * calculating current and previous portfolio values, amount changes, and percentage changes.
 * It handles both EVM and non-EVM accounts using their respective calculation strategies.
 *
 * @param accountTreeState - AccountTreeController state containing wallet and group structure
 * @param accountsState - AccountsController state containing account information
 * @param tokenBalancesState - TokenBalancesController state for EVM token balances
 * @param tokenRatesState - TokenRatesController state for EVM token market data
 * @param multichainRatesState - MultichainAssetsRatesController state for non-EVM rates
 * @param multichainBalancesState - MultichainBalancesController state for non-EVM balances
 * @param tokensState - TokensController state containing token metadata
 * @param currencyRateState - CurrencyRateController state for conversion rates
 * @param enabledNetworkMap - Map of enabled networks for filtering disabled chains
 * @param groupId - Account group ID to compute changes for
 * @param period - Change period ('1d', '7d', '30d') for historical comparison
 * @returns BalanceChangeResult with current, previous, delta, percent, and period information
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
  /**
   * Chain enablement predicates for filtering disabled networks.
   * These functions determine which chains/assets should be included in calculations.
   *
   * @param chainId - Chain identifier to check for enablement
   * @returns True if the chain is enabled, false otherwise
   */
  const isEvmChainEnabled = (chainId: Hex): boolean =>
    isChainEnabledByMap(enabledNetworkMap, chainId);

  const isAssetChainEnabled = (assetId: CaipAssetType): boolean => {
    const { chainId } = parseCaipAssetType(assetId);
    return isChainEnabledByMap(enabledNetworkMap, chainId);
  };

  /**
   * Mapping of balance change periods to non-EVM market data keys.
   * Non-EVM assets use different field names (P1D, P7D, P30D) compared to EVM tokens.
   */
  const nonEvmPercentKey: Record<BalanceChangePeriod, string> = {
    '1d': 'P1D',
    '7d': 'P7D',
    '30d': 'P30D',
  };

  /**
   * Calculates balance changes for a single account.
   *
   * This function:
   * 1. Determines account type (EVM vs non-EVM)
   * 2. Calls appropriate calculation function based on account type
   * 3. Returns structured change data for aggregation
   *
   * @param account - Account to calculate changes for
   * @returns Object with current and previous values for the account
   */
  const calcAccountChange = (account: InternalAccount) => {
    const isEvmAccount = isEvmAccountType(account.type);

    if (isEvmAccount) {
      // Calculate EVM account changes using token balances and rates
      return sumEvmAccountChangeForPeriod(
        account,
        period,
        tokenBalancesState,
        tokensState,
        tokenRatesState,
        currencyRateState,
        isEvmChainEnabled,
      );
    }

    // Calculate non-EVM account changes using multichain data
    return sumNonEvmAccountChangeForPeriod(
      account,
      period,
      multichainBalancesState,
      multichainRatesState,
      isAssetChainEnabled,
      nonEvmPercentKey,
    );
  };

  /**
   * Aggregates balance changes across all accounts in the group.
   *
   * This function:
   * 1. Gets all accounts in the specified group
   * 2. Calculates changes for each account using the appropriate strategy
   * 3. Aggregates results into total current and previous values
   *
   * @returns Object with aggregated current and previous totals
   */
  const getGroupTotals = () => {
    const accounts = getInternalAccountsForGroup(
      accountTreeState,
      accountsState,
      groupId,
    );

    return accounts.map(calcAccountChange).reduce(
      (acc, change) => ({
        current: acc.current + change.current,
        previous: acc.previous + change.previous,
      }),
      { current: 0, previous: 0 },
    );
  };

  /**
   * Calculates final change metrics from aggregated totals.
   *
   * This function:
   * 1. Computes absolute amount change
   * 2. Calculates percentage change (handles division by zero)
   * 3. Rounds all values to DECIMAL_PRECISION for consistency
   *
   * @param totals - Aggregated current and previous values
   * @param totals.current - Current total portfolio value
   * @param totals.previous - Previous total portfolio value
   * @returns Complete BalanceChangeResult with all metrics
   */
  const calcFinalMetrics = (totals: { current: number; previous: number }) => {
    const { current, previous } = totals;
    const amountChange = current - previous;
    const percentChange = previous !== 0 ? (amountChange / previous) * 100 : 0;

    return {
      period,
      currentTotalInUserCurrency: Number(current.toFixed(DECIMAL_PRECISION)),
      previousTotalInUserCurrency: Number(previous.toFixed(DECIMAL_PRECISION)),
      amountChangeInUserCurrency: Number(
        amountChange.toFixed(DECIMAL_PRECISION),
      ),
      percentChange: Number(percentChange.toFixed(DECIMAL_PRECISION)),
      userCurrency: currencyRateState.currentCurrency,
    };
  };

  // Execute the functional pipeline:
  // 1. Get all accounts in the group
  // 2. Calculate balance changes for each account (EVM vs non-EVM)
  // 3. Aggregate totals across all accounts
  // 4. Calculate final metrics and return result
  const groupTotals = getGroupTotals();
  return calcFinalMetrics(groupTotals);
}
