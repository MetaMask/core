import { toChecksumAddress } from '@ethereumjs/util';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

import type { Caip19AssetId } from './types';

/**
 * Normalizes a CAIP-19 asset ID by checksumming EVM addresses.
 * This ensures consistent asset IDs regardless of the data source format.
 *
 * For EVM ERC20 tokens (e.g., "eip155:1/erc20:0x..."), the address is checksummed.
 * All other asset types are returned unchanged.
 *
 * @param assetId - The CAIP-19 asset ID to normalize
 * @returns The normalized asset ID with checksummed address (for EVM tokens)
 */
export function normalizeAssetId(assetId: Caip19AssetId): Caip19AssetId {
  const parsed = parseCaipAssetType(assetId);
  const chainIdParsed = parseCaipChainId(parsed.chainId);

  // Only checksum EVM ERC20 addresses
  if (
    chainIdParsed.namespace === 'eip155' &&
    parsed.assetNamespace === 'erc20'
  ) {
    const checksummedAddress = toChecksumAddress(parsed.assetReference);
    return `${parsed.chainId}/${parsed.assetNamespace}:${checksummedAddress}` as Caip19AssetId;
  }

  return assetId;
}
