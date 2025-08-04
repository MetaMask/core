import { isEvmAccountType } from '@metamask/keyring-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { CaipAssetType } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { createSelector } from 'reselect';

import type { CurrencyRateState } from './CurrencyRateController'; // Import controller state types
import type { MultichainAssetsRatesControllerState } from './MultichainAssetsRatesController/MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from './MultichainBalancesController/MultichainBalancesController';
import type { TokenBalancesControllerState } from './TokenBalancesController';
import type { TokenRatesControllerState } from './TokenRatesController';
import type { TokensControllerState } from './TokensController';
import type { AccountTreeControllerState } from '../../account-tree-controller/src/types';
import type { AccountsControllerState } from '../../accounts-controller/src/AccountsController';

// Type for the root state that contains all controller states (no services)
export type RootState = {
  TokenBalancesController: TokenBalancesControllerState;
  CurrencyRateController: CurrencyRateState;
  TokenRatesController: TokenRatesControllerState;
  MultichainAssetsRatesController: MultichainAssetsRatesControllerState;
  MultichainBalancesController: MultichainBalancesControllerState;
  TokensController: TokensControllerState;
  AccountsController: AccountsControllerState;
  AccountTreeController: AccountTreeControllerState;
};

// Base selectors for accessing individual controller states
const selectTokenBalancesState = (state: RootState) =>
  state.TokenBalancesController;

const selectCurrencyRateState = (state: RootState) =>
  state.CurrencyRateController;

const selectTokenRatesState = (state: RootState) => state.TokenRatesController;

const selectMultichainAssetsRatesState = (state: RootState) =>
  state.MultichainAssetsRatesController;

const selectMultichainBalancesState = (state: RootState) =>
  state.MultichainBalancesController;

const selectTokensState = (state: RootState) => state.TokensController;

const selectAccountsState = (state: RootState) => state.AccountsController;

const selectAccountTreeState = (state: RootState) =>
  state.AccountTreeController;

/**
 * Helper function to get internal accounts for a specific account group using AccountTreeController state
 *
 * @param accountTreeState - AccountTreeController state
 * @param accountsState - AccountsController state
 * @param entropySource - The entropy source ID (wallet ID)
 * @param groupIndex - The group index within the wallet
 * @returns Array of internal accounts in the group
 */
const getInternalAccountsForGroup = (
  accountTreeState: AccountTreeControllerState,
  accountsState: AccountsControllerState,
  entropySource: EntropySourceId,
  groupIndex: number,
) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = (accountTreeState.accountTree.wallets as any)[entropySource];
    if (!wallet) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = Object.values(wallet.groups || {}) as any[];
    const group = groups.find(
      (g) => g.metadata?.entropy?.groupIndex === groupIndex,
    );
    if (!group) {
      return [];
    }

    // Map account IDs to actual account objects
    return (group.accounts || [])
      .map(
        (accountId: string) =>
          accountsState.internalAccounts.accounts[accountId],
      )
      .filter(Boolean);
  } catch (error) {
    console.error(
      'Error getting accounts for group:',
      { entropySource, groupIndex },
      error,
    );
    return [];
  }
};

/**
 * Get token decimals from TokensController state for EVM tokens
 *
 * @param tokensState - TokensController state
 * @param chainId - Chain ID in hex format
 * @param tokenAddress - Token contract address
 * @param accountAddress - Account address
 * @returns Token decimals if found, 18 as default
 */
const getEvmTokenDecimals = (
  tokensState: TokensControllerState,
  chainId: Hex,
  tokenAddress: string,
  accountAddress: Hex,
): number => {
  try {
    const chainTokens = tokensState.allTokens[chainId];
    if (!chainTokens) {
      return 18;
    }

    const accountTokens = chainTokens[accountAddress];
    if (!accountTokens) {
      return 18;
    }

    const token = accountTokens.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase(),
    );

    return token?.decimals ?? 18;
  } catch (error) {
    console.warn('Error getting EVM token decimals:', error);
    return 18;
  }
};

