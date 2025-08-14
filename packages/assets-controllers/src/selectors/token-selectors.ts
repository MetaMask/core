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

export type AssetsByAccountGroup = {
  [accountGroupId: AccountGroupId]: AccountGroupAssets;
};

export type AccountGroupAssets = {
  [network: string]: Asset[];
};

export type Asset = (
  | {
      type: 'evm';
      assetId: Hex; // TODO: This is the address for EVM tokens
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
  balance: string | undefined; // TODO: Change to number for consistency
  fiatBalance: string | undefined; // TODO: Change to number as it's being converted anyway before displaying
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

const selectEvmAccountNativeBalances = (state: {
  accountsByChainId: Record<
    Hex,
    Record<
      Hex,
      {
        balance: Hex | null;
      }
    >
  >;
}) => state.accountsByChainId;

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

const selectAllEvmAccountNativeBalances = createSelector(
  [
    selectAccountsToGroupIdMap,
    selectEvmAccountNativeBalances,
    selectMarketData,
    selectCurrencyRates,
  ],
  (accountsMap, accountsByChainId, marketData, currencyRates) => {
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

        // TODO: This should not be hardcoded, but fetched from the network config
        const nativeToken = {
          address: '0x0000000000000000000000000000000000000000' as Hex,
          decimals: 18,
          image: './images/eth_logo.svg',
          name: 'Ethereum',
          symbol: 'ETH',
        };

        const fiatBalance = getFiatBalanceForEvmToken(
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
          fiatBalance,
          chainId,
        });
      }
    }

    return groupAssets;
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

          const fiatBalance = getFiatBalanceForEvmToken(
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
            fiatBalance,
            chainId,
          });
        }
      }
    }

    console.log('EVMASSETS FROM SELECTOR', groupAssets);
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
  ],
  (
    accountsMap,
    multichainTokens,
    multichainAssetsMetadata,
    multichainBalances,
    multichainConversionRates,
    _currencyRates,
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

        const fiatBalance = getFiatBalanceForMultichainAsset(
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
          fiatBalance,
          chainId,
        });
      }
    }

    return groupAssets;
  },
);

export const selectAllAssets = createSelector(
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

export const selectAssetsBySelectedAccountGroup = createSelector(
  [selectAllAssets, selectAccountTree],
  (groupAssets, accountTree) => {
    const { selectedAccountGroup } = accountTree;
    if (!selectedAccountGroup) {
      return {};
    }
    console.log('ALL ASSETS', groupAssets);
    return groupAssets[selectedAccountGroup] || {};
  },
);

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
  marketData: ReturnType<typeof selectMarketData>,
  currencyRates: ReturnType<typeof selectCurrencyRates>,
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

  return (
    (convertHexToDecimal(rawBalance) / 10 ** decimals) *
    tokenMarketData.price *
    currencyRate.conversionRate
  ).toString();
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
  multichainConversionRates: ReturnType<typeof selectMultichainConversionRates>,
  assetId: `${string}:${string}/${string}:${string}`,
) {
  if (!balance) {
    return undefined;
  }

  const assetMarketData = multichainConversionRates[assetId];

  if (!assetMarketData?.rate) {
    return undefined;
  }

  return (Number(balance.amount) * Number(assetMarketData.rate)).toString();
}
