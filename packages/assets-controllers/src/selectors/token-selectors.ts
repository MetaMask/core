import type { AccountGroupId } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { convertHexToDecimal } from '@metamask/controller-utils';
import { hexToBigInt, type Hex } from '@metamask/utils';
import { createSelector } from 'reselect';

import { stringifyBalanceWithDecimals } from './stringify-balance';
import type { CurrencyRateState } from '../CurrencyRateController';
import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { MultichainAssetsRatesControllerState } from '../MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from '../MultichainBalancesController';
import type { TokenBalancesControllerState } from '../TokenBalancesController';
import type { Token, TokenRatesControllerState } from '../TokenRatesController';
import type { TokensControllerState } from '../TokensController';

type AssetsByAccountGroup = {
  [accountGroupId: AccountGroupId]: AccountGroupAssets;
};

export type AccountGroupAssets = {
  [network: string]: Asset[];
};

export type Asset = (
  | {
      type: 'evm';
      assetId: Hex; // This is also the address for EVM tokens
      address: Hex;
      chainId: Hex;
    }
  | {
      type: 'multichain';
      assetId: `${string}:${string}/${string}:${string}`;
      chainId: `${string}:${string}`;
    }
) & {
  image: string; // TODO: This should also allow undefined at this stage for evm tokens, but it improves compatibility with FE types for now
  name: string;
  symbol: string;
  decimals: number;
  // TODO: Since this is not the raw balance, but decimal one, we need to decide whether we want this as a number so that it can be formatted later
  balance: string | undefined;
  fiat:
    | {
        balance: number;
        currency: string;
        conversionRate: number;
      }
    | undefined;
  // TODO: Potentially add accountId
};

export type AssetListState = {
  accountTree: AccountTreeControllerState['accountTree'];
  internalAccounts: AccountsControllerState['internalAccounts'];
  allTokens: TokensControllerState['allTokens'];
  allIgnoredTokens: TokensControllerState['allIgnoredTokens'];
  tokenBalances: TokenBalancesControllerState['tokenBalances'];
  marketData: TokenRatesControllerState['marketData'];
  currencyRates: CurrencyRateState['currencyRates'];
  accountsAssets: MultichainAssetsControllerState['accountsAssets'];
  assetsMetadata: MultichainAssetsControllerState['assetsMetadata'];
  balances: MultichainBalancesControllerState['balances'];
  conversionRates: MultichainAssetsRatesControllerState['conversionRates'];
  currentCurrency: CurrencyRateState['currentCurrency'];
  accountsByChainId: Record<
    Hex,
    Record<
      Hex,
      {
        balance: Hex | null;
      }
    >
  >;
};

const createAssetListSelector = createSelector.withTypes<AssetListState>();