/**
 * Creates a memoized selector that returns the fiat-denominated aggregated balance
 * for a given account group across EVM and Solana internal accounts using AccountTreeController state.
 *
 * The selector performs the following operations:
 * 1. Uses AccountTreeController state to get internal accounts for the specified group
 * 2. Extracts EVM addresses and Solana account IDs from accounts
 * 3. Matches accounts to controller balance states (TokenBalances for EVM, MultichainBalances for Solana)
 * 4. Converts EVM balances to ETH using TokenRateController, then to fiat using CurrencyRateController
 * 5. Converts Solana balances to fiat using MultichainAssetRateController
 * 6. Returns aggregated balance in user's selected currency
 *
 * @param entropySource - The entropy source ID (wallet identifier)
 * @param groupIndex - The group index within the wallet (0-based)
 * @returns A memoized selector function that returns:
 * - groupId: String combining entropySource and groupIndex
 * - aggregatedBalance: Total balance in user's selected currency (not formatted)
 * - currency: The user's selected currency code (e.g., 'USD', 'EUR')
 *
 * @example
 * ```typescript
 * // For wallet 'hd-wallet-1', group 0
 * const balanceSelector = selectBalancesByAccountGroup('hd-wallet-1', 0);
 * const balance = balanceSelector(state);
 * console.log(balance);
 * // { groupId: 'hd-wallet-1-0', aggregatedBalance: 1234.56, currency: 'USD' }
 * ```
 */
/**
 * Selector to get aggregated balances for a group of accounts
 *
 * Time Complexity: O(a * c * t) where a=accounts, c=chains, t=tokens
 *
 * This is acceptable because:
 * 1. Reselect memoizes results - only runs when data changes
 * 2. Balance/rate updates are infrequent
 * 3. Most calls return cached results
 * 4. Alternative (flattening) would add transformation overhead
 *
 * @param entropySource - The entropy source ID (wallet ID)
 * @param groupIndex - The group index within the wallet
 * @returns Account group balance info including total balance in user's currency
 */
export const selectBalancesByAccountGroup = (
  entropySource: EntropySourceId,
  groupIndex: number,
) =>
  createSelector(
    [
      selectAccountTreeState,
      selectAccountsState,
      selectTokenBalancesState,
      selectTokenRatesState,
      selectMultichainAssetsRatesState,
      selectMultichainBalancesState,
      selectTokensState,
      selectCurrencyRateState,
    ],
    (
      accountTreeState,
      accountsState,
      tokenBalancesState,
      tokenRatesState,
      multichainRatesState,
      multichainBalancesState,
      tokensState,
      currencyRateState,
    ): AccountGroupBalance => {
      const groupId = `${entropySource}-${groupIndex}`;
      const { currentCurrency } = currencyRateState;

      try {
        const groupAccounts = getInternalAccountsForGroup(
          accountTreeState,
          accountsState,
          entropySource,
          groupIndex,
        );

        if (!groupAccounts?.length) {
          return { groupId, aggregatedBalance: 0, currency: currentCurrency };
        }

        // Cache frequently accessed objects for better performance
        const { tokenBalances } = tokenBalancesState;
        const { marketData } = tokenRatesState;
        const { conversionRates } = multichainRatesState;
        let totalBalance = 0;

        // Single pass through accounts
        for (const account of groupAccounts) {
          if (isEvmAccountType(account.type)) {
            // Handle EVM balances
            const accountAddress = account.address as Hex;
            const accountBalances = tokenBalances[accountAddress];
            if (!accountBalances) {
              continue;
            }

            // Process each chain and token balance
            for (const [chainId, chainBalances] of Object.entries(
              accountBalances,
            )) {
              const chainMarketData = marketData[chainId as Hex];
              if (!chainMarketData) {
                continue;
              }

              for (const [tokenAddress, balance] of Object.entries(
                chainBalances,
              )) {
                const tokenMarketData = chainMarketData[tokenAddress as Hex];
                if (!tokenMarketData?.price) {
                  continue;
                }

                // Get proper decimals from token metadata
                const decimals = getEvmTokenDecimals(
                  tokensState,
                  chainId as Hex,
                  tokenAddress,
                  accountAddress,
                );

                // Convert hex balance to number and apply decimals
                const balanceNumber = parseInt(balance, 16);
                const tokenAmount = balanceNumber / Math.pow(10, decimals);

                // Convert token amount to ETH equivalent, then to USD
                const ethAmount = tokenAmount * tokenMarketData.price;
                const ethToUsdRate =
                  currencyRateState.currencyRates.ETH?.usdConversionRate || 0;
                const usdAmount = ethAmount * ethToUsdRate;

                totalBalance += usdAmount;
              }
            }
          } else {
            // Handle non-EVM balances (e.g., Solana)
            const balances = multichainBalancesState.balances[account.id];
            if (!balances) {
              continue;
            }

            // Process each asset balance
            for (const [assetId, balance] of Object.entries(balances)) {
              const rate = conversionRates[assetId as CaipAssetType]?.rate;
              if (!rate || !balance.amount) {
                continue;
              }

              // MultichainBalancesController stores balances in decimal format
              // No decimal conversion needed - direct multiplication
              const tokenAmount = parseFloat(balance.amount);
              totalBalance += tokenAmount * parseFloat(rate);
            }
          }
        }

        // Convert final balance from USD to user's selected currency
        let finalBalance = totalBalance;
        if (currentCurrency !== 'USD') {
          // Calculate USD to user currency conversion rate using ETH as reference
          const ethRates = currencyRateState.currencyRates.ETH;
          if (
            ethRates?.conversionRate &&
            ethRates?.usdConversionRate &&
            ethRates.usdConversionRate > 0
          ) {
            // USD to user currency rate = (ETH to user currency) / (ETH to USD)
            const usdToUserCurrencyRate =
              ethRates.conversionRate / ethRates.usdConversionRate;
            finalBalance = totalBalance * usdToUserCurrencyRate;
          }
        }

        return {
          groupId,
          aggregatedBalance: finalBalance,
          currency: currentCurrency,
        };
      } catch (error) {
        console.error('Error in selectBalancesByAccountGroup:', error);
        return { groupId, aggregatedBalance: 0, currency: currentCurrency };
      }
    },
  );

