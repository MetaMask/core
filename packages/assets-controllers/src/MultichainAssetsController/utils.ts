import type { CaipAssetType, CaipChainId } from '@metamask/utils';

/**
 * Parses a CAIP-2 asset type into a CAIP-2 chain ID.
 *
 * @param asset - The CAIP-2 asset type to parse.
 * @returns The CAIP-2 chain ID.
 */
export function parseCaipAssetType(asset: CaipAssetType): CaipChainId {
  return asset.split('/')[0] as CaipChainId;
}
