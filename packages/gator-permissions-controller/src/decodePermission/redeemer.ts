import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { getByteLength } from './utils';

/**
 * Decodes {@link https://github.com/MetaMask/delegation-framework/blob/main/src/enforcers/RedeemerEnforcer.sol RedeemerEnforcer}
 * caveat terms: concatenated 20-byte Ethereum addresses (no ABI header).
 *
 * @param terms - Hex-encoded packed addresses from the caveat.
 * @returns Checksummed redeemer addresses.
 */
export function decodeRedeemerEnforcerTerms(terms: Hex): Hex[] {
  if (terms === '0x') {
    throw new Error('Invalid redeemer enforcer terms: empty payload');
  }

  const byteLength = getByteLength(terms);

  if (byteLength % 20 !== 0) {
    throw new Error(
      'Invalid redeemer enforcer terms: length must be a multiple of 20 bytes',
    );
  }

  const addresses: Hex[] = [];
  const body = terms.slice(2);

  for (let i = 0; i < body.length; i += 40) {
    const slice = body.slice(i, i + 40);
    addresses.push(getChecksumAddress(`0x${slice}`));
  }

  return addresses;
}
