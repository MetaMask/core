import type { AccountGroupId } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { convertHexToDecimal } from '@metamask/controller-utils';
import { TrxScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkState } from '@metamask/network-controller';
import { hexToBigInt, hexToNumber, parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';
import { createSelector, weakMapMemoize } from 'reselect';
import { TokenRwaData } from 'src/token-service';

import {
  parseBalanceWithDecimals,
  stringifyBalanceWithDecimals,
} from './stringify-balance';
import type { CurrencyRateState } from '../CurrencyRateController';
import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { MultichainAssetsRatesControllerState } from '../MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from '../MultichainBalancesController';
import {
  getNativeTokenAddress,
  SPOT_PRICES_SUPPORT_INFO,
} from '../token-prices-service/codefi-v2';
import type { TokenBalancesControllerState } from '../TokenBalancesController';
import type { Token, TokenRatesControllerState } from '../TokenRatesController';
import type { TokensControllerState } from '../TokensController';

// Asset Tron Filters
export const TRON_RESOURCE = {
  ENERGY: 'energy',
  BANDWIDTH: 'bandwidth',
  MAX_ENERGY: 'max-energy',
  MAX_BANDWIDTH: 'max-bandwidth',
  STRX_ENERGY: 'strx-energy',
  STRX_BANDWIDTH: 'strx-bandwidth',
  TRX_READY_FOR_WITHDRAWAL: 'trx-ready-for-withdrawal',
  TRX_STAKING_REWARDS: 'trx-staking-rewards',
  TRX_IN_LOCK_PERIOD: 'trx-in-lock-period',
} as const;

export type TronResourceSymbol =
  (typeof TRON_RESOURCE)[keyof typeof TRON_RESOURCE];

export const TRON_RESOURCE_SYMBOLS = Object.values(
  TRON_RESOURCE,
) as readonly TronResourceSymbol[];

export const TRON_RESOURCE_SYMBOLS_SET: ReadonlySet<TronResourceSymbol> =
  new Set(TRON_RESOURCE_SYMBOLS);

export type AssetsByAccountGroup = {
  [accountGroupId: AccountGroupId]: AccountGroupAssets;
};

export type AccountGroupAssets = {
  [network: string]: Asset[];
};

type EvmAccountType = Extract<InternalAccount['type'], `eip155:${string}`>;
type MultichainAccountType = Exclude<
  InternalAccount['type'],
  `eip155:${string}`
>;

export type Asset = (
  | {
      accountType: EvmAccountType;
      address: Hex;
      chainId: Hex;
    }
  | {
      accountType: MultichainAccountType;
      address: CaipAssetType;
      chainId: CaipChainId;
    }
) & {
  assetId: CaipAssetType;
  accountId: string;
  image: string;
  name: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
  rawBalance: Hex;
  balance: string;
  fiat:
    | {
        balance: number;
        currency: string;
        conversionRate: number;
      }
    | undefined;
  rwaData?: TokenRwaData;
};

export type AssetListState = {
  accountTree: AccountTreeControllerState['accountTree'];
  selectedAccountGroup: AccountTreeControllerState['selectedAccountGroup'];
  internalAccounts: AccountsControllerState['internalAccounts'];
  allTokens: TokensControllerState['allTokens'];
  allIgnoredTokens: TokensControllerState['allIgnoredTokens'];
  tokenBalances: TokenBalancesControllerState['tokenBalances'];
  marketData: TokenRatesControllerState['marketData'];
  currencyRates: CurrencyRateState['currencyRates'];
  accountsAssets: MultichainAssetsControllerState['accountsAssets'];
  allIgnoredAssets: MultichainAssetsControllerState['allIgnoredAssets'];
  assetsMetadata: MultichainAssetsControllerState['assetsMetadata'];
  balances: MultichainBalancesControllerState['balances'];
  conversionRates: MultichainAssetsRatesControllerState['conversionRates'];
  currentCurrency: CurrencyRateState['currentCurrency'];
  networkConfigurationsByChainId: NetworkState['networkConfigurationsByChainId'];
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

export type AssetListRootSelectors<RootState> = {
  selectAccountTree: (state: RootState) => AssetListState['accountTree'];
  selectSelectedAccountGroup: (
    state: RootState,
  ) => AssetListState['selectedAccountGroup'];
  selectInternalAccounts: (
    state: RootState,
  ) => AssetListState['internalAccounts'];
  selectAllTokens: (state: RootState) => AssetListState['allTokens'];
  selectAllIgnoredTokens: (
    state: RootState,
  ) => AssetListState['allIgnoredTokens'];
  selectTokenBalances: (state: RootState) => AssetListState['tokenBalances'];
  selectMarketData: (state: RootState) => AssetListState['marketData'];
  selectCurrencyRates: (state: RootState) => AssetListState['currencyRates'];
  selectAccountsAssets: (state: RootState) => AssetListState['accountsAssets'];
  selectAllIgnoredAssets: (
    state: RootState,
  ) => AssetListState['allIgnoredAssets'];
  selectAssetsMetadata: (
    state: RootState,
  ) => AssetListState['assetsMetadata'];
  selectBalances: (state: RootState) => AssetListState['balances'];
  selectConversionRates: (
    state: RootState,
  ) => AssetListState['conversionRates'];
  selectCurrentCurrency: (
    state: RootState,
  ) => AssetListState['currentCurrency'];
  selectNetworkConfigurationsByChainId: (
    state: RootState,
  ) => AssetListState['networkConfigurationsByChainId'];
  selectAccountsByChainId: (
    state: RootState,
  ) => AssetListState['accountsByChainId'];
};

export type SelectAccountGroupAssetOpts = {
  filterTronStakedTokens: boolean;
};

const defaultSelectAccountGroupAssetOpts: SelectAccountGroupAssetOpts = {
  filterTronStakedTokens: true,
};

const filterTronStakedTokens = (
  assetsByAccountGroup: AccountGroupAssets,
): AccountGroupAssets => {
  const newAssetsByAccountGroup = { ...assetsByAccountGroup };

  Object.values(TrxScope).forEach((tronChainId) => {
    if (!newAssetsByAccountGroup[tronChainId]) {
      return;
    }

    newAssetsByAccountGroup[tronChainId] = newAssetsByAccountGroup[
      tronChainId
    ].filter((asset: Asset) => {
      if (
        asset.chainId.startsWith('tron:') &&
        TRON_RESOURCE_SYMBOLS_SET.has(
          asset.symbol?.toLowerCase() as TronResourceSymbol,
        )
      ) {
        return false;
      }
      return true;
    });
  });

  return newAssetsByAccountGroup;
};

/**
 * Builds the internal selector chain and returns a selector that computes
 * all assets grouped by account group.
 *
 * @param rootSelectors - Functions that extract each piece of AssetListState from the client's root state.
 * @returns A memoized selector `(state: RootState) => AssetsByAccountGroup`.
 */
export function createSelectAllAssets<RootState>(
  rootSelectors: AssetListRootSelectors<RootState>,
): (state: RootState) => AssetsByAccountGroup {
  const createTypedSelector = createSelector.withTypes<RootState>();

  const selectAccountsToGroupIdMap = createTypedSelector(
    [rootSelectors.selectAccountTree, rootSelectors.selectInternalAccounts],
    (accountTree, internalAccounts) => {
      const accountsMap: Record<
        string,
        {
          accountGroupId: AccountGroupId;
          type: InternalAccount['type'];
          accountId: string;
        }
      > = {};
      for (const { groups } of Object.values(accountTree.wallets)) {
        for (const { id: accountGroupId, accounts } of Object.values(groups)) {
          for (const accountId of accounts) {
            const internalAccount = internalAccounts.accounts[accountId];

            accountsMap[
              // TODO: We would not need internalAccounts if evmTokens state had the accountId
              internalAccount.type.startsWith('eip155')
                ? internalAccount.address
                : accountId
            ] = { accountGroupId, type: internalAccount.type, accountId };
          }
        }
      }

      return accountsMap;
    },
  );

  // TODO: This selector will not be needed once the native balances are part of the evm tokens state
  const selectAllEvmAccountNativeBalances = createTypedSelector(
    [
      selectAccountsToGroupIdMap,
      rootSelectors.selectAccountsByChainId,
      rootSelectors.selectMarketData,
      rootSelectors.selectCurrencyRates,
      rootSelectors.selectCurrentCurrency,
      rootSelectors.selectNetworkConfigurationsByChainId,
    ],
    (
      accountsMap,
      accountsByChainId,
      marketData,
      currencyRates,
      currentCurrency,
      networkConfigurationsByChainId,
    ) => {
      const groupAssets: AssetsByAccountGroup = {};

      for (const [chainId, chainAccounts] of Object.entries(
        accountsByChainId,
      ) as [Hex, Record<Hex, { balance: Hex | null }>][]) {
        for (const [accountAddress, accountBalance] of Object.entries(
          chainAccounts,
        )) {
          const account = accountsMap[accountAddress.toLowerCase()];
          if (!account) {
            continue;
          }

          const { accountGroupId, type, accountId } = account;

          groupAssets[accountGroupId] ??= {};
          groupAssets[accountGroupId][chainId] ??= [];
          const groupChainAssets = groupAssets[accountGroupId][chainId];

          // If a native balance is missing, we still want to show it as 0
          const rawBalance = accountBalance.balance ?? '0x0';

          const nativeCurrency =
            networkConfigurationsByChainId[chainId]?.nativeCurrency || 'NATIVE';

          const nativeToken = {
            address: getNativeTokenAddress(chainId),
            decimals: 18,
            name: nativeCurrency === 'ETH' ? 'Ethereum' : nativeCurrency,
            symbol: nativeCurrency,
            // This field need to be filled at client level for now
            image: '',
          };

          const fiatData = getFiatBalanceForEvmToken(
            rawBalance,
            nativeToken.decimals,
            marketData,
            currencyRates,
            chainId,
            nativeToken.address,
            nativeCurrency, // Pass native currency symbol for fallback when market data is missing
          );

          groupChainAssets.push({
            accountType: type as EvmAccountType,
            assetId:
              SPOT_PRICES_SUPPORT_INFO[
                chainId as keyof typeof SPOT_PRICES_SUPPORT_INFO
              ] ?? SPOT_PRICES_SUPPORT_INFO['0x1'],
            isNative: true,
            address: nativeToken.address,
            image: nativeToken.image,
            name: nativeToken.name,
            symbol: nativeToken.symbol,
            accountId,
            decimals: nativeToken.decimals,
            rawBalance,
            balance: stringifyBalanceWithDecimals(
              hexToBigInt(rawBalance),
              nativeToken.decimals,
            ),
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

  const selectAllEvmAssets = createTypedSelector(
    [
      selectAccountsToGroupIdMap,
      rootSelectors.selectAllTokens,
      rootSelectors.selectAllIgnoredTokens,
      rootSelectors.selectTokenBalances,
      rootSelectors.selectMarketData,
      rootSelectors.selectCurrencyRates,
      rootSelectors.selectCurrentCurrency,
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
            const account = accountsMap[accountAddress];
            if (!account) {
              continue;
            }

            const { accountGroupId, type, accountId } = account;

            if (
              ignoredEvmTokens[chainId]?.[accountAddress]?.includes(
                tokenAddress,
              )
            ) {
              continue;
            }

            const rawBalance =
              tokenBalances[accountAddress]?.[chainId]?.[tokenAddress];

            if (!rawBalance) {
              continue;
            }

            groupAssets[accountGroupId] ??= {};
            groupAssets[accountGroupId][chainId] ??= [];
            const groupChainAssets = groupAssets[accountGroupId][chainId];

            const fiatData = getFiatBalanceForEvmToken(
              rawBalance,
              token.decimals,
              marketData,
              currencyRates,
              chainId,
              tokenAddress,
            );

            groupChainAssets.push({
              accountType: type as EvmAccountType,
              assetId: `eip155:${hexToNumber(chainId)}/erc20:${tokenAddress.toLowerCase()}`,
              isNative: false,
              address: tokenAddress,
              image: token.image ?? '',
              name: token.name ?? token.symbol,
              symbol: token.symbol,
              accountId,
              decimals: token.decimals,
              rawBalance,
              balance: stringifyBalanceWithDecimals(
                hexToBigInt(rawBalance),
                token.decimals,
              ),
              fiat: fiatData
                ? {
                    balance: fiatData.balance,
                    currency: currentCurrency,
                    conversionRate: fiatData.conversionRate,
                  }
                : undefined,
              chainId,
              ...(token.rwaData && { rwaData: token.rwaData }),
            });
          }
        }
      }

      return groupAssets;
    },
  );

  const selectAllMultichainAssets = createTypedSelector(
    [
      selectAccountsToGroupIdMap,
      rootSelectors.selectAccountsAssets,
      rootSelectors.selectAllIgnoredAssets,
      rootSelectors.selectAssetsMetadata,
      rootSelectors.selectBalances,
      rootSelectors.selectConversionRates,
      rootSelectors.selectCurrentCurrency,
    ],
    (
      accountsMap,
      multichainTokens,
      ignoredMultichainAssets,
      multichainAssetsMetadata,
      multichainBalances,
      multichainConversionRates,
      currentCurrency,
    ) => {
      const groupAssets: AssetsByAccountGroup = {};

      for (const [accountId, accountAssets] of Object.entries(
        multichainTokens,
      )) {
        for (const assetId of accountAssets) {
          let caipAsset: ReturnType<typeof parseCaipAssetType>;
          try {
            caipAsset = parseCaipAssetType(assetId);
          } catch {
            // TODO: We should log this error when we have the ability to inject a logger from the client
            continue;
          }

          const { chainId } = caipAsset;
          const asset = `${caipAsset.assetNamespace}:${caipAsset.assetReference}`;

          const account = accountsMap[accountId];
          const assetMetadata = multichainAssetsMetadata[assetId];
          if (!account || !assetMetadata) {
            continue;
          }

          const { accountGroupId, type } = account;

          if (ignoredMultichainAssets?.[accountId]?.includes(assetId)) {
            continue;
          }

          groupAssets[accountGroupId] ??= {};
          groupAssets[accountGroupId][chainId] ??= [];
          const groupChainAssets = groupAssets[accountGroupId][chainId];

          const balance:
            | {
                amount: string;
                unit: string;
              }
            | undefined = multichainBalances[accountId]?.[assetId];

          const decimals = assetMetadata.units?.find(
            (unit) =>
              unit.name === assetMetadata.name &&
              unit.symbol === assetMetadata.symbol,
          )?.decimals;

          if (!balance || decimals === undefined) {
            continue;
          }

          const rawBalance = parseBalanceWithDecimals(balance.amount, decimals);

          if (!rawBalance) {
            continue;
          }

          const fiatData = getFiatBalanceForMultichainAsset(
            balance,
            multichainConversionRates,
            assetId,
          );

          // TODO: We shouldn't have to rely on fallbacks for name and symbol, they should not be optional
          groupChainAssets.push({
            accountType: type as MultichainAccountType,
            assetId,
            address: assetId,
            isNative: caipAsset.assetNamespace === 'slip44',
            image: assetMetadata.iconUrl,
            name: assetMetadata.name ?? assetMetadata.symbol ?? asset,
            symbol: assetMetadata.symbol ?? asset,
            accountId,
            decimals,
            rawBalance,
            balance: balance.amount,
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

  return createTypedSelector(
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
}

/**
 * Builds the internal selector chain and returns a selector that computes
 * assets for the currently selected account group.
 *
 * @param rootSelectors - Functions that extract each piece of AssetListState from the client's root state.
 * @returns A memoized selector `(state: RootState, opts?) => AccountGroupAssets`.
 */
export function createSelectAssetsBySelectedAccountGroup<RootState>(
  rootSelectors: AssetListRootSelectors<RootState>,
): (state: RootState, opts?: SelectAccountGroupAssetOpts) => AccountGroupAssets {
  const selectAllAssets = createSelectAllAssets(rootSelectors);
  const createTypedSelector = createSelector.withTypes<RootState>();

  return createTypedSelector(
    [
      selectAllAssets,
      rootSelectors.selectSelectedAccountGroup,
      (
        _state: RootState,
        opts: SelectAccountGroupAssetOpts = defaultSelectAccountGroupAssetOpts,
      ): SelectAccountGroupAssetOpts => opts,
    ],
    (groupAssets, selectedAccountGroup, opts) => {
      if (!selectedAccountGroup) {
        return {};
      }

      let result = groupAssets[selectedAccountGroup] || {};

      if (opts.filterTronStakedTokens) {
        result = filterTronStakedTokens(result);
      }

      return result;
    },
    {
      memoize: weakMapMemoize,
      argsMemoize: weakMapMemoize,
    },
  );
}

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
): void {
  for (const [accountGroupId, accountAssets] of Object.entries(newAssets) as [
    AccountGroupId,
    AccountGroupAssets,
  ][]) {
    const existingAccountGroupAssets = existingAssets[accountGroupId];

    if (existingAccountGroupAssets) {
      for (const [network, chainAssets] of Object.entries(accountAssets)) {
        existingAccountGroupAssets[network] ??= [];
        existingAccountGroupAssets[network].push(...chainAssets);
      }
    } else {
      existingAssets[accountGroupId] = {};
      for (const [network, chainAssets] of Object.entries(accountAssets)) {
        existingAssets[accountGroupId][network] = [...chainAssets];
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
 * @param nativeCurrencySymbol - The native currency symbol (e.g., 'ETH', 'BNB') - used for fallback when market data is missing for native tokens
 * @returns The price and currency of the token in the current currency. Returns undefined if the asset is not found in the market data or currency rates.
 */
function getFiatBalanceForEvmToken(
  rawBalance: Hex,
  decimals: number,
  marketData: TokenRatesControllerState['marketData'],
  currencyRates: CurrencyRateState['currencyRates'],
  chainId: Hex,
  tokenAddress: Hex,
  nativeCurrencySymbol?: string,
): { balance: number; conversionRate: number } | undefined {
  const tokenMarketData = marketData[chainId]?.[tokenAddress];

  // For native tokens: if no market data exists, use price=1 and look up currency rate directly
  // This is because native tokens are priced in themselves (1 ETH = 1 ETH)
  if (!tokenMarketData && nativeCurrencySymbol) {
    const currencyRate = currencyRates[nativeCurrencySymbol];

    if (!currencyRate?.conversionRate) {
      return undefined;
    }

    const fiatBalance =
      (convertHexToDecimal(rawBalance) / 10 ** decimals) *
      currencyRate.conversionRate;

    return {
      balance: fiatBalance,
      conversionRate: currencyRate.conversionRate,
    };
  }

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
 * @returns The price and currency of the token in the current currency. Returns undefined if the asset is not found in the conversion rates.
 */
function getFiatBalanceForMultichainAsset(
  balance: { amount: string; unit: string },
  multichainConversionRates: MultichainAssetsRatesControllerState['conversionRates'],
  assetId: `${string}:${string}/${string}:${string}`,
): { balance: number; conversionRate: number } | undefined {
  const assetMarketData = multichainConversionRates[assetId];

  if (!assetMarketData?.rate) {
    return undefined;
  }

  return {
    balance: Number(balance.amount) * Number(assetMarketData.rate),
    conversionRate: Number(assetMarketData.rate),
  };
}
