import {
  isCaipChainId,
  isStrictHexString,
  numberToHex,
  parseCaipChainId,
} from '@metamask/utils';
import type { CaipChainId, Hex } from '@metamask/utils';
import BigNumberJS from 'bignumber.js';

import type { ChainId } from '../types';

/**
 * Convert wei to human-readable amount with decimals, trim trailing zeros.
 * Uses BigNumber for precision.
 *
 * Note: `.shiftedBy(-decimals).toFixed()` (no args) rounds to DECIMAL_PLACES (0
 * by default in bignumber.js), producing integers (e.g. 1.5 ETH → "2").
 * We use `.toFixed(decimals)` to preserve fractional precision, then trim
 * trailing zeros so the result is e.g. "1.5" instead of "1.500000000000000000".
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
  const fixed = new BigNumberJS(weiStr).shiftedBy(-decimals).toFixed(decimals);
  const trimmed = fixed.replace(/\.?0+$/u, '');
  return trimmed === '' ? '0' : trimmed;
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
    return numberToHex(parseInt(reference, 10));
  }
  return chainId;
}
