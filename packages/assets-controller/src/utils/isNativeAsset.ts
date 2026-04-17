import { SPOT_PRICES_SUPPORT_INFO } from '@metamask/assets-controllers';
import { parseCaipAssetType } from '@metamask/utils';

import type { Caip19AssetId } from '../types';
import { ZERO_ADDRESS } from './constants';

export function isNativeAsset(assetId: Caip19AssetId): boolean {
  const { assetNamespace, assetReference } = parseCaipAssetType(assetId);

  // All SLIP44 assets are native assets
  if (assetNamespace === 'slip44') {
    return true;
  }

  // All assets in this list are native assets
  if (
    Object.values(SPOT_PRICES_SUPPORT_INFO).some(
      (nativeAssetId) => nativeAssetId.toLowerCase() === assetId.toLowerCase(),
    )
  ) {
    return true;
  }

  // ERC20 assets with a zero address are native assets
  if (assetNamespace === 'erc20' && assetReference === ZERO_ADDRESS) {
    return true;
  }

  // Not a native asset
  return false;
}
