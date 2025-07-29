import { createSelector } from 'reselect';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { isEvmAccountType, type Bip44Account } from '@metamask/keyring-api';
import type { CaipAssetType } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import type { EntropySourceId } from '@metamask/account-api';

// Import controller state types
import type { TokenBalancesControllerState } from './TokenBalancesController';
import type { CurrencyRateState } from './CurrencyRateController';
import type { TokenRatesControllerState } from './TokenRatesController';
import type { MultichainAssetsRatesControllerState } from './MultichainAssetsRatesController/MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from './MultichainBalancesController/MultichainBalancesController';

// Import MultichainAccountService types
import type { 
  MultichainAccountServiceGetMultichainAccountAction,
  MultichainAccountServiceGetMultichainAccountsAction 
} from '@metamask/multichain-account-service';

// Base selectors for accessing individual controller states
const selectTokenBalancesState = (state: any) => 
  state.TokenBalancesController as TokenBalancesControllerState;

const selectCurrencyRateState = (state: any) => 
  state.CurrencyRateController as CurrencyRateState;

const selectTokenRatesState = (state: any) => 
  state.TokenRatesController as TokenRatesControllerState;

const selectMultichainAssetsRatesState = (state: any) => 
  state.MultichainAssetsRatesController as MultichainAssetsRatesControllerState;

const selectMultichainBalancesState = (state: any) => 
  state.MultichainBalancesController as MultichainBalancesControllerState;

// Selector to access messenger for MultichainAccountService
const selectMessenger = (state: any) => state.messenger;

/**
 * Helper function to get internal accounts for a specific account group using MultichainAccountService
 * @param messenger - The messenger instance
 * @param entropySource - The entropy source ID (wallet ID)
 * @param groupIndex - The group index within the wallet
 * @returns Array of internal accounts in the group
 */
const getInternalAccountsForGroup = (
  messenger: any,
  entropySource: EntropySourceId,
  groupIndex: number
): Bip44Account<InternalAccount>[] => {
  try {
    // Get the multichain account for this group
    const multichainAccount = messenger.call(
      'MultichainAccountService:getMultichainAccount',
      { entropySource, groupIndex }
    );
    
    // Extract all internal accounts from the multichain account
    return multichainAccount.getAccounts();
  } catch (error) {
    console.error('Error getting accounts for group:', { entropySource, groupIndex }, error);
    return [];
  }
};

/**
 * Extract EVM address from account
 * @param account - The internal account
 * @returns EVM address as Hex string
 */
const extractEvmAddress = (account: Bip44Account<InternalAccount>): Hex => {
  return account.address as Hex;
};

/**
 * Extract Solana account ID from account
 * @param account - The internal account  
 * @returns Solana account ID
 */
const extractSolanaAccountId = (account: Bip44Account<InternalAccount>): string => {
  return account.id;
};

/**
 * Convert EVM token balance to ETH equivalent using TokenRatesController
 * @param balance - Raw token balance as hex string
 * @param tokenAddress - Token contract address
 * @param chainId - Chain ID as hex
 * @param tokenRatesState - TokenRatesController state
 * @param decimals - Token decimals (default 18)
 * @returns ETH equivalent amount
 */
const convertEvmBalanceToEth = (
  balance: string,
  tokenAddress: string,
  chainId: Hex,
  tokenRatesState: TokenRatesControllerState,
  decimals: number = 18
): number => {
  try {
    const chainData = tokenRatesState.marketData[chainId];
    if (!chainData || !chainData[tokenAddress]) {
      return 0;
    }
    
    const tokenRate = chainData[tokenAddress];
    if (!tokenRate || !tokenRate.price) {
      return 0;
    }
    
    // Convert balance from wei/smallest unit to token amount
    const balanceNumber = parseInt(balance, 16) / Math.pow(10, decimals);
    
    // Convert to ETH equivalent using token rate
    return balanceNumber * tokenRate.price;
  } catch (error) {
    console.error('Error converting EVM balance to ETH:', error);
    return 0;
  }
};

/**
 * Convert ETH amount to user's selected currency using CurrencyRateController
 * @param ethAmount - Amount in ETH
 * @param currencyRateState - CurrencyRateController state
 * @returns Amount in user's selected currency
 */
const convertEthToUserCurrency = (
  ethAmount: number,
  currencyRateState: CurrencyRateState
): number => {
  try {
    const ethRateData = currencyRateState.currencyRates['ETH'];
    
    if (!ethRateData || !ethRateData.conversionRate) {
      return 0;
    }
    
    return ethAmount * ethRateData.conversionRate;
  } catch (error) {
    console.error('Error converting ETH to user currency:', error);
    return 0;
  }
};

/**
 * Convert Solana balance to user's selected currency using MultichainAssetsRatesController
 * @param balance - Balance amount as string
 * @param assetId - CAIP asset ID
 * @param multichainRatesState - MultichainAssetsRatesController state
 * @returns Amount in user's selected currency
 */
