import {
  isCaipChainId,
  isStrictHexString,
  parseCaipChainId,
} from '@metamask/utils';
import type { CaipChainId, Hex } from '@metamask/utils';

import type { ChainId } from '../types';

/**
 * Convert wei to human-readable amount with decimals, trim trailing zeros.
 *
 * @param wei - Balance in wei as bigint or decimal string.
 * @param decimals - Token decimals (e.g. 18).
 * @returns Human-readable amount string (e.g. "1.5").
 */
export function weiToHumanReadable(
  wei: string | bigint,
  decimals: number,
): string {
  const weiStr = typeof wei === 'bigint' ? wei.toString() : wei;
  const padded = weiStr.padStart(decimals + 1, '0');
  const len = padded.length;
  const intPart = padded.slice(0, len - decimals);
  const fracPart = padded.slice(len - decimals).replace(/0+$/u, '') || '0';
  return fracPart === '0' ? intPart : `${intPart}.${fracPart}`;
}

/**
 * Normalize chain ID to hex for contract lookup (e.g. eip155:1 -> 0x1).
 * Uses @metamask/utils for CAIP parsing.
 *
 * @param chainId - CAIP-2 or hex chain ID.
 * @returns Hex chain ID for contract map lookup.
 */
export function chainIdToHex(chainId: ChainId | CaipChainId): Hex {
  if (isStrictHexString(chainId)) {
    return chainId;
  }
  if (isCaipChainId(chainId)) {
    const { reference } = parseCaipChainId(chainId);
    return `0x${parseInt(reference, 10).toString(16)}`;
  }
  return chainId;
}
