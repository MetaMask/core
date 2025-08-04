import type { AccountGroupId } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { createSelector } from 'reselect';

import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { TokensControllerState } from '../TokensController';

export type AllAssets = {
  [accountGroupId: AccountGroupId]: GroupAssets;
};

export type GroupAssets = {
  [network: string]: SelectorAsset[];
};

export type SelectorAsset = {
  type: 'evm' | 'multichain';
  assetId: string;
  icon?: string;
  name: string;
  symbol: string;
  decimals: number;
};

const selectAllEvmTokens = (state: TokensControllerState) => state.allTokens;

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

export const selectAccountsMap = createSelector(
  [selectAccountTree, selectInternalAccounts],
  (accountTree, internalAccounts) => {
    const accountsMap: Record<string, AccountGroupId> = {};
    for (const { groups } of Object.values(accountTree.wallets)) {
      for (const { id: accountGroupId, accounts } of Object.values(groups)) {
        for (const accountId of accounts) {
          // TODO: We would not need internalAccounts if evmTokens state had the accountId
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

    console.log('XXXXX ACCOUNT MAP', accountsMap);

    return accountsMap;
  },
);

const selectAllEvmAssets = createSelector(
  [selectAccountsMap, selectAllEvmTokens],
  (accountsMap, evmTokens) => {
    const groupAssets: AllAssets = {};

    for (const [chainId, chainTokens] of Object.entries(evmTokens)) {
      for (const [accountAddress, addressTokens] of Object.entries(
        chainTokens,
      )) {
        for (const token of addressTokens) {
          const accountGroupId = accountsMap[accountAddress];
          if (!accountGroupId) {
            // TODO: This should not happen and we should warn
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
            // TODO: Consider if we should reuse existing types
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

    console.log('XXXXX EVMS', groupAssets);

    return groupAssets;
  },
);

const selectAllMultichainAssets = createSelector(
  [
    selectAccountsMap,
    selectAllMultichainTokens,
    selectAllMultichainAssetsMetadata,
  ],
  (accountsMap, multichainTokens, multichainAssetsMetadata) => {
    const groupAssets: AllAssets = {};

    for (const [accountId, accountAssets] of Object.entries(multichainTokens)) {
      for (const assetId of accountAssets) {
        // TODO: We need a way to extract the chainId that is safe (in case of multiple / characters)
        const [chainId, asset] = assetId.split('/');

        const accountGroupId = accountsMap[accountId];
        const assetMetadata = multichainAssetsMetadata[assetId];
        if (!accountGroupId || !assetMetadata) {
          // TODO: This should not happen and we should warn
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

        // TODO: We need fallbacks for name, symbol and decimals, since they seem to be optional
        groupChainAssets.push({
          // TODO: Consider if we should reuse existing types
          type: 'multichain',
          assetId,
          icon: assetMetadata.iconUrl,
          name: assetMetadata.name ?? assetMetadata.symbol ?? asset,
          symbol: assetMetadata.symbol ?? asset,
          decimals:
            assetMetadata.units.find(
              (unit) =>
                unit.name === assetMetadata.name &&
                unit.symbol === assetMetadata.symbol,
            )?.decimals ?? 0,
        });
      }
    }

    console.log('XXXXX MULTICHAIN', groupAssets);

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

    console.log('XXXXX ALL', groupAssets);

    return groupAssets;
  },
);

export const selectAllAssetsForSelectedAccountGroup = createSelector(
  [selectAllAssets, selectAccountTree],
  (groupAssets, accountTree) => {
    const { selectedAccountGroup } = accountTree;
    if (!selectedAccountGroup) {
      return {};
    }
    return groupAssets[selectedAccountGroup] || {};
  },
);
