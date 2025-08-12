import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountWalletObject } from '@metamask/account-tree-controller';
import type { AccountGroupObject } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { EntropySourceId } from '@metamask/keyring-api';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { Hex } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';
import type { CaipChainId } from '@metamask/utils';
import {
  KnownCaipNamespace,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import { createSelector } from 'reselect';

import type { CurrencyRateState } from '../CurrencyRateController';
import type { MultichainAssetsRatesControllerState } from '../MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from '../MultichainBalancesController';
import type { TokenBalancesControllerState } from '../TokenBalancesController';
import type { TokenRatesControllerState } from '../TokenRatesController';
import type { TokensControllerState } from '../TokensController';

/**
 * Individual controller state selectors using direct state access
 * This avoids new object creation and provides stable references
 * Supports both mobile (state.engine.backgroundState) and extension (state.metamask) structures
 */

/**
 * Helper function to get controller state from different state structures
 *
 * @param state - The application state
 * @param controllerName - The name of the controller
 * @returns The controller state or undefined if not found
 */

const getControllerState = <T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any,
  controllerName: string,
): T => {
  // Mobile structure: state.engine.backgroundState.ControllerName
  if (state?.engine?.backgroundState?.[controllerName]) {
    return state.engine.backgroundState[controllerName];
  }

  // Extension structure: state.metamask.ControllerName
  if (state?.metamask?.[controllerName]) {
    return state.metamask[controllerName];
  }

  // Flat structure (default assets-controllers structure)
  if (state?.[controllerName]) {
    return state[controllerName];
  }

  // Since controllers always have default states, this should never happen
  // but we need to return something for TypeScript
  return state?.[controllerName] as T;
};

/**
 * Selector for AccountTreeController state using direct state access
 *
 * @param state - The application state
 * @returns AccountTreeController state
 */
const selectAccountTreeControllerState = createSelector(
  [(state: unknown) => state],
  (state): AccountTreeControllerState =>
    getControllerState<AccountTreeControllerState>(
      state,
      'AccountTreeController',
    ),
);

/**
 * Selector for AccountsController state using direct state access
 *
 * @param state - The application state
 * @returns AccountsController state
 */
const selectAccountsControllerState = createSelector(
  [(state: unknown) => state],
  (state): AccountsControllerState =>
    getControllerState<AccountsControllerState>(state, 'AccountsController'),
);

/**
 * Selector for TokenBalancesController state using direct state access
 *
 * @param state - The application state
 * @returns TokenBalancesController state
 */
const selectTokenBalancesControllerState = createSelector(
  [(state: unknown) => state],
  (state): TokenBalancesControllerState =>
    getControllerState<TokenBalancesControllerState>(
      state,
      'TokenBalancesController',
    ),
);

/**
 * Selector for TokenRatesController state using direct state access
 *
 * @param state - The application state
 * @returns TokenRatesController state
 */
const selectTokenRatesControllerState = createSelector(
  [(state: unknown) => state],
  (state): TokenRatesControllerState =>
    getControllerState<TokenRatesControllerState>(
      state,
      'TokenRatesController',
    ),
);

/**
 * Selector for MultichainAssetsRatesController state using direct state access
 *
 * @param state - The application state
 * @returns MultichainAssetsRatesController state
 */
const selectMultichainAssetsRatesControllerState = createSelector(
  [(state: unknown) => state],
  (state): MultichainAssetsRatesControllerState =>
    getControllerState<MultichainAssetsRatesControllerState>(
      state,
      'MultichainAssetsRatesController',
    ),
);

/**
 * Selector for MultichainBalancesController state using direct state access
 *
 * @param state - The application state
 * @returns MultichainBalancesController state
 */
const selectMultichainBalancesControllerState = createSelector(
  [(state: unknown) => state],
  (state): MultichainBalancesControllerState =>
    getControllerState<MultichainBalancesControllerState>(
      state,
      'MultichainBalancesController',
    ),
);

/**
 * Selector for TokensController state using direct state access
 *
 * @param state - The application state
 * @returns TokensController state
 */
