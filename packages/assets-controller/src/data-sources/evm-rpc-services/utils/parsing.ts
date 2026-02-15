import type { Hex } from '@metamask/utils';

import type { ChainId } from '../types';

/**
 * Convert wei (decimal string) to human-readable amount with decimals, trim trailing zeros.
 *
 * @param weiStr - Balance in wei as decimal string.
 * @param decimals - Token decimals (e.g. 18).
 * @returns Human-readable amount string (e.g. "1.5").
 */
export function weiToHumanReadable(weiStr: string, decimals: number): string {
  const padded = weiStr.padStart(decimals + 1, '0');
  const len = padded.length;
  const intPart = padded.slice(0, len - decimals);
  const fracPart = padded.slice(len - decimals).replace(/0+$/u, '') || '0';
  return fracPart === '0' ? intPart : `${intPart}.${fracPart}`;
}

/**
 * Normalize chain ID to hex for contract lookup (e.g. eip155:1 -> 0x1).
 *
 * @param chainId - CAIP-2 or hex chain ID.
 * @returns Hex chain ID for contract map lookup.
 */
export function chainIdToHex(chainId: ChainId): Hex {
  if (typeof chainId === 'string' && chainId.startsWith('eip155:')) {
    const decimalPart = chainId.split(':')[1];
    const decimalValue = parseInt(decimalPart, 10);
    return `0x${decimalValue.toString(16)}`;
  }
  return chainId;
}
