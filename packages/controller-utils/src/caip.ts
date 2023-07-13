import {
  CaipChainId,
  getCaipChainIdString,
  parseCaipChainIdString,
  isCaipChainIdString,
  Hex,
} from '@metamask/utils';

/**
 * Checks whether the given value is a valid caip chain id string for Ethereum.
 *
 * @param caipChainId - The caip chain ID to check for safety.
 * @returns Whether the given caip chain ID is valid for Ethereum chains.
 */
export function isEthCaipChainId(caipChainId: CaipChainId): boolean {
  if (!isCaipChainIdString(caipChainId)) {
    return false;
  }
  const { namespace } = parseCaipChainIdString(caipChainId);
  return namespace === 'eip155';
}

/**
 * Generates a caip chain ID that specifies an Ethereum chain.
 *
 * @param ethChainId - The eth chain ID in 0x prefixed hex or decimal string.
 * @returns a valid caip chain ID for an Ethereum chain.
 */
export function getCaipChainIdFromEthChainId(ethChainId: string): string {
  const chainIdDecimal = ethChainId.startsWith('0x') // need to handle 0X?
    ? parseInt(ethChainId, 16).toString(10)
    : ethChainId;

  if (Number.isNaN(parseInt(chainIdDecimal, 10))) {
    return '';
  }
  return getCaipChainIdString('eip155', chainIdDecimal);
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
  const { reference } = parseCaipChainIdString(caipChainId);
  return reference;
}

/**
 * Gets the hex chain id from an ethereum caip chain id string.
 *
 * @param caipChainId - The eth caip chain ID string.
 * @returns a hex string for the eth chain id.
 */
export function getEthChainIdHexFromCaipChainId(caipChainId: CaipChainId): Hex {
  const { reference } = parseCaipChainIdString(caipChainId);
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
  const { reference } = parseCaipChainIdString(caipChainId);
  return parseInt(reference, 10);
}