const selectTokensControllerState = createSelector(
  [(state: unknown) => state],
  (state): TokensControllerState =>
    getControllerState<TokensControllerState>(state, 'TokensController'),
);

/**
 * Selector for CurrencyRateController state using direct state access
 *
 * @param state - The application state
 * @returns CurrencyRateController state
 */
const selectCurrencyRateControllerState = createSelector(
  [(state: unknown) => state],
  (state): CurrencyRateState =>
    getControllerState<CurrencyRateState>(state, 'CurrencyRateController'),
);

/**
 * Unified selector for the enabled network map across platforms.
 * - Mobile: comes from `NetworkEnablementController.enabledNetworkMap` (keys present with true/false)
 * - Extension: comes from `NetworkOrderController.enabledNetworkMap` (keys removed when disabled)
 *
 * TODO: Unify network enablement/order controllers in core and remove this adapter.
 * This temporary solution avoids passing enabled chain IDs from the UI into selectors.
 *
 * @param state - Root application state (mobile or extension) used to locate controller states
 * @returns Enabled network map keyed by namespace, or undefined if not present
 */
const selectUnifiedEnabledNetworkMap = createSelector(
  [(state: unknown) => state],
  (state): Record<string, Record<string, boolean>> | undefined => {
    // Prefer NetworkEnablementController (mobile)
    const enablement = getControllerState<
      | { enabledNetworkMap?: Record<string, Record<string, boolean>> }
      | undefined
    >(state, 'NetworkEnablementController');
    if (enablement?.enabledNetworkMap) {
      return enablement.enabledNetworkMap;
    }

    // Fallback to NetworkOrderController (extension)
    const networkOrder = getControllerState<
      | { enabledNetworkMap?: Record<string, Record<string, boolean>> }
      | undefined
    >(state, 'NetworkOrderController');
    return networkOrder?.enabledNetworkMap;
  },
);

/**
 * Tiny helper to check if a chain is enabled in a platform-agnostic way.
 * - EVM (hex chain IDs) uses the 'eip155' namespace
 * - Non-EVM (CAIP-2 chain IDs) uses the parsed namespace and full CAIP chain ID as the key
 *
 * @param map - Unified enabled network map keyed by namespace
 * @param id - Chain identifier, either hex (EVM) or CAIP-2 chain ID
 * @returns True if the chain is enabled; false otherwise
 */
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
 * Comprehensive selector that calculates all balances for all wallets and groups.
 * This is the single source of truth for all balance calculations.
 * Other selectors will derive from this to ensure proper memoization.
 *
 * @returns Aggregated balance for all wallets
 */