const selectAccountsToGroupIdMap = createAssetListSelector(
  [(state) => state.accountTree, (state) => state.internalAccounts],
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

// TODO: This will not be needed once the native balances are part of the evm tokens state
const selectAllEvmAccountNativeBalances = createAssetListSelector(
  [
    selectAccountsToGroupIdMap,
    (state) => state.accountsByChainId,
    (state) => state.marketData,
    (state) => state.currencyRates,
    (state) => state.currentCurrency,
  ],
  (
    accountsMap,
    accountsByChainId,
    marketData,
    currencyRates,
    currentCurrency,
  ) => {
    const groupAssets: AssetsByAccountGroup = {};

    for (const [chainId, chainAccounts] of Object.entries(
      accountsByChainId,
    ) as [Hex, Record<Hex, { balance: Hex | null }>][]) {
      for (const [accountAddress, accountBalance] of Object.entries(
        chainAccounts,
      )) {
        const accountGroupId = accountsMap[accountAddress];
        if (!accountGroupId) {
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

        const rawBalance = accountBalance.balance || undefined;

        // TODO: This is just a bad placeholder that will be removed once this whole selector is removed
        const nativeToken = {
          address: '0x0000000000000000000000000000000000000000' as Hex,
          decimals: 18,
          image: './images/eth_logo.svg',
          name: 'Ethereum',
          symbol: 'ETH',
        };

        const fiatData = getFiatBalanceForEvmToken(
          rawBalance,
          nativeToken.decimals,
          marketData,
          currencyRates,
          chainId,
          nativeToken.address,
        );

        groupChainAssets.push({
          type: 'evm',
          assetId: nativeToken.address,
          address: nativeToken.address,
          image: nativeToken.image,
          name: nativeToken.name,
          symbol: nativeToken.symbol,
          decimals: nativeToken.decimals,
          balance: rawBalance
            ? stringifyBalanceWithDecimals(
                hexToBigInt(rawBalance),
                nativeToken.decimals,
              )
            : undefined,
          fiat: fiatData
            ? {
                balance: fiatData.balance,
                currency: currentCurrency,
                conversionRate: fiatData.conversionRate,
              }
            : undefined,
          chainId,
        });
      }
    }

    return groupAssets;
  },
);

const selectAllEvmAssets = createAssetListSelector(
  [
    selectAccountsToGroupIdMap,
    (state) => state.allTokens,
    (state) => state.allIgnoredTokens,
    (state) => state.tokenBalances,
    (state) => state.marketData,
    (state) => state.currencyRates,
    (state) => state.currentCurrency,
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

          const rawBalance =
            tokenBalances[accountAddress]?.[chainId]?.[tokenAddress];

          if (!rawBalance) {
            continue;
          }

          const displayBalance = stringifyBalanceWithDecimals(
            hexToBigInt(rawBalance),
            token.decimals,
          );

          if (!groupAssets[accountGroupId]) {
            groupAssets[accountGroupId] = {};
          }

          let groupChainAssets = groupAssets[accountGroupId][chainId];
          if (!groupChainAssets) {
            groupChainAssets = [];
            groupAssets[accountGroupId][chainId] = groupChainAssets;
          }

          const fiatData = getFiatBalanceForEvmToken(
            rawBalance,
            token.decimals,
            marketData,
            currencyRates,
            chainId,
            tokenAddress,
          );

          groupChainAssets.push({
            type: 'evm',
            assetId: tokenAddress,
            address: tokenAddress,
            image: token.image ?? '',
            name: token.name ?? token.symbol,
            symbol: token.symbol,
            decimals: token.decimals,
            balance: displayBalance,
            fiat: fiatData
              ? {
                  balance: fiatData.balance,
                  currency: currentCurrency,
                  conversionRate: fiatData.conversionRate,
                }
              : undefined,
            chainId,
          });
        }
      }
    }

    return groupAssets;
  },
);

const selectAllMultichainAssets = createAssetListSelector(
  [
    selectAccountsToGroupIdMap,
    (state) => state.accountsAssets,
    (state) => state.assetsMetadata,
    (state) => state.balances,
    (state) => state.conversionRates,
    (state) => state.currentCurrency,
  ],
  (
    accountsMap,
    multichainTokens,
    multichainAssetsMetadata,
    multichainBalances,
    multichainConversionRates,
    currentCurrency,
  ) => {
    const groupAssets: AssetsByAccountGroup = {};

    for (const [accountId, accountAssets] of Object.entries(multichainTokens)) {
      for (const assetId of accountAssets) {
        // TODO: We need a safe way to extract each part of the id (in case of multiple / characters)
        const [chainId, asset] = assetId.split('/') as [
          `${string}:${string}`,
          `${string}:${string}`,
        ];

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

        const fiatData = getFiatBalanceForMultichainAsset(
          balance,
          multichainConversionRates,
          assetId,
        );

        // TODO: We shouldn't have to rely on fallbacks for name and symbol, they should not be optional
        groupChainAssets.push({
          type: 'multichain',
          assetId,
          image: assetMetadata.iconUrl,
          name: assetMetadata.name ?? assetMetadata.symbol ?? asset,
          symbol: assetMetadata.symbol ?? '',
          decimals:
            assetMetadata.units.find(
              (unit) =>
                unit.name === assetMetadata.name &&
                unit.symbol === assetMetadata.symbol,
            )?.decimals ?? 0,
          balance: balance ? balance.amount : undefined,
          fiat: fiatData
            ? {
                balance: fiatData.balance,
                currency: currentCurrency,
                conversionRate: fiatData.conversionRate,
              }
            : undefined,
          chainId,
        });
      }
    }

    return groupAssets;
  },
);

