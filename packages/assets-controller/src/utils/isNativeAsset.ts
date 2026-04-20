import { SPOT_PRICES_SUPPORT_INFO } from '@metamask/assets-controllers';
import { parseCaipAssetType } from '@metamask/utils';

import type { Caip19AssetId } from '../types';
import { ZERO_ADDRESS } from './constants';

/**
 * Determines whether the given CAIP-19 asset ID represents a native asset.
 *
 * When `knownNativeAssetIds` is provided (typically the set of values from the
 * QueryClient-cached native asset map), it is checked for membership instead of
 * scanning the SPOT_PRICES_SUPPORT_INFO constant. Heuristics (slip44 namespace,
 * zero-address ERC20) are always applied regardless.
 *
 * @param assetId - The CAIP-19 asset ID to check.
 * @param knownNativeAssetIds - Optional set of known native asset IDs
 * (lowercased) for O(1) lookup.
 * @returns True if the asset is native.
 */
export function isNativeAsset(
  assetId: Caip19AssetId,
  knownNativeAssetIds?: ReadonlySet<string>,
): boolean {
  const { assetNamespace, assetReference } = parseCaipAssetType(assetId);

  if (assetNamespace === 'slip44') {
    return true;
  }

  if (knownNativeAssetIds) {
    if (knownNativeAssetIds.has(assetId.toLowerCase())) {
      return true;
    }
  } else if (
    Object.values(SPOT_PRICES_SUPPORT_INFO).some(
      (nativeAssetId) => nativeAssetId.toLowerCase() === assetId.toLowerCase(),
    )
  ) {
    return true;
  }

  if (assetNamespace === 'erc20' && assetReference === ZERO_ADDRESS) {
    return true;
  }

  return false;
}
