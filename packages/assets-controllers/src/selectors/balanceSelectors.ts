import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountWalletObject } from '@metamask/account-tree-controller';
import type { AccountGroupObject } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { EntropySourceId } from '@metamask/keyring-api';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { Hex } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';
import { createSelector } from 'reselect';

import {
  extractControllerStates,
  type AssetsSelectorState,
} from '../utils/stateAdapter';

/**
 * Helper function to get internal accounts for a specific group.
 * Uses AccountTreeController state to find accounts.
 *
 * @param accountTreeState - AccountTreeController state
 * @param accountsState - AccountsController state
 * @param groupId - The account group ID (format: "walletId/groupIndex")
 * @returns Array of internal accounts in the group
 */
const getInternalAccountsForGroup = (
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  groupId: string,
) => {
  // Extract walletId from groupId (format: "walletId/groupIndex")
  const walletId = groupId.split('/')[0] as EntropySourceId;

  const wallet = (
    accountTreeState.accountTree.wallets as Record<string, AccountWalletObject>
  )[walletId];
  if (!wallet) {
    return [];
  }

  const group = (wallet.groups as Record<string, AccountGroupObject>)[groupId];
  if (!group) {
    return [];
  }

  // Map account IDs to actual account objects
  return group.accounts
    .map(
      (accountId: string) => accountsState.internalAccounts.accounts[accountId],
    )
    .filter(Boolean);
};

/**
 * Selector to get aggregated balances for a specific account group.
 * Returns total balance in user's selected currency, aggregating all tokens across accounts in the group.
 *
 * @param groupId - The account group ID (format: "walletId/groupIndex", e.g., "entropy:entropy-source-1/0")
 * @returns Aggregated balance for the account group
 */
export const selectBalanceByAccountGroup = (groupId: string) =>
  createSelector(
    [(state: unknown) => extractControllerStates(state)],
    (extractedState: AssetsSelectorState): AccountGroupBalance => {
      const {
        AccountTreeController: accountTreeState,
        AccountsController: accountsState,
        TokenBalancesController: tokenBalancesState,
        TokenRatesController: tokenRatesState,
        MultichainAssetsRatesController: multichainRatesState,
        MultichainBalancesController: multichainBalancesState,
        TokensController: tokensState,
        CurrencyRateController: currencyRateState,
      } = extractedState;

      // Extract walletId from groupId
      const walletId = groupId.split('/')[0] as EntropySourceId;

      const accounts = getInternalAccountsForGroup(
        accountTreeState,
        accountsState,
        groupId,
      );

      if (accounts.length === 0) {
        return {
          walletId,
          groupId,
          totalBalanceInUserCurrency: 0,
          userCurrency: currencyRateState.currentCurrency,
        };
      }

      let totalBalanceInUserCurrency = 0;

      // Process each account's balances
      for (const account of accounts) {
        const isEvmAccount = isEvmAccountType(account.type);

        if (isEvmAccount) {
          // Handle EVM account balances from TokenBalancesController
          // Structure: tokenBalances[chainId][accountAddress][tokenAddress] = balance
          for (const [chainId, chainBalances] of Object.entries(
            tokenBalancesState.tokenBalances,
          )) {
            const accountBalances = chainBalances[account.address as Hex];
            if (accountBalances) {
              for (const [tokenAddress, balance] of Object.entries(
                accountBalances,
              )) {
                // Find token in TokensController state
                const chainTokens = tokensState.allTokens[chainId as Hex];
                const accountTokens = chainTokens?.[account.address];
                const token = accountTokens?.find(
                  (t) => t.address === tokenAddress,
                );
                if (!token) {
                  continue;
                }

                const decimals = token.decimals || 18;
                const balanceInSmallestUnit = parseInt(balance as string, 16);

                // Skip invalid balance values to prevent NaN propagation
                if (Number.isNaN(balanceInSmallestUnit)) {
                  continue;
                }

                const balanceInTokenUnits =
                  balanceInSmallestUnit / Math.pow(10, decimals);

                // Get token rate in native currency from TokenRatesController
                const chainMarketData =
                  tokenRatesState.marketData[chainId as Hex];
                const tokenMarketData = chainMarketData?.[tokenAddress as Hex];
                if (tokenMarketData?.price) {
                  // Convert token price to user currency using native currency conversion rate
                  const nativeCurrency = tokenMarketData.currency;
                  const nativeToUserRate =
                    currencyRateState.currencyRates[nativeCurrency]
                      ?.conversionRate;

                  if (nativeToUserRate) {
                    // Convert token price to user currency: tokenPrice * nativeToUserRate
                    const tokenPriceInUserCurrency =
                      tokenMarketData.price * nativeToUserRate;
                    const balanceInUserCurrency =
                      balanceInTokenUnits * tokenPriceInUserCurrency;
                    totalBalanceInUserCurrency += balanceInUserCurrency;
                  }
                }
              }
            }
          }
        } else {
          // Handle non-EVM account balances from MultichainBalancesController
          const accountBalances = multichainBalancesState.balances[account.id];
          if (accountBalances) {
            for (const [assetId, balanceData] of Object.entries(
              accountBalances,
            )) {
              const balanceAmount = parseFloat(balanceData.amount);

              // Skip invalid balance values to prevent NaN propagation
              if (Number.isNaN(balanceAmount)) {
                continue;
              }

              // Get conversion rate for this asset (already in user currency)
              const conversionRate =
                multichainRatesState.conversionRates[assetId as CaipAssetType];
              if (conversionRate) {
                const conversionRateValue = parseFloat(conversionRate.rate);

                // Skip invalid conversion rate values to prevent NaN propagation
                if (Number.isNaN(conversionRateValue)) {
                  continue;
                }

                // MultichainAssetsRatesController already provides rates in user currency
                const balanceInUserCurrency =
                  balanceAmount * conversionRateValue;
                totalBalanceInUserCurrency += balanceInUserCurrency;
              }
            }
          }
        }
      }

      return {
        walletId,
        groupId,
        totalBalanceInUserCurrency,
        userCurrency: currencyRateState.currentCurrency,
      };
    },
  );

