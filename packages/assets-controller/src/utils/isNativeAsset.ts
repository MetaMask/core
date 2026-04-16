import { SPOT_PRICES_SUPPORT_INFO } from '@metamask/assets-controllers';
import { parseCaipAssetType } from '@metamask/utils';
import type { Caip19AssetId } from '../types';
import { ZERO_ADDRESS } from './constants';

export function isNativeAsset(assetId: Caip19AssetId): boolean {
  const { assetNamespace, assetReference } = parseCaipAssetType(assetId);

  // Consider all SLIP44 assets
  if (assetNamespace === 'slip44') {
    return true;
  }

  // Consider assets in the list of native assets
  if (
    Object.values(SPOT_PRICES_SUPPORT_INFO).some(
      (nativeAssetId) => nativeAssetId.toLowerCase() === assetId.toLowerCase(),
    )
  ) {
    return true;
  }

  // Consider assets with a zero address
  if (assetReference === ZERO_ADDRESS) {
    return true;
  }

  // Otherwise, not a native asset
  return false;
}
