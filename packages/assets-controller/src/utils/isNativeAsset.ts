import { parseCaipAssetType } from '@metamask/utils';
import type { Caip19AssetId } from '../types';
import { SPOT_PRICES_SUPPORT_INFO } from '@metamask/assets-controllers';

export function isNativeAsset(assetId: Caip19AssetId): boolean {
  const { assetNamespace } = parseCaipAssetType(assetId);
  if (assetNamespace === 'slip44') {
    return true;
  }

  return Object.values(SPOT_PRICES_SUPPORT_INFO).some(
    (nativeAssetId) => nativeAssetId.toLowerCase() === assetId.toLowerCase(),
  );
}
