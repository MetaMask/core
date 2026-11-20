import type { EnvelopeKeys } from '@metamask/toprf-secure-backup';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

import { deriveKeyPair } from '../../src/envelope/envelope-keys.js';

/**
 * Derives the envelope keys of a TOPRF seed the way `@metamask/toprf-secure-backup`
 * does. Mocked `recoverEncKey` and `createLocalKey` results use it, so envelopes
 * sealed in the tests open with the keys the controller receives.
 *
 * @param seed - The TOPRF seed.
 * @returns The envelope keys.
 */
export function deriveTestEnvelopeKeys(seed: Uint8Array): EnvelopeKeys {
  return {
    authKeyPair: deriveKeyPair(
      hkdf(sha256, seed, undefined, 'mm-envelope-v1/auth', 32),
    ),
    wrapKey: hkdf(sha256, seed, undefined, 'mm-envelope-v1/wrap', 32),
  };
}
