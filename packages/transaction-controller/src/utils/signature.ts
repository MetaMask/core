import { verifyMessage } from '@ethersproject/wallet';
import type { Hex } from '@metamask/utils';
import { add0x, remove0x } from '@metamask/utils';

/**
 * Verify if the signature is the specified data signed by the specified public key.
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
  const joinedHex = add0x(data.map(remove0x).join(''));

  const actualPublicKey = verifyMessage(
    Buffer.from(joinedHex, 'hex'),
    signature,
  );

  return actualPublicKey.toLowerCase() === publicKey.toLowerCase();
}