export const selectBalanceForAllWallets = () =>
  createSelector(
    [
      selectAccountTreeControllerState,
      selectAccountsControllerState,
      selectTokenBalancesControllerState,
      selectTokenRatesControllerState,
      selectMultichainAssetsRatesControllerState,
      selectMultichainBalancesControllerState,
      selectTokensControllerState,
      selectCurrencyRateControllerState,
      selectUnifiedEnabledNetworkMap,
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
      enabledNetworkMap,
    ): AllWalletsBalance => {
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

          // Process each account's balances
          for (const account of accounts) {
            const isEvmAccount = isEvmAccountType(account.type);

            if (isEvmAccount) {
              // Handle EVM account balances from TokenBalancesController
              const accountBalances =
                tokenBalancesState.tokenBalances[account.address as Hex];
              if (accountBalances) {
                for (const [chainId, chainBalances] of Object.entries(
                  accountBalances,
                )) {
                  // Skip chains that are not enabled
                  if (!isEvmChainEnabled(chainId as Hex)) {
                    continue;
                  }
                  for (const [tokenAddress, balance] of Object.entries(
                    chainBalances,
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

                    // Use nullish coalescing to handle 0 decimals correctly
                    // and ensure decimals is a valid number to prevent NaN propagation
                    const decimals =
                      typeof token.decimals === 'number' &&
                      !Number.isNaN(token.decimals)
                        ? token.decimals
                        : 18;
                    const balanceInSmallestUnit = parseInt(
                      balance as string,
                      16,
                    );

                    // Skip invalid balance values to prevent NaN propagation
                    if (Number.isNaN(balanceInSmallestUnit)) {
                      continue;
                    }

                    const balanceInTokenUnits =
                      balanceInSmallestUnit / Math.pow(10, decimals);

                    // Get token rate in native currency from TokenRatesController
                    const chainMarketData =
                      tokenRatesState.marketData[chainId as Hex];
                    const tokenMarketData =
                      chainMarketData?.[tokenAddress as Hex];
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
                        groupTotalBalance += balanceInUserCurrency;
                      }
                    }
                  }
                }
              }
            } else {
              // Handle non-EVM account balances from MultichainBalancesController
              const accountBalances =
                multichainBalancesState.balances[account.id];
              if (accountBalances) {
                for (const [assetId, balanceData] of Object.entries(
                  accountBalances,
                )) {
                  // Skip assets whose chain is not enabled
                  if (!isAssetChainEnabled(assetId as CaipAssetType)) {
                    continue;
                  }

                  const balanceAmount = parseFloat(balanceData.amount);

                  // Skip invalid balance values to prevent NaN propagation
                  if (Number.isNaN(balanceAmount)) {
                    continue;
                  }

                  // Get conversion rate for this asset (already in user currency)
                  const conversionRate =
                    multichainRatesState.conversionRates[
                      assetId as CaipAssetType
                    ];
                  if (conversionRate) {
                    const conversionRateValue = parseFloat(conversionRate.rate);

                    // Skip invalid conversion rate values to prevent NaN propagation
                    if (Number.isNaN(conversionRateValue)) {
                      continue;
                    }

                    // MultichainAssetsRatesController already provides rates in user currency
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
 * Selector to get aggregated balances for a specific account group.
 * Derives from the comprehensive selector to ensure proper memoization.
 *
 * @param groupId - The account group ID (format: "walletId/groupIndex", e.g., "entropy:entropy-source-1/0")
 * @returns Aggregated balance for the account group
 */
export const selectBalanceByAccountGroup = (groupId: string) =>
  createSelector(
    [selectBalanceForAllWallets()],
    (allBalances): AccountGroupBalance => {
      const walletId = groupId.split('/')[0] as EntropySourceId;
      const wallet = allBalances.wallets[walletId];

      if (!wallet || !wallet.groups[groupId]) {
        return {
          walletId,
          groupId,
          totalBalanceInUserCurrency: 0,
          userCurrency: allBalances.userCurrency,
        };
      }

      return wallet.groups[groupId];
    },
  );

/**
 * Selector to get aggregated balances for all account groups in a wallet.
 * Derives from the comprehensive selector to ensure proper memoization.
 *
 * @param walletId - The wallet ID (entropy source)
 * @returns Aggregated balance for all groups in the wallet
 */
export const selectBalanceByWallet = (walletId: EntropySourceId) =>
  createSelector(
    [selectBalanceForAllWallets()],
    (allBalances): WalletBalance => {
      const wallet = allBalances.wallets[walletId];

      if (!wallet) {
        return {
          walletId,
          groups: {},
          totalBalanceInUserCurrency: 0,
          userCurrency: allBalances.userCurrency,
        };
      }

      return wallet;
    },
  );

/**
 * Selector to get aggregated balances for the currently selected account group.
 * Derives from the comprehensive selector to ensure proper memoization.
 *
 * @returns Aggregated balance for the currently selected group
 */
export const selectBalanceForSelectedAccountGroup = () =>
  createSelector(
    [selectAccountTreeControllerState, selectBalanceForAllWallets()],
    (accountTreeState, allBalances): AccountGroupBalance | null => {
      const selectedGroupId = accountTreeState.accountTree.selectedAccountGroup;

      if (!selectedGroupId) {
        return null;
      }

      const walletId = selectedGroupId.split('/')[0] as EntropySourceId;
      const wallet = allBalances.wallets[walletId];

      if (!wallet || !wallet.groups[selectedGroupId]) {
        return {
          walletId,
          groupId: selectedGroupId,
          totalBalanceInUserCurrency: 0,
          userCurrency: allBalances.userCurrency,
        };
      }

      return wallet.groups[selectedGroupId];
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
