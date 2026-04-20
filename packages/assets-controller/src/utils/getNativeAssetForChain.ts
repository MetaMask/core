import { SPOT_PRICES_SUPPORT_INFO } from '@metamask/assets-controllers';
import {
  Hex,
  isCaipChainId,
  isHexString,
  numberToHex,
  parseCaipChainId,
} from '@metamask/utils';

import type { Caip19AssetId } from '../types';

/**
 * Returns the native asset ID (CAIP-19) for a given chain.
 *
 * When `knownNativeAssets` is provided (a CAIP-2 chain ID to CAIP-19 map,
 * typically read from the QueryClient cache), the lookup uses that map.
 * Otherwise falls back to the hardcoded SPOT_PRICES_SUPPORT_INFO constant.
 *
 * @param chainId - A chain ID in CAIP-2 or hex format.
 * @param knownNativeAssets - Optional map of CAIP-2 chain IDs to CAIP-19
 * native asset IDs (e.g. from the QueryClient cache).
 * @returns The CAIP-19 native asset ID (e.g., "eip155:1/slip44:60"), or
 * undefined if the chain has no known native asset mapping.
 */
export function getNativeAssetForChain(
  chainId: string,
  knownNativeAssets?: Record<string, string>,
): Caip19AssetId | undefined {
  let hexChainId: Hex | undefined;
  let caipChainId: string | undefined;

  if (isCaipChainId(chainId)) {
    const { namespace, reference } = parseCaipChainId(chainId);
    if (namespace === 'eip155') {
      hexChainId = numberToHex(parseInt(reference, 10));
      caipChainId = chainId;
    } else {
      return undefined;
    }
  } else if (isHexString(chainId)) {
    hexChainId = chainId as Hex;
  } else {
    return undefined;
  }

  if (knownNativeAssets && caipChainId) {
    const cached = knownNativeAssets[caipChainId];
    if (cached) {
      return cached as Caip19AssetId;
    }
  }

  if (hexChainId) {
    return SPOT_PRICES_SUPPORT_INFO[
      hexChainId as keyof typeof SPOT_PRICES_SUPPORT_INFO
    ];
  }

  return undefined;
}