/**
 * Aggregated balance for an account group
 */
export type AccountGroupBalance = {
  walletId: string;
  groupId: string;
  totalBalanceInUserCurrency: number; // not formatted
  userCurrency: string;
};

/**
 * Aggregated balance for a wallet (all groups)
 */
export type WalletBalance = {
  walletId: string;
  groups: Record<string, AccountGroupBalance>;
  totalBalanceInUserCurrency: number; // not formatted
  userCurrency: string;
};

/**
 * Aggregated balance for all wallets
 */
export type AllWalletsBalance = {
  wallets: Record<string, WalletBalance>;
  totalBalanceInUserCurrency: number; // not formatted
  userCurrency: string;
};

/**
 * Selector to get aggregated balances for all account groups in a wallet.
 * Returns total balance in user's selected currency, aggregating all tokens across all groups in the wallet.
 *
 * @param walletId - The wallet ID (entropy source)
 * @returns Aggregated balance for all groups in the wallet
 */
export const selectBalanceByWallet = (walletId: EntropySourceId) =>
  createSelector(
    [(state: unknown) => extractControllerStates(state)],
    (extractedState: AssetsSelectorState): WalletBalance => {
      const {
        AccountTreeController: accountTreeState,
        AccountsController: accountsState,
        TokenBalancesController: tokenBalancesState,
        TokenRatesController: tokenRatesState,
        MultichainAssetsRatesController: multichainRatesState,
        MultichainBalancesController: multichainBalancesState,
        TokensController: tokensState,
        CurrencyRateController: currencyRateState,
      } = extractedState;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wallet = (accountTreeState.accountTree.wallets as any)[walletId];
      if (!wallet) {
        return {
          walletId,
          groups: {},
          totalBalanceInUserCurrency: 0,
          userCurrency: currencyRateState.currentCurrency,
        };
      }

      const groupBalances: Record<string, AccountGroupBalance> = {};
      let totalBalanceInUserCurrency = 0;

      const groups = Object.keys(wallet.groups || {}) as string[];

      for (const groupId of groups) {
        const groupBalance = selectBalanceByAccountGroup(groupId)({
          AccountTreeController: accountTreeState,
          AccountsController: accountsState,
          TokenBalancesController: tokenBalancesState,
          TokenRatesController: tokenRatesState,
          MultichainAssetsRatesController: multichainRatesState,
          MultichainBalancesController: multichainBalancesState,
          TokensController: tokensState,
          CurrencyRateController: currencyRateState,
        });

        groupBalances[groupId] = groupBalance;
        totalBalanceInUserCurrency += groupBalance.totalBalanceInUserCurrency;
      }

      return {
        walletId,
        groups: groupBalances,
        totalBalanceInUserCurrency,
        userCurrency: currencyRateState.currentCurrency,
      };
    },
  );

