import { toChecksumAddress } from '@ethereumjs/util';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';
import { memoize } from 'lodash-es';

import type { Caip19AssetId } from '../types.js';

// Not exported by `lodash-es`.
type MemoizedFunction = Omit<ReturnType<typeof memoize>, never>;

/**
 * Normalizes a CAIP-19 asset ID by checksumming EVM addresses.
 * This ensures consistent asset IDs regardless of the data source format.
 *
 * For EVM ERC20 tokens (e.g., "eip155:1/erc20:0x..."), the address is checksummed.
 * All other asset types are returned unchanged.
 *
 * Results are memoized with lodash: repeated calls with the same ID (common after
 * the first pipeline pass, when IDs are already checksummed) skip re-parsing and
 * keccak256 checksum work.
 *
 * @param assetId - The CAIP-19 asset ID to normalize
 * @returns The normalized asset ID with checksummed address (for EVM tokens)
 */
export const normalizeAssetId: ((assetId: Caip19AssetId) => Caip19AssetId) &
  MemoizedFunction = memoize((assetId: Caip19AssetId): Caip19AssetId => {
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
});

/**
 * Normalize a CAIP-19 asset ID, returning the original on failure. Some
 * malformed IDs (e.g. an asset reference that fails address checksumming)
 * make {@link normalizeAssetId} throw; callers processing untrusted input
 * use this so one bad ID cannot abort a whole batch.
 *
 * @param assetId - The CAIP-19 asset ID to normalize.
 * @returns The normalized ID, or the original on failure.
 */
export function safeNormalizeAssetId(assetId: Caip19AssetId): Caip19AssetId {
  try {
    return normalizeAssetId(assetId);
  } catch {
    return assetId;
  }
}

/**
 * Clears the {@link normalizeAssetId} memoize cache. Exported for unit tests.
 */
export function clearNormalizeAssetIdCacheForTesting(): void {
  normalizeAssetId.cache.clear?.();
}
