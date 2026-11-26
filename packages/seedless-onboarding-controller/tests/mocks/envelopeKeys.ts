import type { EnvelopeKeys, KeyPair } from '@metamask/toprf-secure-backup';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToNumberBE } from '@noble/curves/utils';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

import { derivePubKey } from '../../src/envelope/envelope-keys.js';

/**
 * Derive a secp256k1 key pair from 32 bytes, the way the TOPRF SDK derives
 * its authentication key pair.
 *
 * @param bytes - The 32 input bytes.
 * @returns The key pair.
 */
export function deriveKeyPair(bytes: Uint8Array): KeyPair {
  const sk = bytesToNumberBE(bytes) % secp256k1.Point.Fn.ORDER;
  return { sk, pk: derivePubKey(sk) };
}

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