/**
 * Return type for selectBalancesByAccountGroup selector
 */
export type AccountGroupBalance = {
  groupId: string;
  aggregatedBalance: number; // not formatted
  currency: string;
};

/**
 * Parameters for selectBalancesByAccountGroup selector
 */
export type AccountGroupBalanceParams = {
  entropySource: EntropySourceId;
  groupIndex: number;
};

/**
 * Return type for selectBalancesByWallet selector
 */
export type WalletBalance = {
  walletId: string;
  groups: AccountGroupBalance[];
  totalBalance: number;
  currency: string;
};

/**
 * Creates a memoized selector that returns aggregated balances for all groups in a wallet
 *
 * Uses AccountTreeController state to get all groups for a wallet,
 * then calculates the balance for each group and aggregates them.
 *
 * @param entropySource - The entropy source ID (wallet identifier)
 * @returns A memoized selector that returns wallet balance with all groups
 */
export const selectBalancesByWallet = (entropySource: EntropySourceId) =>
  createSelector(
    [
      selectAccountTreeState,
      selectAccountsState,
      selectTokenBalancesState,
      selectTokenRatesState,
      selectMultichainAssetsRatesState,
      selectMultichainBalancesState,
      selectTokensState,
      selectCurrencyRateState,
    ],
    (
      accountTreeState,
      accountsState,
      tokenBalancesState,
      tokenRatesState,
      multichainRatesState,
      multichainBalancesState,
      tokensState,
      currencyRateState,
    ): WalletBalance => {
      const { currentCurrency } = currencyRateState;

      try {
        // Get all groups for this wallet from AccountTreeController state
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wallet = (accountTreeState.accountTree.wallets as any)[
          entropySource
        ];
        if (!wallet) {
          return {
            walletId: entropySource,
            groups: [],
            totalBalance: 0,
            currency: currentCurrency,
          };
        }

        const groups: AccountGroupBalance[] = [];
        let totalBalance = 0;

        // Calculate balance for each group using the existing group selector logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const walletGroups = Object.values(wallet.groups || {}) as any[];
        for (const group of walletGroups) {
          const groupIndex = group.metadata?.entropy?.groupIndex;

          // Use the existing selectBalancesByAccountGroup logic
          const groupSelector = selectBalancesByAccountGroup(
            entropySource,
            groupIndex,
          );
          const groupBalance = groupSelector.resultFunc(
            accountTreeState,
            accountsState,
            tokenBalancesState,
            tokenRatesState,
            multichainRatesState,
            multichainBalancesState,
            tokensState,
            currencyRateState,
          );

          groups.push(groupBalance);
          totalBalance += groupBalance.aggregatedBalance;
        }

        return {
          walletId: entropySource,
          groups,
          totalBalance,
          currency: currentCurrency,
        };
      } catch (error) {
        console.error('Error in selectBalancesByWallet:', error);
        return {
          walletId: entropySource,
          groups: [],
          totalBalance: 0,
          currency: currentCurrency,
        };
      }
    },
  );

