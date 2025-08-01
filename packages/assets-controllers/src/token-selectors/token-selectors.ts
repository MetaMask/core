import type { AccountGroupId } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { createSelector } from 'reselect';

import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { TokensControllerState } from '../TokensController';

export type GroupAssets = {
  [accountGroupId: AccountGroupId]: {
    [network: string]: Asset[];
  };
};

export type Asset = {
  type: 'evm' | 'multichain';
  assetId: string;
  iconUrl?: string;
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

export const selectAllAssets = createSelector(
  [
    selectAllEvmTokens,
    selectAllMultichainTokens,
    selectAllMultichainAssetsMetadata,
    selectAccountTree,
    selectInternalAccounts,
  ],
  (
    evmTokens,
    multichainTokens,
    multichainAssetsMetadata,
    accountTree,
    internalAccounts,
  ) => {
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

    const groupAssets: GroupAssets = {};

    for (const [chainId, chainTokens] of Object.entries(evmTokens)) {
      for (const addressTokens of Object.values(chainTokens)) {
        for (const token of addressTokens) {
          const accountGroupId = accountsMap[token.address];
          if (!accountGroupId) {
            // TODO: This should not happen and we should warn
            continue;
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
            iconUrl: token.image,
            name: token.name ?? token.symbol,
            symbol: token.symbol,
            decimals: token.decimals,
          });
        }
      }
    }

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
          iconUrl: assetMetadata.iconUrl,
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

    return groupAssets;
  },
);
