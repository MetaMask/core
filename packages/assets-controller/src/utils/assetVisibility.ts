import { parseCaipAssetType } from '@metamask/utils';

import { shouldSkipNativeForCaipChainId } from '../data-sources/evm-rpc-services/utils/assets.js';
import { isStakingContractAssetId } from '../data-sources/evm-rpc-services/utils/staking-contracts.js';
import { getDefaultTrackedAssetsForChain } from '../defaults.js';
import type {
  AccountId,
  AssetsControllerState,
  Caip19AssetId,
  ChainId,
} from '../types.js';

export type AssetVisibility = {
  /** CAIP-19 IDs (native, pins, default tracked). */
  visibleAssetIds: Caip19AssetId[];
  /** CAIP-19 IDs the user hid. */
  hiddenAssetIds: Caip19AssetId[];
};

export type GetAssetVisibility = (
  accountIds: AccountId[],
  chainIds: ChainId[],
) => AssetVisibility;

export type GetAssetVisibilityOptions = {
  state: AssetsControllerState;
  accountIds: AccountId[];
  chainIds: ChainId[];
  getNativeAssetForChain: (chainId: ChainId) => Caip19AssetId | undefined;
};

/**
 * Derive always-visible and explicitly-hidden assets for an account/chain
 * scope. Hidden preferences take precedence over native, pinned, and default
 * tracked status. Natives on chains with no native token (e.g. Tempo) are
 * omitted from `visibleAssetIds`.
 *
 * @param options - Visibility inputs.
 * @param options.state - Current AssetsController state.
 * @param options.accountIds - Accounts whose pins should be included.
 * @param options.chainIds - Chains to scope native, default, and hidden IDs.
 * @param options.getNativeAssetForChain - Resolves each chain's native ID;
 * returns `undefined` when the chain has no resolvable native.
 * @returns Deduplicated visible and hidden asset IDs.
 */
export function getAssetVisibility({
  state,
  accountIds,
  chainIds,
  getNativeAssetForChain,
}: GetAssetVisibilityOptions): AssetVisibility {
  const chainSet = new Set(chainIds);
  const hiddenByKey = collectHiddenAssets(state, chainSet);
  const visibleByKey = new Map<string, Caip19AssetId>();

  const addVisible = (assetId: Caip19AssetId): void => {
    const inScope = assetIdInScope(assetId, chainSet);
    if (
      !inScope ||
      hiddenByKey.has(inScope) ||
      isStakingContractAssetId(inScope)
    ) {
      return;
    }
    visibleByKey.set(inScope, inScope);
  };

  for (const chainId of chainIds) {
    try {
      if (!shouldSkipNativeForCaipChainId(chainId)) {
        const nativeAssetId = getNativeAssetForChain(chainId);
        if (nativeAssetId) {
          addVisible(nativeAssetId);
        }
      }
    } catch {
      // A missing native mapping must not prevent other visible assets.
    }
    for (const assetId of getDefaultTrackedAssetsForChain(chainId)) {
      addVisible(assetId);
    }
  }

  for (const accountId of accountIds) {
    for (const assetId of state.customAssets[accountId] ?? []) {
      addVisible(assetId);
    }
  }

  return {
    visibleAssetIds: [...visibleByKey.values()],
    hiddenAssetIds: [...hiddenByKey.values()],
  };
}

function collectHiddenAssets(
  state: AssetsControllerState,
  chainSet: Set<ChainId>,
): Map<string, Caip19AssetId> {
  const hiddenByKey = new Map<string, Caip19AssetId>();
  for (const [assetId, preferences] of Object.entries(state.assetPreferences)) {
    if (!preferences.hidden) {
      continue;
    }
    const inScope = assetIdInScope(assetId as Caip19AssetId, chainSet);
    if (inScope) {
      hiddenByKey.set(inScope, inScope);
    }
  }
  return hiddenByKey;
}

function assetIdInScope(
  assetId: Caip19AssetId,
  chainSet: Set<ChainId>,
): Caip19AssetId | undefined {
  try {
    const parsed = parseCaipAssetType(assetId);
    if (!chainSet.has(parsed.chainId)) {
      return undefined;
    }
    return assetId;
  } catch {
    return undefined;
  }
}
