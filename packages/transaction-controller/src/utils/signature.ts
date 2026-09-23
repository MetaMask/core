import { verifyMessage } from '@ethersproject/wallet';
import type { Hex } from '@metamask/utils';
import { add0x, hexToBytes, remove0x } from '@metamask/utils';

/**
 * Maximum number of cached signature verification results.
 *
 * Sized well above the expected working set (one entry per signed contract per
 * chain in the EIP-7702 feature flag) so the cache never evicts in practice,
 * while still bounding memory if the flag data ever grows unexpectedly.
 */
export const MAX_CACHE_SIZE = 1000;

/**
 * Cache of signature verification results, keyed by data, signature, and
 * public key.
 *
 * Verification is a pure function of those three inputs, so a cached result can
 * never become stale and requires no invalidation. New feature flag data simply
 * produces new keys.
 */
const verificationCache = new Map<string, boolean>();

/**
 * Verify if the signature is the specified data signed by the specified public key.
 *
 * Results are memoized as the underlying elliptic curve recovery is expensive
 * and is otherwise repeated for identical inputs on hot paths.
 *
 * @param data - The data to check.
 * @param signature - The signature to check.
 * @param publicKey - The public key to check.
 * @returns True if the signature is correct, false otherwise.
 */
export function isValidSignature(
  data: Hex[],
  signature: Hex,
  publicKey: Hex,
): boolean {
  const cacheKey = `${data.join(',')}:${signature}:${publicKey}`;
  const cachedResult = verificationCache.get(cacheKey);

  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const result = verifySignature(data, signature, publicKey);

  if (verificationCache.size >= MAX_CACHE_SIZE) {
    verificationCache.clear();
  }

  verificationCache.set(cacheKey, result);

  return result;
}

/**
 * Clear the signature verification cache.
 *
 * Intended for tests only, as cached results can never become stale.
 */
export function clearSignatureCache(): void {
  verificationCache.clear();
}

/**
 * Verify if the signature is the specified data signed by the specified public key.
 *
 * @param data - The data to check.
 * @param signature - The signature to check.
 * @param publicKey - The public key to check.
 * @returns True if the signature is correct, false otherwise.
 */
function verifySignature(data: Hex[], signature: Hex, publicKey: Hex): boolean {
  try {
    const joinedHex = add0x(data.map(remove0x).join(''));
    const dataBytes = hexToBytes(joinedHex);
    const actualPublicKey = verifyMessage(dataBytes, signature);

    return actualPublicKey.toLowerCase() === publicKey.toLowerCase();
  } catch {
    return false;
  }
}
