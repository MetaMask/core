import type { CaipChainId, Hex } from '@metamask/utils';
import { parseCaipChainId, isCaipChainId } from '@metamask/utils';

import { toHex } from './util';

/**
 * Checks whether the given value is a valid CAIP chain ID string for Ethereum.
 *
 * @param caipChainId - The CAIP chain ID to check for safety.
 * @returns Whether the given CAIP chain ID is valid for Ethereum chains.
 */
export function isEthCaipChainId(
  caipChainId: unknown,
): caipChainId is CaipChainId {
  if (!isCaipChainId(caipChainId)) {
    return false;
  }
  const { namespace, reference } = parseCaipChainId(caipChainId);
  const chainId = parseInt(reference, 10);
  return namespace === 'eip155' && Number.isFinite(chainId);
}

/**
 * Creates a CaipChainId string that specifies an Ethereum chain.
 *
 * @param chainId - The chain ID in 0x prefixed hex or decimal string.
 * @returns a valid CAIP chain ID for an Ethereum chain.
 */
export function buildEthCaipChainId(chainId = ''): CaipChainId {
  const chainIdDecimal = chainId.startsWith('0x')
    ? parseInt(chainId, 16).toString(10)
    : chainId;

  if (Number.isNaN(parseInt(chainIdDecimal, 10))) {
    throw new Error(`Invalid chain ID "${chainId}"`);
  }
  return `eip155:${chainIdDecimal}` as CaipChainId;
}

/**
 * Parses an Ethereum CAIP chain ID into a decimal string.
 *
 * @param caipChainId - The Ethereum CAIP chain ID string.
 * @returns the chain ID as a decimal string.
 */
export function parseEthCaipChainId(caipChainId: CaipChainId): string {
  const { reference } = parseCaipChainId(caipChainId);
  return reference;
}

/**
 * Parses an Ethereum CAIP chain ID into a hex string.
 *
 * @param caipChainId - The Ethereum CAIP chain ID string.
 * @returns the chain ID as a hex string.
 */
export function parseEthCaipChainIdHex(caipChainId: CaipChainId): Hex {
  const { reference } = parseCaipChainId(caipChainId);
  return toHex(reference);
}

/**
 * Parses an Ethereum CAIP chain ID into an integer.
 *
 * @param caipChainId - The Ethereum CAIP chain ID string.
 * @returns the chain ID as an integer.
 */
export function parseEthCaipChainIdInt(caipChainId: CaipChainId): number {
  try {
    const { reference } = parseCaipChainId(caipChainId);
    return parseInt(reference, 10);
  } catch {
    return Number.NaN;
  }
}
