import { SPOT_PRICES_SUPPORT_INFO } from '@metamask/assets-controllers';
import { fetchWithErrorHandling } from '@metamask/controller-utils';
import { isCaipAssetType, parseCaipAssetType } from '@metamask/utils';

import type { Caip19AssetId, ChainId } from '../types.js';
import { ZERO_ADDRESS } from './constants.js';
import { normalizeAssetId } from './normalizeAssetId.js';

const CHAINID_NETWORK_URL = 'https://chainid.network/chains.json';

type ChainIdNetworkEntry = {
  chainId: number;
  slip44?: number;
};

/**
 * Builds a native asset map from the hardcoded SPOT_PRICES_SUPPORT_INFO constant.
 *
 * @returns A record mapping CAIP-2 chain IDs to their CAIP-19 native asset IDs.
 */
export function buildNativeAssetsFromConstant(): Record<
  ChainId,
  Caip19AssetId
> {
  const nativeAssetsMap: Record<ChainId, Caip19AssetId> = {};
  for (const nativeAssetId of Object.values(SPOT_PRICES_SUPPORT_INFO)) {
    const { chainId } = parseCaipAssetType(nativeAssetId);
    nativeAssetsMap[chainId] = normalizeAssetId(nativeAssetId);
  }
  return nativeAssetsMap;
}

const KNOWN_NATIVE_ASSET_IDS: ReadonlySet<string> = new Set(
  Object.values(buildNativeAssetsFromConstant()).map((assetId) =>
    assetId.toLowerCase(),
  ),
);

/**
 * Whether a CAIP-19 asset ID represents a chain's native asset — via the
 * `slip44` namespace, the zero-address ERC-20 convention, or the hardcoded
 * native asset registry (non-standard natives like METIS/MNT).
 *
 * @param assetId - The asset ID to check (any casing); malformed IDs are
 * reported as non-native.
 * @returns True when the asset ID is a native asset.
 */
export function isNativeAssetId(assetId: string): boolean {
  if (KNOWN_NATIVE_ASSET_IDS.has(assetId.toLowerCase())) {
    return true;
  }
  if (!isCaipAssetType(assetId)) {
    return false;
  }

  const { assetNamespace, assetReference } = parseCaipAssetType(assetId);
  return (
    assetNamespace === 'slip44' ||
    (assetNamespace === 'erc20' &&
      assetReference.toLowerCase() === ZERO_ADDRESS)
  );
}

/**
 * Fetches chain data from chainid.network and merges it with the seed
 * native asset map built from {@link buildNativeAssetsFromConstant}.
 *
 * Remote entries only fill gaps — chains already present in the seed map
 * are never overwritten. Invalid entries (missing/negative chainId or slip44)
 * are silently skipped.
 *
 * @returns The merged native asset map.
 */
export async function buildNativeAssetsFromApi(): Promise<
  Record<ChainId, Caip19AssetId>
> {
  const nativeAssetsMap = buildNativeAssetsFromConstant();

  try {
    const chains: ChainIdNetworkEntry[] | undefined =
      await fetchWithErrorHandling({
        url: CHAINID_NETWORK_URL,
        timeout: 10_000,
      });

    if (chains && Array.isArray(chains)) {
      for (const chain of chains) {
        if (
          !chain.chainId ||
          !chain.slip44 ||
          !Number.isInteger(chain.chainId) ||
          chain.chainId < 1 ||
          !Number.isInteger(chain.slip44) ||
          chain.slip44 < 1
        ) {
          continue;
        }

        const caipChainId = `eip155:${chain.chainId}` as ChainId;
        if (!nativeAssetsMap[caipChainId]) {
          nativeAssetsMap[caipChainId] =
            `eip155:${chain.chainId}/slip44:${chain.slip44}` as Caip19AssetId;
        }
      }
    }
  } catch {
    // Non-fatal: caller should fall back to the seed map.
  }

  return nativeAssetsMap;
}