/**
 * Selector to get aggregated balances for all wallets and their account groups.
 * Returns total balance in user's selected currency, aggregating all tokens across all wallets.
 *
 * @returns Aggregated balance for all wallets
 */
export const selectBalanceForAllWallets = () =>
  createSelector(
    [(state: unknown) => extractControllerStates(state)],
    (extractedState: AssetsSelectorState): AllWalletsBalance => {
      const {
        AccountTreeController: accountTreeState,
        AccountsController: accountsState,
        TokenBalancesController: tokenBalancesState,
        TokenRatesController: tokenRatesState,
        MultichainAssetsRatesController: multichainRatesState,
        MultichainBalancesController: multichainBalancesState,
        TokensController: tokensState,
        CurrencyRateController: currencyRateState,
      } = extractedState;

      const walletBalances: Record<string, WalletBalance> = {};
      let totalBalanceInUserCurrency = 0;

      const walletIds = Object.keys(
        accountTreeState.accountTree.wallets,
      ) as string[];

      for (const walletId of walletIds) {
        const walletBalance = selectBalanceByWallet(walletId)({
          AccountTreeController: accountTreeState,
          AccountsController: accountsState,
          TokenBalancesController: tokenBalancesState,
          TokenRatesController: tokenRatesState,
          MultichainAssetsRatesController: multichainRatesState,
          MultichainBalancesController: multichainBalancesState,
          TokensController: tokensState,
          CurrencyRateController: currencyRateState,
        });

        walletBalances[walletId] = walletBalance;
        totalBalanceInUserCurrency += walletBalance.totalBalanceInUserCurrency;
      }

      return {
        wallets: walletBalances,
        totalBalanceInUserCurrency,
        userCurrency: currencyRateState.currentCurrency,
      };
    },
  );

/**
 * Selector to get aggregated balances for the currently selected account group.
 * Returns total balance in user's selected currency, aggregating all tokens in the selected group.
 *
 * @returns Aggregated balance for the currently selected group
 */
export const selectBalanceForSelectedAccountGroup = () =>
  createSelector(
    [(state: unknown) => extractControllerStates(state)],
    (extractedState: AssetsSelectorState): AccountGroupBalance | null => {
      const {
        AccountTreeController: accountTreeState,
        AccountsController: accountsState,
        TokenBalancesController: tokenBalancesState,
        TokenRatesController: tokenRatesState,
        MultichainAssetsRatesController: multichainRatesState,
        MultichainBalancesController: multichainBalancesState,
        TokensController: tokensState,
        CurrencyRateController: currencyRateState,
      } = extractedState;

      const selectedGroupId = accountTreeState.accountTree.selectedAccountGroup;

      if (!selectedGroupId) {
        return null;
      }

      // Validate group ID format
      const parts = selectedGroupId.split('/');
      if (parts.length !== 2) {
        return null;
      }

      return selectBalanceByAccountGroup(selectedGroupId)({
        AccountTreeController: accountTreeState,
        AccountsController: accountsState,
        TokenBalancesController: tokenBalancesState,
        TokenRatesController: tokenRatesState,
        MultichainAssetsRatesController: multichainRatesState,
        MultichainBalancesController: multichainBalancesState,
        TokensController: tokensState,
        CurrencyRateController: currencyRateState,
      });
    },
  );

/**
 * Collection of balance-related selectors for assets controllers
 */
export const balanceSelectors = {
  selectBalanceByAccountGroup,
  selectBalanceByWallet,
  selectBalanceForAllWallets,
  selectBalanceForSelectedAccountGroup,
};