const selectAllAssets = createAssetListSelector(
  [
    selectAllEvmAssets,
    selectAllMultichainAssets,
    selectAllEvmAccountNativeBalances,
  ],
  (evmAssets, multichainAssets, evmAccountNativeBalances) => {
    const groupAssets: AssetsByAccountGroup = {};

    mergeAssets(groupAssets, evmAssets);

    mergeAssets(groupAssets, multichainAssets);

    mergeAssets(groupAssets, evmAccountNativeBalances);

    return groupAssets;
  },
);

export const selectAssetsBySelectedAccountGroup = createAssetListSelector(
  [selectAllAssets, (state) => state.accountTree],
  (groupAssets, accountTree) => {
    const { selectedAccountGroup } = accountTree;
    if (!selectedAccountGroup) {
      return {};
    }
    return groupAssets[selectedAccountGroup] || {};
  },
);

// TODO: Once native assets are part of the evm tokens state, this function can be simplified as chains will always be unique
/**
 * Merges the new assets into the existing assets
 *
 * @param existingAssets - The existing assets
 * @param newAssets - The new assets
 */
function mergeAssets(
  existingAssets: AssetsByAccountGroup,
  newAssets: AssetsByAccountGroup,
) {
  for (const [accountGroupId, accountAssets] of Object.entries(newAssets) as [
    AccountGroupId,
    AccountGroupAssets,
  ][]) {
    const existingAccountGroupAssets = existingAssets[accountGroupId];

    if (!existingAccountGroupAssets) {
      existingAssets[accountGroupId] = accountAssets;
    } else {
      for (const [network, chainAssets] of Object.entries(accountAssets)) {
        const existingNetworkAssets = existingAccountGroupAssets[network];
        if (!existingNetworkAssets) {
          existingAccountGroupAssets[network] = chainAssets;
        } else {
          existingAccountGroupAssets[network] = [
            ...existingNetworkAssets,
            ...chainAssets,
          ];
        }
      }
    }
  }
}

/**
 * @param rawBalance - The balance of the token
 * @param decimals - The decimals of the token
 * @param marketData - The market data for the token
 * @param currencyRates - The currency rates for the token
 * @param chainId - The chain id of the token
 * @param tokenAddress - The address of the token
 * @returns The price and currency of the token in the current currency
 */
function getFiatBalanceForEvmToken(
  rawBalance: Hex | undefined,
  decimals: number,
  marketData: TokenRatesControllerState['marketData'],
  currencyRates: CurrencyRateState['currencyRates'],
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

  const fiatBalance =
    (convertHexToDecimal(rawBalance) / 10 ** decimals) *
    tokenMarketData.price *
    currencyRate.conversionRate;

  return {
    balance: fiatBalance,
    conversionRate: currencyRate.conversionRate,
  };
}

/**
 * @param balance - The balance of the asset, in the format { amount: string; unit: string }
 * @param balance.amount - The amount of the balance
 * @param balance.unit - The unit of the balance
 * @param multichainConversionRates - The conversion rates for the multichain asset
 * @param assetId - The asset id of the asset
 * @returns The price and currency of the token in the current currency
 */
function getFiatBalanceForMultichainAsset(
  balance: { amount: string; unit: string } | undefined,
  multichainConversionRates: MultichainAssetsRatesControllerState['conversionRates'],
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
    balance: Number(balance.amount) * Number(assetMarketData.rate),
    conversionRate: Number(assetMarketData.rate),
  };
}
