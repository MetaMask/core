import type { AccountGroupId } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { convertHexToDecimal } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { createSelector } from 'reselect';

import type { CurrencyRateState } from '../CurrencyRateController';
import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { MultichainAssetsRatesControllerState } from '../MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from '../MultichainBalancesController';
import type { TokenBalancesControllerState } from '../TokenBalancesController';
import type { Token, TokenRatesControllerState } from '../TokenRatesController';
import type { TokensControllerState } from '../TokensController';

export type AssetsByAccountGroup = {
  [accountGroupId: AccountGroupId]: AccountGroupAssets;
};

export type AccountGroupAssets = {
  [network: string]: Asset[];
};

export type Asset = {
  // TODO: It's unclear whether this type will be needed, ideally the UI should not need to know about it
  type: 'evm' | 'multichain';
  // TODO: This is the address for evm tokens and the assetId for multichain tokens
  assetId: string;
  icon: string | undefined;
  name: string;
  symbol: string;
  decimals: number;
  balance: number | undefined;
  fiatBalance?:
    | {
        price: number;
        currency: string;
      }
    | undefined;
};

const selectAllEvmTokens = (state: TokensControllerState) => state.allTokens;

const selectIgnoredEvmTokens = (state: TokensControllerState) =>
  state.allIgnoredTokens;

const selectAllMultichainTokens = (state: MultichainAssetsControllerState) =>
  state.accountsAssets;

const selectAllMultichainAssetsMetadata = (
  state: MultichainAssetsControllerState,
) => state.assetsMetadata;

const selectAccountTree = (state: AccountTreeControllerState) =>
  state.accountTree;

// TODO: We would not need internalAccounts if evmTokens state had the accountId
const selectInternalAccounts = (state: AccountsControllerState) =>
  state.internalAccounts;

const selectTokenBalances = (state: TokenBalancesControllerState) =>
  state.tokenBalances;

const selectMarketData = (state: TokenRatesControllerState) => state.marketData;

const selectMultichainBalances = (state: MultichainBalancesControllerState) =>
  state.balances;

const selectMultichainConversionRates = (
  state: MultichainAssetsRatesControllerState,
) => state.conversionRates;

const selectCurrencyRates = (state: CurrencyRateState) => state.currencyRates;

const selectCurrentCurrency = (state: CurrencyRateState) =>
  state.currentCurrency;

export const selectAccountsToGroupIdMap = createSelector(
  [selectAccountTree, selectInternalAccounts],
  (accountTree, internalAccounts) => {
    const accountsMap: Record<string, AccountGroupId> = {};
    for (const { groups } of Object.values(accountTree.wallets)) {
      for (const { id: accountGroupId, accounts } of Object.values(groups)) {
        for (const accountId of accounts) {
          const internalAccount = internalAccounts.accounts[accountId];

          accountsMap[
            // TODO: We would not need internalAccounts if evmTokens state had the accountId
            internalAccount.type.startsWith('eip155')
              ? internalAccount.address
              : accountId
          ] = accountGroupId;
        }
      }
    }

    return accountsMap;
  },
);

const selectAllEvmAssets = createSelector(
  [
    selectAccountsToGroupIdMap,
    selectAllEvmTokens,
    selectIgnoredEvmTokens,
    selectTokenBalances,
    selectMarketData,
    selectCurrencyRates,
    selectCurrentCurrency,
  ],
  (
    accountsMap,
    evmTokens,
    ignoredEvmTokens,
    tokenBalances,
    marketData,
    currencyRates,
    currentCurrency,
  ) => {
    const groupAssets: AssetsByAccountGroup = {};

    for (const [chainId, chainTokens] of Object.entries(evmTokens) as [
      Hex,
      { [key: string]: Token[] },
    ][]) {
      for (const [accountAddress, addressTokens] of Object.entries(
        chainTokens,
      ) as [Hex, Token[]][]) {
        for (const token of addressTokens) {
          const tokenAddress = token.address as Hex;
          const accountGroupId = accountsMap[accountAddress];
          if (!accountGroupId) {
            // TODO: This should not happen and we should log an error
            continue;
          }

          if (
            ignoredEvmTokens[chainId]?.[accountAddress]?.includes(tokenAddress)
          ) {
            continue;
          }

          if (!groupAssets[accountGroupId]) {
            groupAssets[accountGroupId] = {};
          }

          let groupChainAssets = groupAssets[accountGroupId][chainId];
          if (!groupChainAssets) {
            groupChainAssets = [];
            groupAssets[accountGroupId][chainId] = groupChainAssets;
          }

          const rawBalance =
            tokenBalances[accountAddress]?.[chainId]?.[tokenAddress];

          const fiatBalance = getFiatBalanceForEvmToken(
            rawBalance,
            token.decimals,
            marketData,
            currencyRates,
            currentCurrency,
            chainId,
            tokenAddress,
          );

          groupChainAssets.push({
            type: 'evm',
            assetId: token.address,
            icon: token.image,
            name: token.name ?? token.symbol,
            symbol: token.symbol,
            decimals: token.decimals,
            balance: rawBalance ? convertHexToDecimal(rawBalance) : undefined,
            fiatBalance,
          });
        }
      }
    }

    return groupAssets;
  },
);

