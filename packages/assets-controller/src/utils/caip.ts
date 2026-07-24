import {
  isCaipChainId,
  KnownCaipNamespace,
  toCaipChainId,
} from '@metamask/utils';

import type { ChainId } from '../types.js';

/**
 * Convert a decimal chain ID to a CAIP chain ID.
 *
 * Handles both decimal numbers and already-formatted CAIP chain IDs.
 *
 * @param decimalChainId - The decimal chain ID to convert to a CAIP chain ID.
 * @returns The CAIP chain ID.
 */
export function decimalToChainId(decimalChainId: number | string): ChainId {
  // Handle both decimal numbers and already-formatted CAIP chain IDs
  if (typeof decimalChainId === 'string') {
    if (isCaipChainId(decimalChainId)) {
      return decimalChainId;
    }
    return toCaipChainId(KnownCaipNamespace.Eip155, decimalChainId);
  }
  return toCaipChainId(KnownCaipNamespace.Eip155, String(decimalChainId));
}
