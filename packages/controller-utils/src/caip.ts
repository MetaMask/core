import type { CaipChainId, Hex } from '@metamask/utils';
import {
  parseCaipChainId,
  isCaipChainId,
} from '@metamask/utils';

/**
 * Checks whether the given value is a valid caip chain id string for Ethereum.
 *
 * @param caipChainId - The caip chain ID to check for safety.
 * @returns Whether the given caip chain ID is valid for Ethereum chains.
 */
export function isEthCaipChainId(caipChainId: unknown): caipChainId is CaipChainId {
  if (!isCaipChainId(caipChainId)) {
    return false;
  }
  const { namespace, reference } = parseCaipChainId(caipChainId);
  const chainId = parseInt(reference, 10)
  return namespace === 'eip155' && Number.isFinite(chainId);
}

/**
 * Generates a caip chain ID that specifies an Ethereum chain.
 *
 * @param ethChainId - The eth chain ID in 0x prefixed hex or decimal string.
 * @returns a valid caip chain ID for an Ethereum chain.
 */
export function getCaipChainIdFromEthChainId(ethChainId: string = ""): CaipChainId {
  const chainIdDecimal = ethChainId.startsWith('0x') // need to handle 0X?
    ? parseInt(ethChainId, 16).toString(10)
    : ethChainId;

  if (Number.isNaN(parseInt(chainIdDecimal, 10))) {
    return 'eip155:0'; // does this make sense?
  }
  return `eip155:${chainIdDecimal}` as CaipChainId;
}

/**
 * Gets the decimal chain id from an ethereum caip chain id string.
 *
 * @param caipChainId - The eth caip chain ID string.
 * @returns a decimal string for the eth chain id.
 */
export function getEthChainIdDecFromCaipChainId(
  caipChainId: CaipChainId,
): string {
  const { reference } = parseCaipChainId(caipChainId);
  return reference;
}

/**
 * Gets the hex chain id from an ethereum caip chain id string.
 *
 * @param caipChainId - The eth caip chain ID string.
 * @returns a hex string for the eth chain id.
 */
export function getEthChainIdHexFromCaipChainId(caipChainId: CaipChainId): Hex {
  const { reference } = parseCaipChainId(caipChainId);
  return `0x${parseInt(reference, 10).toString(16)}`;
}

/**
 * Gets the hex chain id from an ethereum caip chain id string.
 *
 * @param caipChainId - The eth caip chain ID string.
 * @returns an integer for the eth chain id.
 */
export function getEthChainIdIntFromCaipChainId(
  caipChainId: CaipChainId,
): number {
  const { reference } = parseCaipChainId(caipChainId);
  return parseInt(reference, 10);
}