const selectAllMultichainAssets = createSelector(
  [
    selectAccountsToGroupIdMap,
    selectAllMultichainTokens,
    selectAllMultichainAssetsMetadata,
    selectMultichainBalances,
    selectMultichainConversionRates,
    selectCurrencyRates,
    selectCurrentCurrency,
  ],
  (
    accountsMap,
    multichainTokens,
    multichainAssetsMetadata,
    multichainBalances,
    multichainConversionRates,
    _currencyRates,
    currentCurrency,
  ) => {
    const groupAssets: AssetsByAccountGroup = {};

    for (const [accountId, accountAssets] of Object.entries(multichainTokens)) {
      for (const assetId of accountAssets) {
        // TODO: We need a safe way to extract each part of the id (in case of multiple / characters)
        const [chainId, asset] = assetId.split('/');

        const accountGroupId = accountsMap[accountId];
        const assetMetadata = multichainAssetsMetadata[assetId];
        if (!accountGroupId || !assetMetadata) {
          // TODO: This should not happen and we should log an error
          continue;
        }

        if (!groupAssets[accountGroupId]) {
          groupAssets[accountGroupId] = {};
        }

        let groupChainAssets = groupAssets[accountGroupId][chainId];
        if (!groupChainAssets) {
          groupChainAssets = [];
          groupAssets[accountGroupId][chainId] = groupChainAssets;
        }

        const balance:
          | {
              amount: string;
              unit: string;
            }
          | undefined = multichainBalances[accountId]?.[assetId];

        const fiatBalance = getFiatBalanceForMultichainAsset(
          balance,
          multichainConversionRates,
          currentCurrency,
          assetId,
        );

        // TODO: We shouldn't have to rely on fallbacks for name and symbol, they should not be optional
        groupChainAssets.push({
          type: 'multichain',
          assetId,
          icon: assetMetadata.iconUrl,
          name: assetMetadata.name ?? assetMetadata.symbol ?? asset,
          symbol: assetMetadata.symbol ?? '',
          decimals:
            assetMetadata.units.find(
              (unit) =>
                unit.name === assetMetadata.name &&
                unit.symbol === assetMetadata.symbol,
            )?.decimals ?? 0,
          balance: balance ? Number(balance.amount) : undefined,
          fiatBalance,
        });
      }
    }

    return groupAssets;
  },
);

export const selectAllAssets = createSelector(
  [selectAllEvmAssets, selectAllMultichainAssets],
  (evmAssets, multichainAssets) => {
    const groupAssets: AssetsByAccountGroup = {
      ...evmAssets,
    };

    for (const [accountGroupId, accountAssets] of Object.entries(
      multichainAssets,
    ) as [AccountGroupId, AccountGroupAssets][]) {
      const existingAssets = groupAssets[accountGroupId];

      if (!existingAssets) {
        groupAssets[accountGroupId] = accountAssets;
      } else {
        groupAssets[accountGroupId] = {
          ...existingAssets,
          ...accountAssets,
        };
      }
    }

    return groupAssets;
  },
);

export const selectAssetsBySelectedAccountGroup = createSelector(
  [selectAllAssets, selectAccountTree],
  (groupAssets, accountTree) => {
    const { selectedAccountGroup } = accountTree;
    if (!selectedAccountGroup) {
      return {};
    }
    return groupAssets[selectedAccountGroup] || {};
  },
);

/**
 * @param rawBalance - The balance of the token
 * @param decimals - The decimals of the token
 * @param marketData - The market data for the token
 * @param currencyRates - The currency rates for the token
 * @param currentCurrency - The current currency
 * @param chainId - The chain id of the token
 * @param tokenAddress - The address of the token
 * @returns The price and currency of the token in the current currency
 */
function getFiatBalanceForEvmToken(
  rawBalance: Hex | undefined,
  decimals: number,
  marketData: ReturnType<typeof selectMarketData>,
  currencyRates: ReturnType<typeof selectCurrencyRates>,
  currentCurrency: ReturnType<typeof selectCurrentCurrency>,
  chainId: Hex,
  tokenAddress: Hex,
) {
  if (!rawBalance) {
    return undefined;
  }

  const tokenMarketData = marketData[chainId]?.[tokenAddress];

  if (!tokenMarketData) {
    return undefined;
  }

  const currencyRate = currencyRates[tokenMarketData.currency];

  if (!currencyRate?.conversionRate) {
    return undefined;
  }

  return {
    price:
      (convertHexToDecimal(rawBalance) / 10 ** decimals) *
      tokenMarketData.price *
      currencyRate.conversionRate,
    currency: currentCurrency,
  };
}

/**
 * @param balance - The balance of the asset, in the format { amount: string; unit: string }
 * @param balance.amount - The amount of the balance
 * @param balance.unit - The unit of the balance
 * @param multichainConversionRates - The conversion rates for the multichain asset
 * @param currentCurrency - The current currency
 * @param assetId - The asset id of the asset
 * @returns The price and currency of the token in the current currency
 */
function getFiatBalanceForMultichainAsset(
  balance: { amount: string; unit: string } | undefined,
  multichainConversionRates: ReturnType<typeof selectMultichainConversionRates>,
  currentCurrency: ReturnType<typeof selectCurrentCurrency>,
  assetId: `${string}:${string}/${string}:${string}`,
) {
  if (!balance) {
    return undefined;
  }

  const assetMarketData = multichainConversionRates[assetId];

  if (!assetMarketData?.rate) {
    return undefined;
  }

  return {
    price: Number(balance.amount) * Number(assetMarketData.rate),
    currency: currentCurrency,
  };
}
