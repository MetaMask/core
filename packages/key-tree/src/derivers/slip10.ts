import { concatBytes } from '@metamask/byte-utils';

import { BIP_32_HARDENED_OFFSET } from '../constants.js';
import type { SLIP10Node } from '../SLIP10Node.js';
import { numberToUint32 } from '../utils.js';
import type { DeriveChildKeyArgs } from './index.js';
import {
  generateEntropy,
  deriveChildKey as sharedDeriveChildKey,
} from './shared.js';
import type { DeriveNodeArgs } from './shared.js';

/**
 * Derive a SLIP-10 child key with a given path from a parent key.
 *
 * @param options - The options for deriving a child key.
 * @returns A tuple containing the derived private key, public key and chain
 * code.
 */
export async function deriveChildKey(
  options: DeriveChildKeyArgs,
): Promise<SLIP10Node> {
  return await sharedDeriveChildKey(options, handleError);
}

/**
 * Handle an error that occurs during SLIP-10 derivation.
 *
 * @param error - The error that occurred.
 * @param options - The options that were used for derivation.
 * @returns The new options to use for derivation.
 */
async function handleError(
  error: unknown,
  options: DeriveNodeArgs,
): Promise<DeriveNodeArgs> {
  const { curve, isHardened, childIndex, entropy, chainCode } = options;

  // `ed25519` keys are always valid, so this error should never be thrown. If
  // it is, we re-throw it.
  if (curve.name === 'ed25519') {
    throw error;
  }

  const actualChildIndex = isHardened
    ? childIndex + BIP_32_HARDENED_OFFSET
    : childIndex;

  // As per SLIP-10, if the resulting key is invalid, the new entropy is
  // generated as follows:
  // Key material (32 bytes), child chain code (32 bytes) =
  //   HMAC-SHA512(parent chain code, 0x01 || chain code from invalid key || index).
  const newEntropy = await generateEntropy({
    chainCode,
    extension: concatBytes([
      0x01,
      entropy.slice(32, 64),
      numberToUint32(actualChildIndex),
    ]),
  });

  return {
    ...options,
    entropy: newEntropy,
  };
}