const convertSolanaBalanceToUserCurrency = (
  balance: string,
  assetId: CaipAssetType,
  multichainRatesState: MultichainAssetsRatesControllerState
): number => {
  try {
    const conversionRate = multichainRatesState.conversionRates[assetId];
    
    if (!conversionRate || !conversionRate.rate) {
      return 0;
    }
    
    const balanceNumber = parseFloat(balance);
    return balanceNumber * conversionRate.rate;
  } catch (error) {
    console.error('Error converting Solana balance to user currency:', error);
    return 0;
  }
};

/**
 * Creates a memoized selector that returns the fiat-denominated aggregated balance 
 * for a given account group across EVM and Solana internal accounts using MultichainAccountService.
 * 
 * The selector performs the following operations:
 * 1. Uses MultichainAccountService to get internal accounts for the specified group
 * 2. Extracts EVM addresses and Solana account IDs from accounts
 * 3. Matches accounts to controller balance states (TokenBalances for EVM, MultichainBalances for Solana)
 * 4. Converts EVM balances to ETH using TokenRateController, then to fiat using CurrencyRateController
 * 5. Converts Solana balances to fiat using MultichainAssetRateController
 * 6. Returns aggregated balance in user's selected currency
 * 
 * @param entropySource - The entropy source ID (wallet identifier)
 * @param groupIndex - The group index within the wallet (0-based)
 * @returns A memoized selector function that returns:
 *   - groupId: String combining entropySource and groupIndex
 *   - aggregatedBalance: Total balance in user's selected currency (not formatted)
 *   - currency: The user's selected currency code (e.g., 'USD', 'EUR')
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
export const selectBalancesByAccountGroup = (
  entropySource: EntropySourceId,
  groupIndex: number
) =>
  createSelector(
    [
      selectMessenger,
      selectTokenBalancesState,
      selectCurrencyRateState,
      selectTokenRatesState,
      selectMultichainAssetsRatesState,
      selectMultichainBalancesState,
    ],
    (
      messenger,
      tokenBalancesState,
      currencyRateState,
      tokenRatesState,
      multichainRatesState,
      multichainBalancesState
    ) => {
      const groupId = `${entropySource}-${groupIndex}`;
      
      try {
        // Step 1: Get internal accounts for the group using MultichainAccountService
        const groupAccounts = getInternalAccountsForGroup(
          messenger,
          entropySource,
          groupIndex
        );
        
        if (groupAccounts.length === 0) {
          return {
            groupId,
            aggregatedBalance: 0,
            currency: currencyRateState.currentCurrency,
          };
        }

        let totalBalance = 0;
        const currentCurrency = currencyRateState.currentCurrency;

        // Step 2: Process each account in the group
        for (const account of groupAccounts) {
          if (isEvmAccountType(account.type)) {
            // Handle EVM accounts
            const evmAddress = extractEvmAddress(account);
            
            // Get account balances across all chains from TokenBalancesController
            const accountBalances = tokenBalancesState.tokenBalances[evmAddress];
            
            if (accountBalances) {
              for (const [chainId, chainBalances] of Object.entries(accountBalances)) {
                for (const [tokenAddress, balance] of Object.entries(chainBalances)) {
                  // Convert token balance to ETH equivalent
                  const ethEquivalent = convertEvmBalanceToEth(
                    balance,
                    tokenAddress,
                    chainId as Hex,
                    tokenRatesState
                  );
                  
                  // Convert ETH to user's selected currency
                  const currencyAmount = convertEthToUserCurrency(
                    ethEquivalent,
                    currencyRateState
                  );
                  
                  totalBalance += currencyAmount;
                }
              }
            }
          } else {
            // Handle Solana accounts
            const accountId = extractSolanaAccountId(account);
            
            // Get Solana balances from MultichainBalancesController
            const solanaBalances = multichainBalancesState.balances[accountId];
            
            if (solanaBalances) {
              for (const [assetId, balanceData] of Object.entries(solanaBalances)) {
                const currencyAmount = convertSolanaBalanceToUserCurrency(
                  balanceData.amount,
                  assetId as CaipAssetType,
                  multichainRatesState
                );
                
                totalBalance += currencyAmount;
              }
            }
          }
        }

        return {
          groupId,
          aggregatedBalance: totalBalance,
          currency: currentCurrency,
        };
      } catch (error) {
        console.error('Error calculating aggregated balance for group:', groupId, error);
        return {
          groupId,
          aggregatedBalance: 0,
          currency: currencyRateState.currentCurrency,
        };
      }
    }
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
 * Collection of selectors for assets controllers
 */
export const assetsControllersSelectors = {
  selectBalancesByAccountGroup,
};

// Export individual selector for direct use
export { selectBalancesByAccountGroup };

// Export types
export type { AccountGroupBalance, AccountGroupBalanceParams };