/**
 * Creates a memoized selector that returns aggregated balances for all wallets
 *
 * Uses AccountTreeController state to get all wallets, then calculates balances for each wallet.
 * Useful for dashboard views showing all wallet balances.
 *
 * @returns A memoized selector that returns all wallet balances
 */
export const selectBalancesForAllWallets = () =>
  createSelector(
    [
      selectAccountTreeState,
      selectAccountsState,
      selectTokenBalancesState,
      selectTokenRatesState,
      selectMultichainAssetsRatesState,
      selectMultichainBalancesState,
      selectTokensState,
      selectCurrencyRateState,
    ],
    (
      accountTreeState,
      accountsState,
      tokenBalancesState,
      tokenRatesState,
      multichainRatesState,
      multichainBalancesState,
      tokensState,
      currencyRateState,
    ): WalletBalance[] => {
      try {
        // Get all wallets from AccountTreeController state
        const wallets = Object.keys(accountTreeState.accountTree.wallets);

        const walletBalances: WalletBalance[] = [];

        for (const entropySource of wallets) {
          const walletSelector = selectBalancesByWallet(entropySource);
          const walletBalance = walletSelector.resultFunc(
            accountTreeState,
            accountsState,
            tokenBalancesState,
            tokenRatesState,
            multichainRatesState,
            multichainBalancesState,
            tokensState,
            currencyRateState,
          );

          walletBalances.push(walletBalance);
        }

        return walletBalances;
      } catch (error) {
        console.error('Error in selectBalancesForAllWallets:', error);
        return [];
      }
    },
  );

/**
 * Creates a memoized selector that returns the balance for the currently selected account group
 *
 * This selector automatically determines the current wallet and group from the selected account
 * in AccountsController, then returns the balance for that group.
 *
 * @returns A memoized selector that returns the currently selected group balance
 */
export const selectBalancesByCurrentlySelectedGroup = () =>
  createSelector(
    [
      selectAccountTreeState,
      selectAccountsState,
      selectTokenBalancesState,
      selectTokenRatesState,
      selectMultichainAssetsRatesState,
      selectMultichainBalancesState,
      selectTokensState,
      selectCurrencyRateState,
    ],
    (
      accountTreeState,
      accountsState,
      tokenBalancesState,
      tokenRatesState,
      multichainRatesState,
      multichainBalancesState,
      tokensState,
      currencyRateState,
    ): AccountGroupBalance | null => {
      try {
        // Get the currently selected account from AccountsController state
        const selectedAccountId =
          accountsState.internalAccounts.selectedAccount;
        if (!selectedAccountId) {
          return null;
        }

        const selectedAccount =
          accountsState.internalAccounts.accounts[selectedAccountId];
        if (!selectedAccount?.options?.entropy) {
          return null;
        }

        // Type assertion needed due to complex union types
        const entropy = selectedAccount.options.entropy as {
          id: string;
          groupIndex: number;
        };
        const { id: entropySource, groupIndex } = entropy;

        // Use the existing selectBalancesByAccountGroup logic
        const groupSelector = selectBalancesByAccountGroup(
          entropySource,
          groupIndex,
        );
        return groupSelector.resultFunc(
          accountTreeState,
          accountsState,
          tokenBalancesState,
          tokenRatesState,
          multichainRatesState,
          multichainBalancesState,
          tokensState,
          currencyRateState,
        );
      } catch (error) {
        console.error(
          'Error in selectBalancesByCurrentlySelectedGroup:',
          error,
        );
        return null;
      }
    },
  );

/**
 * Collection of selectors for assets controllers
 */
export const assetsControllersSelectors = {
  selectBalancesByAccountGroup,
  selectBalancesByWallet,
  selectBalancesForAllWallets,
  selectBalancesByCurrentlySelectedGroup,
};
