import type { AccountGroupId } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { Hex } from '@metamask/utils';
import { createSelector } from 'reselect';

import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { Token } from '../TokenRatesController';
import type { TokensControllerState } from '../TokensController';

export type AllAssets = {
  [accountGroupId: AccountGroupId]: GroupAssets;
};

export type GroupAssets = {
  [network: string]: SelectorAsset[];
};

export type SelectorAsset = {
  // TODO: It's unclear whether this type will be needed, ideally the UI should not need to know about it
  type: 'evm' | 'multichain';
  // TODO: This is the address for evm tokens and the assetId for multichain tokens
  assetId: string;
  icon?: string;
  name: string;
  symbol: string;
  decimals: number;
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
  [selectAccountsToGroupIdMap, selectAllEvmTokens, selectIgnoredEvmTokens],
  (accountsMap, evmTokens, ignoredEvmTokens) => {
    const groupAssets: AllAssets = {};

    for (const [chainId, chainTokens] of Object.entries(evmTokens) as [
      Hex,
      { [key: string]: Token[] },
    ][]) {
      for (const [accountAddress, addressTokens] of Object.entries(
        chainTokens,
      )) {
        for (const token of addressTokens) {
          const accountGroupId = accountsMap[accountAddress];
          if (!accountGroupId) {
            // TODO: This should not happen and we should log an error
            continue;
          }

          if (
            ignoredEvmTokens[chainId]?.[accountAddress]?.includes(token.address)
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

          groupChainAssets.push({
            type: 'evm',
            assetId: token.address,
            icon: token.image,
            name: token.name ?? token.symbol,
            symbol: token.symbol,
            decimals: token.decimals,
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
  ],
  (accountsMap, multichainTokens, multichainAssetsMetadata) => {
    const groupAssets: AllAssets = {};

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
        });
      }
    }

    return groupAssets;
  },
);

export const selectAllAssets = createSelector(
  [selectAllEvmAssets, selectAllMultichainAssets],
  (evmAssets, multichainAssets) => {
    const groupAssets: AllAssets = {
      ...evmAssets,
    };

    for (const [accountGroupId, accountAssets] of Object.entries(
      multichainAssets,
    ) as [AccountGroupId, GroupAssets][]) {
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
